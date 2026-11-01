#!/usr/bin/env bash
# Runs every Maestro flow against a built app on a running Android emulator (BUILD_PLAN M16c). Used by
# .github/workflows/mobile-e2e.yml, and runnable by hand with the same stack the README describes.
#
# It starts the website (a production build, `next start`) and the test helper itself, and runs the flows in four phases,
# because some flows need the website or the phone in a different mode:
#   normal   every flow without a tag
#   cohort   website restarted with COHORT_RELEASE=on          (flows tagged `cohort`)
#   upgrade  website restarted with MIN_APP_VERSION=9.0.0     (flows tagged `upgrade`)
#   dark     the emulator switched to night mode              (flows tagged `dark`)
# A failing phase does not stop the next one; the script exits 1 if any phase failed.
#
# Needs: adb and maestro on PATH, an emulator already booted, the app built (APK below), `npm run build` done at the repo root,
# and DATABASE_URL, DIRECT_URL and the other website variables set to a LOCAL, throw-away database (the helper refuses anything else).
#
# Settings (all optional):
#   PHASES        which phases to run, default "normal cohort upgrade dark"
#   FLOWS_ONLY    one flow file to run instead of the phases (for trying the stack): FLOWS_ONLY=mobile/maestro/flows/05_wave_with_note.yaml
#   MAESTRO_OUT   where results go, default ./maestro-results
#   APK           the built app, default mobile/android/app/build/outputs/apk/release/app-release.apk
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT="${MAESTRO_OUT:-$ROOT/maestro-results}"
APK="${APK:-mobile/android/app/build/outputs/apk/release/app-release.apk}"
PHASES="${PHASES:-normal cohort upgrade dark}"
FLOWS="mobile/maestro/flows"
mkdir -p "$OUT"

# Local storage only: an empty secret key and a URL that is never contacted (see CLAUDE.md, "Local test runs write to the REAL Supabase Storage").
export SUPABASE_SECRET_KEY=""
export NEXT_PUBLIC_SUPABASE_URL="http://localhost:54321"
# Local email only: the sign-in codes must go to the dev outbox file, never to a real address. `next start` also reads
# .env.production.local, which on the owner's computer holds the production email key; an empty value set here wins over any file.
export RESEND_API_KEY=""
# No real push either: with the private key empty, sending a push only writes to the local log.
export VAPID_PRIVATE_KEY=""
# Git Bash rewrites paths like /sdcard/... into Windows paths; this switches that off (it does nothing on Linux).
export MSYS_NO_PATHCONV=1
export HELPER_PORT="${HELPER_PORT:-3999}"

WEB_PID=""
HELPER_PID=""

log() { printf '\n== %s\n' "$*"; }

stop_web() {
  if [ -n "$WEB_PID" ]; then
    kill "$WEB_PID" 2>/dev/null
    wait "$WEB_PID" 2>/dev/null
    WEB_PID=""
  fi
}

cleanup() {
  stop_web
  if [ -n "$HELPER_PID" ]; then kill "$HELPER_PID" 2>/dev/null; HELPER_PID=""; fi
  adb shell cmd uimode night no >/dev/null 2>&1
}
trap cleanup EXIT

# start_web [VAR=value ...]: starts the website with those extra settings and waits until it answers. The storage probe must say 401
# (local storage); a 404 would mean real storage is configured, and then nothing may run.
start_web() {
  stop_web
  # COHORT_RELEASE=off is the default for every phase (a local .env.production.local may turn it on); the cohort phase passes COHORT_RELEASE=on after it.
  env COHORT_RELEASE=off "$@" node node_modules/next/dist/bin/next start -p 3000 >>"$OUT/website.log" 2>&1 &
  WEB_PID=$!
  local code="000"
  for _ in $(seq 1 60); do
    code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' http://localhost:3000/api/dev-storage/profile-photos/x || true)"
    [ "$code" != "000" ] && break
    sleep 2
  done
  if [ "$code" != "401" ]; then
    echo "The website did not come up in local-storage mode (storage probe answered $code). Stopping." >&2
    return 1
  fi
}

start_helper() {
  node mobile/maestro/helper.mjs >>"$OUT/helper.log" 2>&1 &
  HELPER_PID=$!
  for _ in $(seq 1 30); do
    curl -s -m 2 "http://127.0.0.1:${HELPER_PORT}/health" | grep -q '"ok":true' && return 0
    sleep 1
  done
  echo "The test helper did not start. See $OUT/helper.log." >&2
  return 1
}

# diagnose NAME: prints what is needed to find out why a phase failed, into the job log itself (the artifact is easy to miss).
diagnose() {
  echo "---- diagnostics after phase $1 ----"
  echo "-- can the phone reach the website? (10.0.2.2:3000, from inside the emulator)"
  adb shell "echo 'GET /api/dev-storage/profile-photos/x HTTP/1.0\r\n\r\n' | toybox nc -w 5 10.0.2.2 3000 | head -n 1" 2>&1 | head -n 3
  echo "-- website answers on this machine:"
  curl -s -o /dev/null -m 5 -w '%{http_code}\n' http://localhost:3000/api/dev-storage/profile-photos/x
  echo "-- the app's process and last errors (logcat):"
  adb shell pidof tech.overlaps.app || echo "app is not running"
  adb logcat -d -t 400 2>/dev/null | grep -E "AndroidRuntime|FATAL|ReactNativeJS|tech.overlaps.app|Network request failed" | tail -n 40
  echo "-- website log (tail):"
  tail -n 40 "$OUT/website.log" 2>/dev/null
  echo "-- screen:"
  adb exec-out screencap -p > "$OUT/screen-after-$1.png" 2>/dev/null
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb shell cat /sdcard/ui.xml | grep -o 'text="[^"]\+"' | head -n 20
  echo "---- end diagnostics ----"
}

FAILED=""
# run_phase NAME ARGS...: runs maestro over the flows folder with the given tag filters and records whether it passed.
run_phase() {
  local name="$1"; shift
  log "phase: $name"
  if maestro test --test-output-dir="$OUT/$name" --format junit --output "$OUT/$name.xml" "$@" "$FLOWS"; then
    echo "phase $name: passed"
  else
    echo "phase $name: FAILED"
    FAILED="$FAILED $name"
    diagnose "$name"
  fi
}

log "installing the app"
adb install -r "$APK" || { echo "could not install $APK" >&2; exit 1; }

# A slow (CI) emulator can still be busy after boot: Android's own UI may freeze ("System UI isn't responding") and the app
# then never draws. Wait for the boot to finish, start the app once and time how long its first screen takes, tapping "Wait"
# on an ANR dialog. This also warms the app up, and prints a number to read in the job log.
warm_up() {
  log "warming up the phone"
  until [ "$(adb shell getprop sys.boot_completed | tr -d '')" = "1" ]; do sleep 2; done
  sleep 20
  adb shell am start -n tech.overlaps.app/.MainActivity >/dev/null 2>&1 || adb shell monkey -p tech.overlaps.app -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  local start=$SECONDS xml wait_bounds
  while [ $((SECONDS - start)) -lt 120 ]; do
    adb shell uiautomator dump /sdcard/warm.xml >/dev/null 2>&1
    xml="$(adb shell cat /sdcard/warm.xml 2>/dev/null)"
    if echo "$xml" | grep -q 'package="tech.overlaps.app"'; then echo "first screen drawn after $((SECONDS - start)) s"; adb shell am force-stop tech.overlaps.app; return 0; fi
    wait_bounds="$(echo "$xml" | grep -o 'text="Wait"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | head -n 1)"
    if [ -n "$wait_bounds" ]; then
      echo "a 'not responding' dialog is up; tapping Wait"
      adb shell input tap $(echo "$wait_bounds" | sed 's/\]\[/,/; s/[][]//g' | awk -F, '{printf "%d %d", ($1+$3)/2, ($2+$4)/2}') >/dev/null 2>&1
    fi
    sleep 3
  done
  echo "the first screen did NOT draw within 120 s"
  adb shell am force-stop tech.overlaps.app
  return 1
}
warm_up || diagnose warm-up

# A few pictures for the flow that picks photos from the phone's own picker (the picker lists what is in the media store).
log "putting test pictures on the phone"
for i in 1 2 3 4; do
  adb push e2e/fixtures/photo-with-exif.jpg "/sdcard/Pictures/maestro-photo-$i.jpg" >/dev/null
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/maestro-photo-$i.jpg" >/dev/null
done

log "starting the test helper"
start_helper || exit 1

if [ -n "${FLOWS_ONLY:-}" ]; then
  log "starting the website"
  start_web || exit 1
  if maestro test --test-output-dir="$OUT/only" --format junit --output "$OUT/only.xml" "$FLOWS_ONLY"; then echo "passed"; exit 0; else echo "FAILED"; diagnose only; exit 1; fi
fi

for phase in $PHASES; do
  case "$phase" in
    normal)
      log "starting the website (normal)"
      start_web || { FAILED="$FAILED normal"; continue; }
      run_phase normal --exclude-tags=cohort,upgrade,dark
      ;;
    cohort)
      log "starting the website (cohort release on)"
      start_web COHORT_RELEASE=on || { FAILED="$FAILED cohort"; continue; }
      run_phase cohort --include-tags=cohort
      ;;
    upgrade)
      log "starting the website (minimum app version raised)"
      start_web MIN_APP_VERSION=9.0.0 || { FAILED="$FAILED upgrade"; continue; }
      run_phase upgrade --include-tags=upgrade
      ;;
    dark)
      log "starting the website (normal) and switching the phone to night mode"
      start_web || { FAILED="$FAILED dark"; continue; }
      adb shell cmd uimode night yes
      run_phase dark --include-tags=dark
      adb shell cmd uimode night no
      ;;
    *) echo "unknown phase: $phase" >&2; FAILED="$FAILED $phase" ;;
  esac
done

log "summary"
if [ -n "$FAILED" ]; then
  echo "failed phases:$FAILED"
  exit 1
fi
echo "all phases passed: $PHASES"
