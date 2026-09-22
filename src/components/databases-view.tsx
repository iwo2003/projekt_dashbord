"use client";

import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import type { MysqlDatabase } from "@/lib/types";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type Payload = {
  databases: MysqlDatabase[];
  host: string;
  port: number;
  docker: boolean;
  running: boolean;
};

export function DatabasesView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function load() {
    const next = await api<Payload>("/api/databases");
    setData(next);
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<Payload>("/api/databases");
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

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ database: MysqlDatabase }>("/api/databases", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setName("");
      setRevealed(result.database.id);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(database: MysqlDatabase) {
    if (!window.confirm(t.databases.deleteAsk)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/databases/${database.id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  function copyConnection(database: MysqlDatabase) {
    if (!data) return;
    const line = `${database.username}:${database.password}@${data.host}:${data.port}/${database.name}`;
    void copyText(line).then(() => {
      setCopied(database.id);
      window.setTimeout(() => setCopied((current) => (current === database.id ? null : current)), 1600);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.databases.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.databases.lead}</p>
      </div>
      <ErrorNote code={error} />
      {data && !data.docker && error !== "docker_offline" ? <ErrorNote code="docker_offline" /> : null}
      {data ? (
        <p className={`chip ${data.running ? "text-mint" : "text-fog"}`}>
          <span className={data.running ? "pulse" : "h-2 w-2 rounded-full bg-current"} />
          {data.running ? t.databases.running : t.databases.stopped}
        </p>
      ) : null}
      {canManage ? (
        <form className="card grid gap-4 p-5 md:grid-cols-[1fr_auto] md:items-end" onSubmit={create}>
          <Field label={t.databases.name} hint={t.databases.nameHint}>
            <input
              className="field"
              value={name}
              autoComplete="off"
              spellCheck={false}
              pattern="[a-z][a-z0-9_]{1,31}"
              onChange={(event) => setName(event.target.value.toLowerCase())}
              required
            />
          </Field>
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? t.loading : t.databases.submit}
          </button>
          {busy ? <p className="text-sm text-fog md:col-span-2">{t.databases.starting}</p> : null}
        </form>
      ) : null}
      {data && data.databases.length === 0 ? <p className="text-fog">{t.databases.empty}</p> : null}
      <div className="grid gap-3">
        {data?.databases.map((database) => {
          const open = revealed === database.id;
          return (
            <article key={database.id} className="card space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="text-xl font-semibold tracking-tight">{database.name}</h2>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost" type="button" onClick={() => copyConnection(database)}>
                    {copied === database.id ? t.copied : t.copy}
                  </button>
                  {canManage ? (
                    <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void remove(database)}>
                      {t.delete}
                    </button>
                  ) : null}
                </div>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-fog">{t.databases.host}</dt>
                  <dd className="mt-1 font-mono">{data.host}</dd>
                </div>
                <div>
                  <dt className="text-fog">{t.databases.port}</dt>
                  <dd className="mt-1 font-mono">{data.port}</dd>
                </div>
                <div>
                  <dt className="text-fog">{t.databases.user}</dt>
                  <dd className="mt-1 font-mono">{database.username}</dd>
                </div>
                <div>
                  <dt className="text-fog">{t.databases.password}</dt>
                  <dd className="mt-1 flex items-center gap-2">
                    <span className="font-mono">{open ? database.password : "••••••••••••"}</span>
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => setRevealed(open ? null : database.id)}
                    >
                      {open ? t.databases.hide : t.databases.show}
                    </button>
                  </dd>
                </div>
              </dl>
              <p className="text-sm text-fog">{t.databases.local}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
