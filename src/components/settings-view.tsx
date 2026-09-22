"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import type { PublicUser } from "@/lib/types";
import { PanelOps } from "./panel-ops";
import { ErrorNote, Field, LanguageSwitch } from "./ui";
import { useI18n } from "./i18n-provider";

export function SettingsView({ user, managePanel }: { user: PublicUser; managePanel: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await api("/api/account/password", { method: "POST", body: JSON.stringify({ current, next }) });
      setCurrent("");
      setNext("");
      setMessage(t.settings.changed);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function startTotp() {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ qr: string; secret: string }>("/api/account/totp", { method: "POST" });
      setQr(data.qr);
      setSecret(data.secret);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ backupCodes: string[] }>("/api/account/totp", {
        method: "PUT",
        body: JSON.stringify({ code }),
      });
      setCodes(data.backupCodes);
      setQr("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function disableTotp(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/account/totp", { method: "DELETE", body: JSON.stringify({ password, code }) });
      setPassword("");
      setCode("");
      setCodes([]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ backupCodes: string[] }>("/api/account/totp/backups", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCodes(data.backupCodes);
      setCode("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.settings.title}</h1>
        <p className="mt-2 text-fog">{t.settings.lead}</p>
      </div>
      {managePanel ? <PanelOps /> : null}
      <ErrorNote code={error} />
      {message ? <p className="text-sm text-mint">{message}</p> : null}
      <section className="card space-y-3 p-5">
        <h2 className="text-lg font-semibold">{t.language}</h2>
        <LanguageSwitch />
      </section>
      <form className="card space-y-4 p-5" onSubmit={changePassword}>
        <h2 className="text-lg font-semibold">{t.settings.passwordTitle}</h2>
        <Field label={t.settings.current}>
          <input className="field" type="password" value={current} onChange={(event) => setCurrent(event.target.value)} required />
        </Field>
        <Field label={t.settings.next} hint={t.setup.passwordHint}>
          <input className="field" type="password" value={next} onChange={(event) => setNext(event.target.value)} required />
        </Field>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {t.settings.change}
        </button>
      </form>
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">{t.settings.totpTitle}</h2>
        <p className="text-sm text-fog">{user.totpEnabled ? t.settings.totpOn : t.settings.totpOff}</p>
        {user.totpEnabled ? (
          <>
            <p className="text-sm">
              {t.settings.codesLeft}: {user.backupCodesLeft}
            </p>
            <form className="space-y-3" onSubmit={disableTotp}>
              <p className="text-sm text-fog">{t.settings.disableLead}</p>
              <Field label={t.auth.password}>
                <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </Field>
              <Field label={t.auth.totpCode}>
                <input className="field" value={code} onChange={(event) => setCode(event.target.value)} required />
              </Field>
              <button className="btn btn-danger" disabled={busy} type="submit">
                {t.settings.disable}
              </button>
            </form>
            <form className="space-y-3 border-t border-white/10 pt-4" onSubmit={regenerate}>
              <p className="text-sm text-fog">{t.settings.regenerateLead}</p>
              <Field label={t.auth.totpCode}>
                <input className="field" value={code} onChange={(event) => setCode(event.target.value)} required />
              </Field>
              <button className="btn btn-ghost" disabled={busy} type="submit">
                {t.settings.regenerate}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-4">
            {qr ? (
              <form className="space-y-3" onSubmit={confirmTotp}>
                <p className="text-sm text-fog">{t.setup.scan}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt="" className="w-52 rounded-2xl bg-[#fff8ea] p-3" />
                <p className="font-mono text-sm break-all text-fog">
                  {t.setup.manual}: {secret}
                </p>
                <Field label={t.auth.totpCode}>
                  <input className="field" value={code} onChange={(event) => setCode(event.target.value)} required />
                </Field>
                <button className="btn btn-primary" disabled={busy} type="submit">
                  {t.setup.verify}
                </button>
              </form>
            ) : (
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void startTotp()}>
                {t.settings.enable}
              </button>
            )}
          </div>
        )}
        {codes.length > 0 ? (
          <div className="space-y-3 border-t border-white/10 pt-4">
            <p className="text-sm text-fog">{t.setup.codesLead}</p>
            <div className="grid grid-cols-2 gap-2 font-mono text-sm">
              {codes.map((item) => (
                <span key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  {item}
                </span>
              ))}
            </div>
            <button className="btn btn-ghost" type="button" onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}>
              {t.copy}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
