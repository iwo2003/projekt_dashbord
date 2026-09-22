"use client";

import { useEffect, useState } from "react";
import { api, copyText } from "@/lib/client";
import { ErrorNote } from "./ui";
import { useI18n } from "./i18n-provider";

type RemoteState = {
  login: { username: string; password: string; createdAt: number } | null;
  host: string;
  sftpPort: number;
  ftpPort: number;
  sftpPath: string;
  ftpPath: string;
  passiveFrom: number;
  passiveTo: number;
  docker: boolean;
  sftp: boolean;
  ftp: boolean;
};

export function RemoteFiles({ endpoint, note }: { endpoint: string; note?: string }) {
  const { t } = useI18n();
  const [data, setData] = useState<RemoteState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const next = await api<RemoteState>(endpoint);
        if (!stop) setData(next);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, [endpoint]);

  async function enable(action: "enable" | "reset") {
    setBusy(true);
    setError(null);
    try {
      const next = await api<RemoteState>(endpoint, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setData(next);
      setOpen(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!window.confirm(t.files.remoteDisableAsk)) return;
    setBusy(true);
    setError(null);
    try {
      const next = await api<RemoteState>(endpoint, { method: "DELETE" });
      setData(next);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  function copy(kind: string, value: string) {
    void copyText(value).then(() => {
      setCopied(kind);
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 1600);
    });
  }

  return (
    <section className="card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{t.files.remoteTitle}</h2>
        <p className="mt-1 text-sm text-fog">{note ?? t.files.remoteLead}</p>
      </div>
      <ErrorNote code={error} />
      {data && !data.docker && error !== "docker_offline" ? <ErrorNote code="docker_offline" /> : null}
      {busy ? <p className="text-sm text-fog">{t.files.remoteStarting}</p> : null}
      {data?.login ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void enable("reset")}>
              {t.files.remoteReset}
            </button>
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void disable()}>
              {t.files.remoteDisable}
            </button>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <Protocol
              kind="sftp"
              title={t.files.remoteSftp}
              host={data.host}
              port={data.sftpPort}
              path={data.sftpPath}
              username={data.login.username}
              password={data.login.password}
              revealed={open}
              labels={t.files}
              copied={copied}
              copyText={t.copy}
              copiedText={t.copied}
              onToggle={() => setOpen((value) => !value)}
              onCopy={copy}
            />
            <Protocol
              kind="ftp"
              title={t.files.remoteFtp}
              host={data.host}
              port={data.ftpPort}
              path={data.ftpPath}
              username={data.login.username}
              password={data.login.password}
              revealed={open}
              labels={t.files}
              copied={copied}
              copyText={t.copy}
              copiedText={t.copied}
              onToggle={() => setOpen((value) => !value)}
              onCopy={copy}
            />
          </div>
          <p className="text-sm text-fog">{t.files.remotePassive}</p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-fog">{t.files.remoteOff}</p>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void enable("enable")}>
            {busy ? t.loading : t.files.remoteEnable}
          </button>
        </div>
      )}
    </section>
  );
}

function Protocol({
  kind,
  title,
  host,
  port,
  path,
  username,
  password,
  revealed,
  labels,
  copied,
  copyText,
  copiedText,
  onToggle,
  onCopy,
}: {
  kind: string;
  title: string;
  host: string;
  port: number;
  path: string;
  username: string;
  password: string;
  revealed: boolean;
  labels: {
    remoteHost: string;
    remotePort: string;
    remoteUser: string;
    remotePassword: string;
    remotePath: string;
    remoteShow: string;
    remoteHide: string;
  };
  copied: string | null;
  copyText: string;
  copiedText: string;
  onToggle: () => void;
  onCopy: (kind: string, value: string) => void;
}) {
  return (
    <article className="rounded-2xl border border-white/10 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">{title}</h3>
        <button
          className="btn btn-quiet"
          type="button"
          onClick={() => onCopy(kind, `${username}@${host}:${port} ${path} ${password}`)}
        >
          {copied === kind ? copiedText : copyText}
        </button>
      </div>
      <dl className="mt-3 grid gap-2 text-sm">
        <Row label={labels.remoteHost} value={host} />
        <Row label={labels.remotePort} value={String(port)} />
        <Row label={labels.remoteUser} value={username} />
        <div className="flex items-center justify-between gap-3">
          <dt className="text-fog">{labels.remotePassword}</dt>
          <dd className="flex items-center gap-2 font-mono">
            <span>{revealed ? password : "••••••••••••"}</span>
            <button className="btn btn-quiet" type="button" onClick={onToggle}>
              {revealed ? labels.remoteHide : labels.remoteShow}
            </button>
          </dd>
        </div>
        <Row label={labels.remotePath} value={path} />
      </dl>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-fog">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
