"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { EmergencyContact } from "@/server/safety/emergency";

/**
 * G6: "one tap from chat and the meetup screen." Tap-to-reveal rather than always-open,
 * matching this codebase's other inline expand/collapse patterns (ReportButton, the
 * react-and-wave composer) — no Dialog primitive exists here yet.
 */
export function EmergencyCard({ contacts }: { contacts: EmergencyContact[] }) {
  const t = useTranslations("Emergency");
  const locale = useLocale();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("cardButton")}
      </Button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-foreground">{t("cardTitle")}</p>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("close")}
        </Button>
      </div>
      <ul className="space-y-1">
        {contacts.map((contact) => (
          <li key={contact.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground">{locale === "en" ? contact.labelEn : contact.labelKo}</span>
            {contact.phone ? (
              <a href={`tel:${contact.phone}`} className="font-medium text-foreground underline">
                {contact.phone}
              </a>
            ) : (
              <span className="text-xs text-muted-foreground">
                {locale === "en" ? contact.noteEn : contact.noteKo}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
