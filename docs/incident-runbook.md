# Security incident runbook (draft — DRAFT for lawyer review, O6)

> Written for S13, per requirement L5. Not legal advice — the notification thresholds
> and deadlines below are PIPA's; have counsel confirm before relying on them at a real
> incident. Covers a personal-data breach or a "meaningful possibility" of one
> (2026 PIPA amendment, in force 11 Sep 2026), including forgery, alteration or
> damage to personal data, not just exfiltration.

## Roles

| Role | Who (fill in at O1/O2) | Responsibility |
|---|---|---|
| Incident commander | On-call engineer who first confirms the incident | Runs the timeline below, decides severity, keeps the log |
| CPO (개인정보 보호책임자) | Named at O1 | Owns the PIPC/KISA notification and user notification decision and content; ultimate point of contact |
| Engineering | Whoever has access to the affected system | Containment, evidence preservation, root cause |
| Moderation lead | See `docs/moderation-playbook.md` | Only if the incident involves report/chat evidence |

## Severity levels

| Level | Definition | Clock starts |
|---|---|---|
| **Critical** | Sensitive fields (`interested_in`, verification selfies, any future biometric data) exposed, or ≥ 1,000 users' data exposed, or active exploitation confirmed | On confirmation |
| **High** | Any personal data (email, profile, courses/clubs, free time) exposed to an unauthorized party, below the Critical thresholds | On confirmation |
| **Low** | A vulnerability found with no evidence of exposure, or a near-miss caught by monitoring | On confirmation; no external notification clock unless it escalates |

Critical and High both trigger the 72-hour clocks below. Low incidents are logged and
reviewed but do not, by themselves, require PIPC/KISA or user notification.

## Timeline: detect → triage → notify

1. **Detect.** Any of: monitoring/alerting, a user report, a moderator finding, a
   dependency-scan finding, or a disclosure from a processor (`docs/data-flow.md`).
   Whoever detects it opens an incident log entry immediately (timestamp, source,
   first description) — do not wait for confirmation to start the log.
2. **Triage (target: within 2 hours of detection).** Incident commander confirms
   scope: which data, which users, which system, still ongoing or contained. Assign
   the severity level above. If sensitive data or ≥ 1,000 users might be involved,
   treat it as Critical until ruled out — do not wait for a precise count before
   starting the notification clocks.
3. **Contain.** Revoke/rotate any compromised credentials, patch the vulnerability,
   isolate the affected system. Preserve evidence (logs, affected rows, the
   vulnerability itself) before remediating where the two conflict — a breach
   investigation needs the "before" state.
4. **Notify — within 72 hours of confirming a Critical or High incident:**
   - **Affected users**, in plain language: what happened, what data, what we're
     doing, what they should do (e.g., re-verify, change nothing if credentials
     weren't affected since this app never stores a resident registration number or
     CI to begin with).
   - **PIPC (Personal Information Protection Commission) and KISA**, required
     whenever sensitive data is involved or ≥ 1,000 users are affected — CPO owns
     this submission. Report even if the exact scope isn't final; supplement later.
   - Both notifications happen within the same 72-hour window from confirmation, not
     from initial detection — but don't use triage as a way to delay past 72 hours if
     scope is still unclear; notify with the best information available and update.
5. **Root cause and remediation.** Written report: what happened, why, what was
   exposed, what fixed it, what prevents recurrence. Attach to the incident log.
6. **Close.** Incident commander and CPO sign off. Log retained per
   `docs/data-flow.md`'s data inventory (access/audit logs ≥ 1 year).

## What "notify" means for this app specifically

- No resident registration number or CI is ever collected, so no incident can expose
  one (A2/A4) — the user-facing notice can state this plainly to reduce anxiety.
- If verification selfies are exposed: they're deleted ≤ 7 days after a decision in
  the ordinary course, so exposure is bounded by that window; state the window in the
  notice.
- If chat is live (post-S15) and messages are exposed: this is a Protection of
  Communications Secrets Act matter as well as PIPA — flag to counsel explicitly, not
  just PIPC/KISA.

## Quarterly drill

Once a quarter, run a tabletop exercise using this runbook against a hypothetical
scenario (rotate: credential leak, dependency CVE, lost/compromised admin account,
processor-side breach). Time the triage and notification steps against the targets
above and record gaps. First drill scheduled at O6/pre-launch review; track future
drills in the incident log.

## Reporting channel

PIPC/KISA breach notification channel and current contact details: confirm and record
here at O1 (needs a registered operator and named CPO first — see
`docs/REQUIREMENTS.md` §15.6).
