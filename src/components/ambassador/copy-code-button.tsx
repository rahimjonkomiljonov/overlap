"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function CopyCodeButton({ code }: { code: string }) {
  const t = useTranslations("Ambassador");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy} aria-label={t("copyCode", { code })}>
      {copied ? t("copied") : t("copy")}
    </Button>
  );
}
