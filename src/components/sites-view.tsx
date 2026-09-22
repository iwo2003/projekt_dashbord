"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field } from "./ui";
import { RemoteFiles } from "./remote-files";
import { useI18n } from "./i18n-provider";

type Site = {
  id: string;
  name: string;
  domain: string;
  url: string;
  files: string[];
  php: boolean;
  createdAt: number;
};

type Payload = { sites: Site[]; running: boolean; mode: string; host: string };

export function SitesView({ canManage }: { canManage: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Payload | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [php, setPhp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    setData(await api<Payload>("/api/sites"));
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<Payload>("/api/sites");
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
    setBusy("create");
    setError(null);
    try {
      await api("/api/sites", { method: "POST", body: JSON.stringify({ name, domain, php }) });
      setName("");
      setDomain("");
      setPhp(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function upload(id: string, list: FileList | null) {
    if (!list || list.length === 0) return;
    setBusy(id);
    setError(null);
    const body = new FormData();
    for (const file of list) body.append("files", file);
    try {
      await api(`/api/sites/${id}/files`, { method: "POST", body });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(null);
    }
  }

  async function togglePhp(id: string, enabled: boolean) {
    setBusy(id);
    setError(null);
    try {
      await api(`/api/sites/${id}/php`, { method: "POST", body: JSON.stringify({ enabled }) });
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
      await api(`/api/sites/${id}`, { method: "DELETE" });
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
        <h1 className="text-3xl font-semibold tracking-tight">{t.sites.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.sites.lead}</p>
      </div>
      <ErrorNote code={error} />
      {data ? (
        <p className={`chip ${data.running ? "text-mint" : "text-fog"}`}>{data.running ? t.sites.running : t.sites.stopped}</p>
      ) : null}
      {canManage ? (
        <form className="card space-y-4 p-5" onSubmit={create}>
          <h2 className="text-xl font-semibold">{t.sites.install}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t.sites.name}>
              <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
            <Field label={t.sites.domain} hint={t.sites.domainHint}>
              <input
                className="field"
                value={domain}
                spellCheck={false}
                placeholder="twojadomena.pl"
                onChange={(event) => setDomain(event.target.value.trim().toLowerCase())}
                required
              />
            </Field>
          </div>
          <label className="flex items-start gap-3 text-sm">
            <input className="mt-1" type="checkbox" checked={php} onChange={(event) => setPhp(event.target.checked)} />
            <span>
              <span className="font-medium">{t.sites.php}</span>
              <span className="mt-1 block text-fog">{t.sites.phpHint}</span>
            </span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={busy !== null}>
            {busy === "create" ? t.loading : t.sites.install}
          </button>
        </form>
      ) : null}
      {data && data.sites.length === 0 ? <p className="text-sm text-fog">{t.sites.empty}</p> : null}
      <div className="space-y-4">
        {data?.sites.map((site) => (
          <article key={site.id} className="card space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{site.name}</h2>
                <p className="text-sm text-fog">
                  {site.domain}
                  {site.php ? <span className="ml-2 text-mint">{t.sites.phpBadge}</span> : null}
                </p>
                {site.url ? (
                  <a className="mt-1 inline-block font-mono text-sm text-amber" href={site.url} target="_blank" rel="noreferrer">
                    {site.url}
                  </a>
                ) : null}
              </div>
              {canManage ? (
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-ghost" type="button" disabled={busy !== null} onClick={() => void togglePhp(site.id, !site.php)}>
                    {busy === site.id ? t.loading : site.php ? t.sites.phpOff : t.sites.phpOn}
                  </button>
                  <button className="btn btn-danger" type="button" disabled={busy !== null} onClick={() => void remove(site.id)}>
                    {t.delete}
                  </button>
                </div>
              ) : null}
            </div>
            <p className="text-sm text-fog">{site.files.length ? site.files.join(", ") : t.sites.noFiles}</p>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-primary cursor-pointer">
                  {busy === site.id ? t.loading : t.sites.uploadZip}
                  <input
                    className="hidden"
                    type="file"
                    accept=".zip,application/zip"
                    disabled={busy !== null}
                    onChange={(event) => {
                      void upload(site.id, event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="btn btn-ghost cursor-pointer">
                  {t.sites.uploadFiles}
                  <input
                    className="hidden"
                    type="file"
                    multiple
                    disabled={busy !== null}
                    onChange={(event) => {
                      void upload(site.id, event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            ) : null}
            {canManage ? <RemoteFiles endpoint={`/api/sites/${site.id}/remote`} note={t.sites.remoteHint} /> : null}
          </article>
        ))}
      </div>
    </div>
  );
}
