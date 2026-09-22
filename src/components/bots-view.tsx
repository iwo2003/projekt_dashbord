"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field } from "./ui";
import { RemoteFiles } from "./remote-files";
import { useI18n } from "./i18n-provider";

type Bot = { id: string; name: string; status: string; tokenSet: boolean; createdAt: number };

export function BotsView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [logs, setLogs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const data = await api<{ bots: Bot[] }>("/api/bots");
    setBots(data.bots);
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const data = await api<{ bots: Bot[] }>("/api/bots");
        if (!stop) setBots(data.bots);
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
    setBusy("create");
    setError(null);
    try {
      await api("/api/bots", { method: "POST", body: JSON.stringify({ name, token }) });
      setName("");
      setToken("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function power(id: string, action: "start" | "stop" | "restart") {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/bots/${id}`, { method: "POST", body: JSON.stringify({ action }) });
      await load();
      await showLogs(id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function showLogs(id: string) {
    const data = await api<{ logs: string }>(`/api/bots/${id}/logs`);
    setLogs((current) => ({ ...current, [id]: data.logs }));
  }

  async function upload(id: string, list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(id);
    setError(null);
    const body = new FormData();
    for (const file of list) body.append("files", file);
    try {
      await api(`/api/bots/${id}/files`, { method: "POST", body });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/bots/${id}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.bots.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.bots.lead}</p>
      </div>
      <ErrorNote code={error} />
      {canManage ? (
        <form className="card space-y-4 p-5" onSubmit={create}>
          <h2 className="text-xl font-semibold">{t.bots.add}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.bots.name}>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label={t.bots.token} hint={t.bots.tokenHint}>
              <input className="field" value={token} autoComplete="off" spellCheck={false} onChange={(event) => setToken(event.target.value.trim())} required />
            </Field>
          </div>
          <button className="btn btn-primary" type="submit" disabled={busy !== null}>
            {busy === "create" ? t.loading : t.bots.add}
          </button>
        </form>
      ) : null}
      {bots.length === 0 ? <p className="text-sm text-fog">{t.bots.empty}</p> : null}
      <div className="space-y-4">
        {bots.map((bot) => (
          <article key={bot.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{bot.name}</h2>
                <p className={`text-sm ${bot.status === "running" ? "text-mint" : "text-fog"}`}>
                  {bot.status === "running" ? t.bots.running : bot.status === "error" ? t.bots.failed : t.bots.stopped}
                </p>
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  {bot.status === "running" ? (
                    <>
                      <button className="btn btn-ghost" type="button" disabled={busy !== null} onClick={() => void power(bot.id, "restart")}>
                        {t.bots.restart}
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={busy !== null} onClick={() => void power(bot.id, "stop")}>
                        {t.bots.stop}
                      </button>
                    </>
                  ) : (
                    <button className="btn btn-primary" type="button" disabled={busy !== null} onClick={() => void power(bot.id, "start")}>
                      {t.bots.start}
                    </button>
                  )}
                  <button className="btn btn-danger" type="button" disabled={busy !== null} onClick={() => void remove(bot.id)}>
                    {t.delete}
                  </button>
                </div>
              ) : null}
            </div>
            {canManage ? (
              <label className="btn btn-ghost cursor-pointer">
                {t.bots.upload}
                <input
                  className="hidden"
                  type="file"
                  multiple
                  accept=".zip,.js,.json,.mjs,.sh,application/zip"
                  disabled={busy !== null}
                  onChange={(event) => {
                    void upload(bot.id, event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            ) : null}
            {canManage ? <RemoteFiles endpoint={`/api/bots/${bot.id}/remote`} note={t.bots.remoteHint} /> : null}
            <div>
              <button className="btn btn-ghost" type="button" onClick={() => void showLogs(bot.id)}>
                {t.bots.logs}
              </button>
              {logs[bot.id] != null ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-3 text-xs leading-5 text-fog">
                  {logs[bot.id] || t.bots.noLogs}
                </pre>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
