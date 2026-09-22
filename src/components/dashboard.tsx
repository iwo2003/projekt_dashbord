"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { formatBytes, formatUptime, formatWhen } from "@/lib/format";
import type { Metrics, PanelEvent, PublicServer, PublicUser } from "@/lib/types";
import { can } from "@/lib/permissions";
import { useI18n } from "./i18n-provider";
import { ErrorNote } from "./ui";
import { ServerCard } from "./server-card";

export function Dashboard({ user }: { user: PublicUser }) {
  const { t, lang } = useI18n();
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<PanelEvent[]>([]);
  const [docker, setDocker] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      if (document.hidden) return;
      try {
        const [dockerState, eventState] = await Promise.all([
          api<{ ok: boolean }>("/api/docker"),
          api<{ events: PanelEvent[] }>("/api/events"),
        ]);
        if (stop) return;
        setDocker(dockerState.ok);
        setEvents(eventState.events);
        if (can(user, "servers.view")) {
          const data = await api<{ servers: PublicServer[] }>("/api/servers");
          if (!stop) setServers(data.servers);
        }
        if (can(user, "metrics.view")) {
          const data = await api<{ metrics: Metrics }>("/api/metrics");
          if (!stop) setMetrics(data.metrics);
        }
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [user]);

  const online = servers.filter((server) => server.status === "running").length;
  const disk = metrics?.disks[0];

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-fog">{t.dash.hello}</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{user.username}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.dash.lead}</p>
      </div>
      {!user.totpEnabled ? (
        <div className="card flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm">{t.dash.totpBanner}</p>
          <Link className="btn btn-primary" href="/settings">
            {t.dash.totpAction}
          </Link>
        </div>
      ) : null}
      {!docker ? <div className="card px-4 py-3 text-sm text-coral">{t.dash.dockerBanner}</div> : null}
      <ErrorNote code={error} />
      {metrics ? (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t.dash.cpu} value={`${metrics.cpu.usage}%`} detail={metrics.cpu.brand} percent={metrics.cpu.usage} />
          <Metric
            label={t.dash.memory}
            value={`${metrics.memory.percent}%`}
            detail={`${formatBytes(metrics.memory.used)} / ${formatBytes(metrics.memory.total)}`}
            percent={metrics.memory.percent}
          />
          <Metric
            label={t.dash.disk}
            value={disk ? `${disk.percent}%` : "—"}
            detail={disk ? disk.mount : ""}
            percent={disk?.percent ?? 0}
          />
          <Metric label={t.dash.uptime} value={formatUptime(metrics.uptime)} detail={metrics.os.hostname} />
        </section>
      ) : null}
      <section className="grid gap-3 sm:grid-cols-3">
        <Mini label={t.dash.servers} value={String(servers.length)} />
        <Mini label={t.dash.online} value={String(online)} />
        <Mini label={t.dash.stopped} value={String(servers.length - online)} />
      </section>
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.nav.servers}</h2>
          {can(user, "servers.create") ? (
            <Link className="btn btn-primary" href="/servers/new">
              {t.dash.newServer}
            </Link>
          ) : null}
        </div>
        {servers.length === 0 ? (
          <div className="card px-5 py-10 text-center text-fog">{t.dash.noServers}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {servers.slice(0, 4).map((server) => (
              <ServerCard key={server.id} server={server} user={user} />
            ))}
          </div>
        )}
      </section>
      <section className="card p-5">
        <h2 className="text-lg font-semibold">{t.dash.activity}</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-sm text-fog">{t.dash.emptyActivity}</p>
        ) : (
          <ul className="mt-3 divide-y divide-white/8">
            {events.map((event) => {
              const label = t.events[event.action as keyof typeof t.events] ?? event.action;
              const name = typeof event.detail.name === "string" ? event.detail.name : "";
              return (
                <li key={event.id} className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    <span className="font-medium">{event.username ?? "—"}</span>{" "}
                    <span className="text-fog">{label}</span> {name ? <span>{name}</span> : null}
                  </span>
                  <span className="text-xs text-fog">{formatWhen(event.createdAt, lang)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  percent,
}: {
  label: string;
  value: string;
  detail?: string;
  percent?: number;
}) {
  const tone = (percent ?? 0) >= 90 ? "bg-coral" : (percent ?? 0) >= 70 ? "bg-amber" : "bg-mint";
  return (
    <article className="card p-4">
      <p className="text-sm text-fog">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="mt-1 truncate text-xs text-fog">{detail}</p> : null}
      {percent != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
        </div>
      ) : null}
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <article className="card px-4 py-3">
      <p className="text-xs uppercase tracking-[0.14em] text-fog">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </article>
  );
}
