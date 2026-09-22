"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatBytes, formatUptime } from "@/lib/format";
import type { Metrics } from "@/lib/types";
import { ErrorNote } from "./ui";
import { useI18n } from "./i18n-provider";

export function MetricsView() {
  const { t } = useI18n();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const data = await api<{ metrics: Metrics }>("/api/metrics");
        if (stop) return;
        setMetrics(data.metrics);
        setHistory((current) => [...current, data.metrics.cpu.usage].slice(-40));
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 2000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.metrics.title}</h1>
        <p className="mt-2 text-fog">{t.metrics.lead}</p>
      </div>
      <ErrorNote code={error} />
      {metrics ? (
        <>
          <section className="card p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-fog">{t.dash.cpu}</p>
                <p className="text-4xl font-semibold tracking-tight">{metrics.cpu.usage}%</p>
                <p className="mt-1 text-sm text-fog">
                  {metrics.cpu.brand} · {metrics.cpu.cores} {t.metrics.cores}
                </p>
              </div>
              <Sparkline data={history} />
            </div>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            <article className="card p-5">
              <p className="text-sm text-fog">{t.dash.memory}</p>
              <p className="mt-2 text-2xl font-semibold">{metrics.memory.percent}%</p>
              <p className="mt-1 text-sm text-fog">
                {formatBytes(metrics.memory.used)} / {formatBytes(metrics.memory.total)}
              </p>
              <Bar percent={metrics.memory.percent} />
            </article>
            <article className="card p-5">
              <p className="text-sm text-fog">{t.dash.uptime}</p>
              <p className="mt-2 text-2xl font-semibold">{formatUptime(metrics.uptime)}</p>
              <p className="mt-3 text-sm text-fog">
                {t.metrics.hostname}: {metrics.os.hostname}
              </p>
              <p className="text-sm text-fog">
                {t.metrics.system}: {metrics.os.distro} {metrics.os.release} · {metrics.os.arch}
              </p>
            </article>
          </section>
          <section className="grid gap-3 md:grid-cols-2">
            {metrics.disks.map((disk) => (
              <article key={`${disk.mount}-${disk.fs}`} className="card p-5">
                <p className="text-sm text-fog">{disk.mount || disk.fs}</p>
                <p className="mt-2 text-2xl font-semibold">{disk.percent}%</p>
                <p className="mt-1 text-sm text-fog">
                  {formatBytes(disk.used)} / {formatBytes(disk.size)}
                </p>
                <Bar percent={disk.percent} />
              </article>
            ))}
          </section>
          <section className="card p-5">
            <h2 className="text-lg font-semibold">{t.metrics.network}</h2>
            <ul className="mt-3 space-y-3">
              {metrics.network.map((item) => (
                <li key={item.iface} className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
                  <span className="font-medium">{item.iface}</span>
                  <span className="text-fog">
                    {t.metrics.received} {formatBytes(item.rxSec)}
                    {t.metrics.perSecond} · {t.metrics.sent} {formatBytes(item.txSec)}
                    {t.metrics.perSecond}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p className="text-fog">{t.loading}</p>
      )}
    </div>
  );
}

function Bar({ percent }: { percent: number }) {
  const tone = percent >= 90 ? "bg-coral" : percent >= 70 ? "bg-amber" : "bg-mint";
  return (
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
      <div className={`h-full ${tone}`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const width = 220;
  const height = 64;
  const step = width / (data.length - 1);
  const line = data
    .map((value, index) => {
      const x = index * step;
      const y = height - (Math.min(100, value) / 100) * (height - 6) - 3;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-16 w-52">
      <path d={line} fill="none" stroke="#f5b942" strokeWidth="2.4" />
    </svg>
  );
}
