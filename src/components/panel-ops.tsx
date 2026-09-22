"use client";

import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { caddyBeside, nginxBeside } from "@/lib/panel-snippets";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type PanelState = {
  discordSet: boolean;
  telegramSet: boolean;
  telegramChat: string;
  httpsDomain: string;
  httpsRunning: boolean;
  port: number;
  direct: string;
  address: string;
  host: string;
  attached: string;
  tls: boolean;
};

export function PanelOps() {
  const { t, lang } = useI18n();
  const [state, setState] = useState<PanelState | null>(null);
  const [discord, setDiscord] = useState("");
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [domain, setDomain] = useState("");
  const [panelHost, setPanelHost] = useState("");
  const [copied, setCopied] = useState("");
  const [hostSaved, setHostSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function remember(next: PanelState) {
    setState(next);
    setChat(next.telegramChat);
    setDomain(next.httpsDomain);
    setPanelHost(next.host);
  }

  async function load() {
    remember(await api<PanelState>("/api/panel"));
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<PanelState>("/api/panel");
        if (!stop) remember(next);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, []);

  function flash(kind: string, value: string) {
    void copyText(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied(""), 1200);
    });
  }

  async function saveHost() {
    setBusy(true);
    setError(null);
    setHostSaved(false);
    try {
      const next = await api<Pick<PanelState, "port" | "direct" | "host">>("/api/panel", {
        method: "PUT",
        body: JSON.stringify({ panelHost }),
      });
      if (typeof next.host !== "string") throw new Error("request_failed");
      setState((current) => (current ? { ...current, ...next } : current));
      setPanelHost(next.host);
      setHostSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function attachHost() {
    setBusy(true);
    setError(null);
    setHostSaved(false);
    try {
      const next = await api<PanelState>("/api/panel", {
        method: "PUT",
        body: JSON.stringify({ panelHost, attach: true }),
      });
      if (typeof next.host !== "string") throw new Error("request_failed");
      setState((current) => (current ? { ...current, ...next } : current));
      setPanelHost(next.host);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveAlerts(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const next = await api<PanelState>("/api/panel", {
        method: "PUT",
        body: JSON.stringify({
          discordWebhook: discord,
          telegramToken: token,
          telegramChat: chat,
        }),
      });
      setState((current) => ({ ...(current ?? next), ...next }));
      setDiscord("");
      setToken("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function clear(which: "discord" | "telegram") {
    setBusy(true);
    setError(null);
    try {
      const next = await api<PanelState>("/api/panel", {
        method: "PUT",
        body: JSON.stringify(which === "discord" ? { clearDiscord: true } : { clearTelegram: true }),
      });
      setState((current) => ({ ...(current ?? next), ...next }));
      if (which === "telegram") setChat("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveHttps(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/panel", { method: "POST", body: JSON.stringify({ domain }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function stopHttps() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/panel", { method: "DELETE" });
      setDomain("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  const exampleHost = lang === "en" ? "panel.example.com" : "panel.twojadomena.pl";
  const attachedKey =
    state?.attached === "nginx"
      ? state.tls
        ? "nginxTls"
        : "nginx"
      : state?.attached === "apache"
        ? state.tls
          ? "apacheTls"
          : "apache"
        : state?.attached === "caddy"
          ? "caddy"
          : state?.attached === "helios"
            ? "helios"
            : "";
  const attachedLine = attachedKey && state?.host ? t.ops.attached[attachedKey].replaceAll("{host}", state.host) : "";
  const snippetHost = panelHost || exampleHost;
  const nginx = nginxBeside(snippetHost, state?.port ?? 3000);
  const caddy = caddyBeside(snippetHost, state?.port ?? 3000);

  return (
    <div className="space-y-5">
      <ErrorNote code={error} />
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="text-xl font-semibold">{t.ops.accessTitle}</h2>
          <p className="mt-1 text-sm text-fog">{t.ops.accessLead}</p>
        </div>
        <div>
          <p className="text-sm text-fog">{t.ops.direct}</p>
          <button type="button" className="mt-1 font-mono text-lg text-amber" onClick={() => flash("direct", state?.direct ?? "")}>
            {copied === "direct" ? t.copied : state?.direct || "…"}
          </button>
        </div>
        <form
          className="space-y-4 border-t border-white/10 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveHost();
          }}
        >
          <div>
            <h3 className="text-lg font-semibold">{t.ops.besideTitle}</h3>
            <p className="mt-1 text-sm text-fog">{t.ops.besideLead}</p>
          </div>
          <Field label={t.ops.besideHost} hint={t.ops.besideHint}>
            <input
              className="field"
              value={panelHost}
              spellCheck={false}
              placeholder={exampleHost}
              onChange={(event) => {
                setPanelHost(event.target.value.trim().toLowerCase());
                setHostSaved(false);
              }}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" type="submit" disabled={busy}>
              {busy ? t.loading : t.save}
            </button>
            <button className="btn btn-primary" type="button" disabled={busy || !panelHost} onClick={() => void attachHost()}>
              {t.ops.attach}
            </button>
          </div>
          <ErrorNote code={error} />
          {hostSaved ? <p className="text-sm text-mint">{t.ops.saved}</p> : null}
          {attachedLine ? <p className="text-sm text-mint">{attachedLine}</p> : null}
          {state?.host ? (
            <DnsRecord
              host={state.host}
              address={state.address || state.direct.replace(/^https?:\/\//, "").split(":")[0] || ""}
            />
          ) : null}
          <Snippet label={t.ops.nginx} value={nginx} copied={copied === "nginx"} copyLabel={t.copy} copiedLabel={t.copied} onCopy={() => flash("nginx", nginx)} />
          <Snippet label={t.ops.caddy} value={caddy} copied={copied === "caddy"} copyLabel={t.copy} copiedLabel={t.copied} onCopy={() => flash("caddy", caddy)} />
        </form>
      </section>
      <form className="card space-y-4 p-5" onSubmit={saveAlerts}>
        <div>
          <h2 className="text-xl font-semibold">{t.ops.alertsTitle}</h2>
          <p className="mt-1 text-sm text-fog">{t.ops.alertsLead}</p>
        </div>
        <Field label={t.ops.discord} hint={state?.discordSet ? t.ops.savedSecret : t.ops.discordHint}>
          <input className="field" value={discord} placeholder="https://discord.com/api/webhooks/..." onChange={(event) => setDiscord(event.target.value.trim())} />
        </Field>
        {state?.discordSet ? (
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void clear("discord")}>
            {t.ops.clearDiscord}
          </button>
        ) : null}
        <Field label={t.ops.telegram} hint={state?.telegramSet ? t.ops.savedSecret : t.ops.telegramHint}>
          <input className="field" value={token} autoComplete="off" onChange={(event) => setToken(event.target.value.trim())} />
        </Field>
        <Field label={t.ops.chat}>
          <input className="field" value={chat} onChange={(event) => setChat(event.target.value.trim())} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {t.save}
          </button>
          {state?.telegramSet ? (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void clear("telegram")}>
              {t.ops.clearTelegram}
            </button>
          ) : null}
        </div>
      </form>
      <form className="card space-y-4 p-5" onSubmit={saveHttps}>
        <div>
          <h2 className="text-xl font-semibold">{t.ops.httpsTitle}</h2>
          <p className="mt-1 text-sm text-fog">{t.ops.httpsLead}</p>
        </div>
        {state?.httpsDomain ? (
          <p className={`chip ${state.httpsRunning ? "text-mint" : "text-fog"}`}>
            {state.httpsRunning ? t.ops.httpsOn : t.ops.httpsOff} · {state.httpsDomain}
          </p>
        ) : null}
        <Field label={t.ops.domain} hint={t.ops.domainHint}>
          <input className="field" value={domain} spellCheck={false} onChange={(event) => setDomain(event.target.value.trim().toLowerCase())} required />
        </Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t.loading : t.ops.httpsSave}
          </button>
          {state?.httpsDomain ? (
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void stopHttps()}>
              {t.ops.httpsStop}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}

function DnsRecord({ host, address }: { host: string; address: string }) {
  const { t } = useI18n();
  const labels = host.split(".");
  const name = labels.length > 2 ? labels.slice(0, -2).join(".") : host;
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-3 text-sm">
      <p className="font-medium">{t.ops.dnsTitle}</p>
      <p className="mt-1 text-fog">{t.ops.dnsLead}</p>
      <p className="mt-3 font-mono text-amber">
        A {name} {address}
      </p>
      <p className="mt-1 text-xs text-fog">{t.ops.dnsProxy}</p>
    </div>
  );
}

function Snippet({
  label,
  value,
  copied,
  copyLabel,
  copiedLabel,
  onCopy,
}: {
  label: string;
  value: string;
  copied: boolean;
  copyLabel: string;
  copiedLabel: string;
  onCopy: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-sm text-fog">{label}</p>
        <button className="btn btn-ghost" type="button" onClick={onCopy}>
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-2xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-fog">{value}</pre>
    </div>
  );
}
