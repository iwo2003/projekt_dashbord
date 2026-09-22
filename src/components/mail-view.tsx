"use client";

import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import type { Mailbox } from "@/lib/types";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type Dns = {
  a: string;
  mx: string;
  spf: string;
  dmarc: string;
  dkim: string | null;
  zone: string;
};

type Payload = {
  domain: string | null;
  mailboxes: Mailbox[];
  host: string;
  hostname: string | null;
  ports: { smtp: number; submission: number; smtps: number; imap: number };
  docker: boolean;
  running: boolean;
  dns: Dns | null;
};

export function MailView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [domain, setDomain] = useState("");
  const [local, setLocal] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"domain" | "box" | "delete" | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const next = await api<Payload>("/api/mail");
    setData(next);
    setDomain(next.domain ?? "");
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<Payload>("/api/mail");
        if (!stop) {
          setData(next);
          setDomain(next.domain ?? "");
        }
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, []);

  async function saveDomain(event: React.FormEvent) {
    event.preventDefault();
    setBusy("domain");
    setError(null);
    try {
      await api("/api/mail", { method: "PUT", body: JSON.stringify({ domain }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy("box");
    setError(null);
    try {
      const result = await api<{ mailbox: Mailbox }>("/api/mail", {
        method: "POST",
        body: JSON.stringify({ local, password }),
      });
      setLocal("");
      setPassword("");
      setRevealed(result.mailbox.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(mailbox: Mailbox) {
    if (!window.confirm(t.mail.deleteAsk)) return;
    setBusy("delete");
    setError(null);
    try {
      await api(`/api/mail/${mailbox.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  function markCopied(id: string) {
    setCopied(id);
    window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1600);
  }

  function downloadZone(name: string | null, zone: string) {
    if (!name || !zone) return;
    const blob = new Blob([zone], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name}.zone`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const locked = Boolean(data && data.mailboxes.length > 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.mail.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.mail.lead}</p>
      </div>
      <ErrorNote code={error} />
      {data && !data.docker && error !== "docker_offline" ? <ErrorNote code="docker_offline" /> : null}
      {data?.domain ? (
        <p className={`chip ${data.running ? "text-mint" : "text-fog"}`}>
          <span className={data.running ? "pulse" : "h-2 w-2 rounded-full bg-current"} />
          {data.running ? t.mail.running : t.mail.stopped}
        </p>
      ) : null}
      {canManage ? (
        <form className="card grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end" onSubmit={saveDomain}>
          <Field label={t.mail.domain} hint={locked ? t.mail.domainLocked : t.mail.domainHint}>
            <input
              className="field"
              value={domain}
              autoComplete="off"
              spellCheck={false}
              disabled={locked || busy !== null}
              onChange={(event) => setDomain(event.target.value.toLowerCase().trim())}
              required
            />
          </Field>
          <button className="btn btn-primary" disabled={busy !== null || locked} type="submit">
            {busy === "domain" ? t.loading : data?.domain ? t.mail.changeDomain : t.mail.saveDomain}
          </button>
          {busy === "domain" ? <p className="text-sm text-fog md:col-span-2">{t.mail.starting}</p> : null}
        </form>
      ) : data?.domain ? (
        <p className="text-sm text-fog">
          {t.mail.domain}: <span className="font-mono text-white">{data.domain}</span>
        </p>
      ) : null}
      {data?.dns ? (
        <section className="card space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">{t.mail.dnsTitle}</h2>
              <p className="mt-1 max-w-2xl text-sm text-fog">{t.mail.dnsLead}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  const lines = [data.dns?.a, data.dns?.mx, data.dns?.spf, data.dns?.dmarc, data.dns?.dkim].filter(Boolean);
                  void copyText(lines.join("\n")).then(() => markCopied("dns"));
                }}
              >
                {copied === "dns" ? t.copied : t.mail.copyDns}
              </button>
              <button className="btn btn-primary" type="button" onClick={() => downloadZone(data.domain, data.dns?.zone ?? "")}>
                {t.mail.downloadCloudflare}
              </button>
            </div>
          </div>
          <ul className="space-y-2 font-mono text-sm">
            <li>{data.dns.a}</li>
            <li>{data.dns.mx}</li>
            <li className="break-all">{data.dns.spf}</li>
            <li className="break-all">{data.dns.dmarc}</li>
            <li className="break-all">{data.dns.dkim ?? t.mail.dkimPending}</li>
          </ul>
          <p className="text-sm text-fog">{t.mail.cloudflareHint}</p>
          <p className="text-sm text-fog">{t.mail.portsNote}</p>
        </section>
      ) : null}
      {canManage && data?.domain ? (
        <form className="card grid gap-4 p-5 md:grid-cols-2" onSubmit={create}>
          <Field label={t.mail.local} hint={t.mail.localHint}>
            <input
              className="field"
              value={local}
              autoComplete="off"
              spellCheck={false}
              pattern="[a-z0-9]([a-z0-9._-]{0,30}[a-z0-9])?"
              onChange={(event) => setLocal(event.target.value.toLowerCase())}
              required
            />
          </Field>
          <Field label={t.mail.password} hint={t.mail.passwordHint}>
            <input
              className="field"
              type="text"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <div className="md:col-span-2">
            <button className="btn btn-primary" disabled={busy !== null} type="submit">
              {busy === "box" ? t.loading : t.mail.submit}
            </button>
          </div>
        </form>
      ) : null}
      {data?.domain && data.mailboxes.length === 0 ? <p className="text-fog">{t.mail.empty}</p> : null}
      <div className="grid gap-3">
        {data?.mailboxes.map((mailbox) => {
          const open = revealed === mailbox.id;
          return (
            <article key={mailbox.id} className="card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{mailbox.address}</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      void copyText(mailbox.address).then(() => markCopied(mailbox.id));
                    }}
                  >
                    {copied === mailbox.id ? t.copied : t.copy}
                  </button>
                  {canManage ? (
                    <button className="btn btn-danger" type="button" disabled={busy !== null} onClick={() => void remove(mailbox)}>
                      {t.delete}
                    </button>
                  ) : null}
                </div>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-fog">{t.mail.host}</dt>
                  <dd className="mt-1 font-mono">{data.hostname}</dd>
                </div>
                <div>
                  <dt className="text-fog">{t.mail.imap}</dt>
                  <dd className="mt-1 font-mono">{data.ports.imap}</dd>
                </div>
                <div>
                  <dt className="text-fog">{t.mail.smtp}</dt>
                  <dd className="mt-1 font-mono">
                    {data.ports.submission} / {data.ports.smtps}
                  </dd>
                </div>
                <div>
                  <dt className="text-fog">{t.mail.password}</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <span className="font-mono">{open ? mailbox.password : "••••••••••••"}</span>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => setRevealed(open ? null : mailbox.id)}
                    >
                      {open ? t.mail.hide : t.mail.show}
                    </button>
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </div>
  );
}
