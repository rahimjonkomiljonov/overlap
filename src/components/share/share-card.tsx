"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

const SIZE = 1080;

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  // Korean wraps fine per character; English per word. Try words first, then characters.
  const words = text.includes(" ") ? text.split(" ") : [...text];
  const joiner = text.includes(" ") ? " " : "";
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line}${joiner}${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * J5: draws a shareable card in the browser (system fonts, so Hangul renders without
 * a webfont) and offers save or share. Nothing is uploaded: the image only leaves the
 * device if the user shares it themselves.
 */
export function ShareCard({ headline, footer, fileName }: { headline: string; footer: string; fileName: string }) {
  const t = useTranslations("Share");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canShareFiles, setCanShareFiles] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const font = getComputedStyle(document.body).fontFamily || "sans-serif";

    const gradient = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    gradient.addColorStop(0, "#2a1f4a");
    gradient.addColorStop(1, "#7a3b6e");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE, SIZE);

    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    ctx.font = `700 64px ${font}`;
    ctx.fillText("Overlap", 96, 96);

    ctx.font = `700 84px ${font}`;
    const lines = wrapLines(ctx, headline, SIZE - 192).slice(0, 6);
    const lineHeight = 112;
    const top = (SIZE - lines.length * lineHeight) / 2;
    lines.forEach((line, i) => ctx.fillText(line, 96, top + i * lineHeight));

    ctx.font = `400 40px ${font}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(footer, 96, SIZE - 96 - 40);

    const probe = new File([new Blob()], "probe.png", { type: "image/png" });
    setCanShareFiles(typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  }, [headline, footer]);

  function toBlob(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const canvas = canvasRef.current;
      if (!canvas) return resolve(null);
      canvas.toBlob(resolve, "image/png");
    });
  }

  async function save() {
    const blob = await toBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoking right away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function share() {
    const blob = await toBlob();
    if (!blob) return;
    try {
      await navigator.share({ files: [new File([blob], fileName, { type: "image/png" })], text: headline });
    } catch {
      // The user closed the share sheet; nothing to do.
    }
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        role="img"
        aria-label={headline}
        className="aspect-square w-full max-w-sm rounded-xl border border-border"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save}>
          {t("save")}
        </Button>
        {canShareFiles && (
          <Button type="button" variant="outline" onClick={share}>
            {t("share")}
          </Button>
        )}
      </div>
    </div>
  );
}
