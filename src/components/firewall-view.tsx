"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type Proto = "tcp" | "udp";
type Rule = { port: string; proto: Proto };
type Locked = { port: string; proto: "tcp"; reasons: Array<"ssh" | "panel" | "sftp" | "https"> };

type Payload = {
  available: boolean;
  active: boolean;
  locked: Locked[];
  services: { id: "minecraft" | "cs2" | "gmod" | "fs25" | "tf2" | "mysql" | "ftp" | "mail"; rules: Rule[]; open: boolean }[];
  servers: { id: string; name: string; game: string; rules: Rule[]; open: boolean }[];
  extra: Rule[];
};

function formatRule(rule: Rule) {
  return `${rule.port}/${rule.proto}`;
}

export function FirewallView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [port, setPort] = useState("");
  const [proto, setProto] = useState<Proto>("tcp");

  async function load() {
    const next = await api<Payload>("/api/firewall");
    setData(next);
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<Payload>("/api/firewall");
        if (!stop) setData(next);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, []);

  async function send(body: unknown, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return false;
    setBusy(true);
    setError(null);
    try {
      await api("/api/firewall", { method: "POST", body: JSON.stringify(body) });
      await load();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function lockedLabel(item: Locked) {
    return item.reasons.map((reason) => t.firewall.reasons[reason]).join(", ");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.firewall.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.firewall.lead}</p>
      </div>
      <ErrorNote code={error} />
      {data && !data.available ? <ErrorNote code="firewall_unavailable" /> : null}
      {data?.available ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className={`chip ${data.active ? "text-mint" : "text-fog"}`}>
            <span className={data.active ? "pulse" : "h-2 w-2 rounded-full bg-current"} />
            {data.active ? t.firewall.active : t.firewall.inactive}
          </p>
          {canManage ? (
            <button
              className={`btn ${data.active ? "btn-ghost" : "btn-primary"}`}
              type="button"
              disabled={busy}
              onClick={() =>
                void send(
                  { action: data.active ? "disable" : "enable" },
                  data.active ? t.firewall.disableAsk : t.firewall.enableAsk,
                )
              }
            >
              {data.active ? t.firewall.disable : t.firewall.enable}
            </button>
          ) : null}
        </div>
      ) : null}
      {data?.available ? (
        <section className="card space-y-3 p-5">
          <div>
            <h2 className="text-lg font-semibold">{t.firewall.lockedTitle}</h2>
            <p className="mt-1 max-w-2xl text-sm text-fog">{t.firewall.lockedLead}</p>
          </div>
          <ul className="space-y-2">
            {data.locked.map((item) => (
              <li key={`${item.port}/${item.proto}`} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{lockedLabel(item)}</span>
                  <span className="ml-2 font-mono text-fog">{formatRule(item)}</span>
                </span>
                <span className="chip text-mint">{t.firewall.opened}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data?.available ? (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">{t.firewall.services}</h2>
          <ul className="space-y-2">
            {data.services.map((service) => (
              <li key={service.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{t.firewall.serviceNames[service.id]}</span>
                  <span className="ml-2 font-mono text-fog">{service.rules.map(formatRule).join(", ")}</span>
                </span>
                {canManage ? (
                  <button
                    className={`btn ${service.open ? "btn-ghost" : "btn-primary"}`}
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ action: "service", id: service.id, open: !service.open })}
                  >
                    {service.open ? t.firewall.close : t.firewall.open}
                  </button>
                ) : (
                  <span className={`chip ${service.open ? "text-mint" : "text-fog"}`}>
                    {service.open ? t.firewall.opened : t.firewall.closed}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data?.available && data.servers.length > 0 ? (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">{t.firewall.servers}</h2>
          <ul className="space-y-2">
            {data.servers.map((server) => (
              <li key={server.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium">{server.name}</span>
                  <span className="ml-2 font-mono text-fog">{server.rules.map(formatRule).join(", ")}</span>
                </span>
                {canManage ? (
                  <button
                    className={`btn ${server.open ? "btn-ghost" : "btn-primary"}`}
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ action: "server", id: server.id, open: !server.open })}
                  >
                    {server.open ? t.firewall.close : t.firewall.open}
                  </button>
                ) : (
                  <span className={`chip ${server.open ? "text-mint" : "text-fog"}`}>
                    {server.open ? t.firewall.opened : t.firewall.closed}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data?.available && canManage ? (
        <form
          className="card grid gap-4 p-5 md:grid-cols-[1fr_8rem_auto] md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void send({ action: "allow", port, proto }).then((ok) => {
              if (ok) setPort("");
            });
          }}
        >
          <Field label={t.firewall.custom} hint={t.firewall.customHint}>
            <input
              className="field"
              value={port}
              inputMode="numeric"
              pattern="\d{1,5}(:\d{1,5})?"
              onChange={(event) => setPort(event.target.value.trim())}
              required
            />
          </Field>
          <Field label={t.firewall.proto}>
            <select className="field" value={proto} onChange={(event) => setProto(event.target.value as Proto)}>
              <option value="tcp">TCP</option>
              <option value="udp">UDP</option>
            </select>
          </Field>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {t.firewall.open}
          </button>
        </form>
      ) : null}
      {data?.available && data.extra.length > 0 ? (
        <section className="card space-y-3 p-5">
          <h2 className="text-lg font-semibold">{t.firewall.extra}</h2>
          <ul className="space-y-2">
            {data.extra.map((rule) => (
              <li key={formatRule(rule)} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="font-mono">{formatRule(rule)}</span>
                {canManage ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => void send({ action: "close", port: rule.port, proto: rule.proto })}
                  >
                    {t.firewall.close}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
