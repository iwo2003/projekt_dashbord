"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { ErrorNote, Field, LanguageSwitch } from "./ui";
import { useI18n } from "./i18n-provider";

function Brand() {
  const { t } = useI18n();
  return (
    <div className="relative hidden overflow-hidden border-r border-white/10 lg:flex lg:flex-col lg:justify-between lg:p-12">
      <Logo />
      <div>
        <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">
          {t.tagline}
        </p>
        <ul className="mt-8 space-y-3 text-fog">
          <li>Counter-Strike 2</li>
          <li>Minecraft Paper / Vanilla</li>
          <li>{t.nav.users}</li>
        </ul>
      </div>
      <p className="text-sm text-fog">Docker · TOTP</p>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  autoComplete,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  label: string;
}) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <Field label={label}>
      <span className="relative block">
        <input
          className="field pr-12"
          type={shown ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(event) => onChange(event.target.value)}
          required
        />
        <button
          type="button"
          className="absolute top-1/2 right-3 -translate-y-1/2 text-fog"
          onClick={() => setShown((value) => !value)}
          aria-label={shown ? t.auth.hidePassword : t.auth.showPassword}
        >
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </span>
    </Field>
  );
}

export function LoginForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitPassword(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ totpRequired?: boolean; challengeId?: string }>("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      if (data.totpRequired && data.challengeId) {
        setChallengeId(data.challengeId);
        return;
      }
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/login/totp", {
        method: "POST",
        body: JSON.stringify({ challengeId, code }),
      });
      router.push("/");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <Brand />
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo />
          </span>
          <LanguageSwitch />
        </div>
        <form
          className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 py-10"
          onSubmit={challengeId ? submitCode : submitPassword}
        >
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {challengeId ? t.auth.totpTitle : t.auth.loginTitle}
            </h1>
            <p className="mt-2 text-fog">{challengeId ? t.auth.totpLead : t.auth.loginLead}</p>
          </div>
          <ErrorNote code={error} />
          {challengeId ? (
            <Field label={t.auth.totpCode} hint={t.auth.backupHint}>
              <input
                className="field tracking-[0.3em]"
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                required
              />
            </Field>
          ) : (
            <>
              <Field label={t.auth.username}>
                <input
                  className="field"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </Field>
              <PasswordInput
                label={t.auth.password}
                autoComplete="current-password"
                value={password}
                onChange={setPassword}
              />
            </>
          )}
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? t.loading : t.auth.submit}
          </button>
          {challengeId ? (
            <button
              className="btn btn-quiet"
              type="button"
              onClick={() => {
                setChallengeId(null);
                setCode("");
                setError(null);
              }}
            >
              {t.auth.backToPassword}
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}

export function SetupForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [step, setStep] = useState<"account" | "choice" | "qr" | "codes">("account");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [qr, setQr] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function createAccount(event: React.FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("password_mismatch");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/setup", { method: "POST", body: JSON.stringify({ username, password }) });
      setStep("choice");
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
      setStep("qr");
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
      setStep("codes");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  function enter() {
    router.push("/");
    router.refresh();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <Brand />
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <span className="lg:hidden">
            <Logo />
          </span>
          <LanguageSwitch />
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 py-10">
          <ErrorNote code={error} />
          {step === "account" ? (
            <form className="space-y-5" onSubmit={createAccount}>
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-amber">{t.setup.eyebrow}</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t.setup.title}</h1>
                <p className="mt-2 text-fog">{t.setup.lead}</p>
              </div>
              <Field label={t.auth.username}>
                <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </Field>
              <PasswordInput
                label={t.auth.password}
                autoComplete="new-password"
                value={password}
                onChange={setPassword}
              />
              <p className="-mt-3 text-xs text-fog">{t.setup.passwordHint}</p>
              <PasswordInput
                label={t.auth.confirmPassword}
                autoComplete="new-password"
                value={confirm}
                onChange={setConfirm}
              />
              <button className="btn btn-primary w-full" disabled={busy} type="submit">
                {busy ? t.loading : t.setup.continue}
              </button>
            </form>
          ) : null}
          {step === "choice" ? (
            <div className="space-y-5">
              <h1 className="text-3xl font-semibold tracking-tight">{t.setup.totpTitle}</h1>
              <p className="text-fog">{t.setup.totpLead}</p>
              <div className="flex flex-col gap-3 sm:flex-row">
                <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void startTotp()}>
                  {t.setup.enable}
                </button>
                <button className="btn btn-ghost" type="button" onClick={enter}>
                  {t.setup.later}
                </button>
              </div>
            </div>
          ) : null}
          {step === "qr" ? (
            <form className="space-y-5" onSubmit={confirmTotp}>
              <h1 className="text-3xl font-semibold tracking-tight">{t.setup.totpTitle}</h1>
              <p className="text-fog">{t.setup.scan}</p>
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="" className="w-52 rounded-2xl bg-[#fff8ea] p-3" />
              ) : null}
              <p className="font-mono text-sm break-all text-fog">
                {t.setup.manual}: {secret}
              </p>
              <Field label={t.auth.totpCode}>
                <input
                  className="field tracking-[0.3em]"
                  inputMode="numeric"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </Field>
              <button className="btn btn-primary" disabled={busy} type="submit">
                {busy ? t.loading : t.setup.verify}
              </button>
            </form>
          ) : null}
          {step === "codes" ? (
            <div className="space-y-5">
              <h1 className="text-3xl font-semibold tracking-tight">{t.setup.codesTitle}</h1>
              <p className="text-fog">{t.setup.codesLead}</p>
              <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                {codes.map((item) => (
                  <span key={item} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                    {item}
                  </span>
                ))}
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => void navigator.clipboard.writeText(codes.join("\n"))}
              >
                {t.copy}
              </button>
              <label className="flex items-start gap-2 text-sm text-fog">
                <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
                {t.setup.saved}
              </label>
              <button className="btn btn-primary" type="button" disabled={!saved} onClick={enter}>
                {t.setup.enter}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
