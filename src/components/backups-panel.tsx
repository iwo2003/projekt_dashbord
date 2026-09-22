"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatBytes, formatWhen } from "@/lib/format";
import type { BackupInfo } from "@/lib/types";
import { ErrorNote } from "./ui";
import { useI18n } from "./i18n-provider";

export function BackupsPanel({ id }: { id: string }) {
  const { t, lang } = useI18n();
  const [items, setItems] = useState<BackupInfo[]>([]);
  const [safe, setSafe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await api<{ backups: BackupInfo[] }>(`/api/servers/${id}/backups`);
    setItems(data.backups);
  }, [id]);

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const data = await api<{ backups: BackupInfo[] }>(`/api/servers/${id}/backups`);
        if (!stop) setItems(data.backups);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, [id]);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/backups`, { method: "POST", body: JSON.stringify({ safe }) });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function restore(backupId: string) {
    if (!window.confirm(t.backups.restoreAsk)) return;
    setBusy(true);
    try {
      await api(`/api/servers/${id}/backups/${backupId}`, { method: "POST" });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(backupId: string) {
    setBusy(true);
    try {
      await api(`/api/servers/${id}/backups/${backupId}`, { method: "DELETE" });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-fog">{t.backups.lead}</p>
      <ErrorNote code={error} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={safe} onChange={(event) => setSafe(event.target.checked)} />
        <span>
          {t.backups.safe}
          <span className="mt-1 block text-xs text-fog">{t.backups.safeHint}</span>
        </span>
      </label>
      <button className="btn btn-primary" type="button" disabled={busy} onClick={() => void make()}>
        {busy ? t.loading : t.backups.make}
      </button>
      {items.length === 0 ? (
        <p className="text-sm text-fog">{t.backups.empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-fog">
              <tr>
                <th className="py-2 font-medium">{t.backups.when}</th>
                <th className="py-2 font-medium">{t.files.size}</th>
                <th className="py-2 font-medium">{t.backups.who}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/8">
                  <td className="py-2">{formatWhen(item.createdAt, lang)}</td>
                  <td className="py-2 text-fog">{formatBytes(item.bytes)}</td>
                  <td className="py-2 text-fog">{item.createdBy ?? "—"}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <a className="btn btn-quiet" href={`/api/servers/${id}/backups/${item.id}`}>
                        {t.backups.download}
                      </a>
                      <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => void restore(item.id)}>
                        {t.backups.restore}
                      </button>
                      <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => void remove(item.id)}>
                        {t.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
