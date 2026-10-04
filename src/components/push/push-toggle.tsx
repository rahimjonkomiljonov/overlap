"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { removePushSubscription, savePushSubscription } from "@/server/push/actions";

type PushState = "checking" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function supportsPush(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Month-2 #7: per-device opt-in to web push for matches, waves and unread messages. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations("Push");
  const [state, setState] = useState<PushState>("checking");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function detect(): Promise<PushState> {
      if (!supportsPush()) return "unsupported";
      if (!vapidPublicKey) return "unconfigured";
      if (Notification.permission === "denied") return "denied";
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      return subscription ? "on" : "off";
    }
    detect().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  function turnOn() {
    setError(null);
    startTransition(async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          setState(permission === "denied" ? "denied" : "off");
          return;
        }
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey!),
        });
        const result = await savePushSubscription(subscription.toJSON());
        if (result.status === "error") {
          await subscription.unsubscribe();
          setError(t(`errors.${result.code}` as never));
          return;
        }
        setState("on");
      } catch {
        setError(t("errors.SUBSCRIBE_FAILED"));
      }
    });
  }

  function turnOff() {
    setError(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          await removePushSubscription({ endpoint: subscription.endpoint });
          await subscription.unsubscribe();
        }
        setState("off");
      } catch {
        setError(t("errors.SUBSCRIBE_FAILED"));
      }
    });
  }

  const note =
    state === "unsupported"
      ? t("unsupported")
      : state === "unconfigured"
        ? t("unconfigured")
        : state === "denied"
          ? t("denied")
          : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">{t("label")}</p>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
        </div>
        {(state === "on" || state === "off") && (
          <Button
            type="button"
            variant={state === "on" ? "outline" : "default"}
            disabled={pending}
            onClick={state === "on" ? turnOff : turnOn}
          >
            {t(state === "on" ? "turnOff" : "turnOn")}
          </Button>
        )}
      </div>
      {state === "on" && (
        <p role="status" className="text-sm text-muted-foreground">
          {t("onStatus")}
        </p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
