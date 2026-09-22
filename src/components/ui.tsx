"use client";

import { useEffect } from "react";
import { errorText } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";

export function ErrorNote({ code }: { code: string | null }) {
  const { t } = useI18n();
  if (!code) return null;
  return (
    <p className="rounded-2xl border border-coral/30 bg-coral/10 px-3 py-2 text-sm text-coral">
      {errorText(t.errors, code)}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm text-fog">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-fog">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-3 sm:items-center" role="dialog">
      <button className="absolute inset-0 bg-black/70" aria-label={t.close} onClick={onClose} />
      <div className="card relative z-10 max-h-[88vh] w-full max-w-xl overflow-auto p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 text-xs" aria-label={t.language}>
      {(["pl", "en"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLang(item)}
          className={`rounded-full px-2.5 py-1 ${lang === item ? "bg-amber text-ink" : "text-fog"}`}
        >
          {item.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

export function statusTone(status: string) {
  if (status === "running") return "text-mint";
  if (status === "error") return "text-coral";
  if (status === "provisioning") return "text-amber";
  return "text-fog";
}
