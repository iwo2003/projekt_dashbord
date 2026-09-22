"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client";
import { formatBytes, formatWhen } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { PublicUser } from "@/lib/types";
import { ErrorNote, Field, Modal } from "./ui";
import { RemoteFiles } from "./remote-files";
import { useI18n } from "./i18n-provider";

type Entry = { name: string; type: "dir" | "file"; size: number; mtime: number };

export function FilesPanel({ id, user }: { id: string; user: PublicUser }) {
  const { t, lang } = useI18n();
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [file, setFile] = useState<{ path: string; content: string; editable: boolean } | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const writable = can(user, "servers.files.write");

  const load = useCallback(async (next = "") => {
    const data = await api<{ path: string; entries: Entry[] }>(
      `/api/servers/${id}/files?path=${encodeURIComponent(next)}`,
    );
    setPath(data.path);
    setEntries(data.entries);
    setFile(null);
  }, [id]);

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const data = await api<{ path: string; entries: Entry[] }>(`/api/servers/${id}/files?path=`);
        if (stop) return;
        setPath(data.path);
        setEntries(data.entries);
        setFile(null);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, [id]);

  async function openEntry(entry: Entry) {
    const next = [path, entry.name].filter(Boolean).join("/");
    setError(null);
    try {
      if (entry.type === "dir") {
        await load(next);
        return;
      }
      const data = await api<{ path: string; content: string | null; editable: boolean }>(
        `/api/servers/${id}/files?mode=file&path=${encodeURIComponent(next)}`,
      );
      setFile({ path: data.path, content: data.content ?? "", editable: data.editable });
      setDraft(data.content ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  async function save() {
    if (!file) return;
    try {
      await api(`/api/servers/${id}/files`, {
        method: "POST",
        body: JSON.stringify({ action: "write", path: file.path, content: draft }),
      });
      setFile({ ...file, content: draft });
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  async function upload(list: FileList | null) {
    const item = list?.[0];
    if (!item) return;
    const body = new FormData();
    body.set("file", item);
    body.set("path", path);
    try {
      await api(`/api/servers/${id}/files/upload`, { method: "POST", body });
      await load(path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(t.files.deleteAsk)) return;
    const target = [path, entry.name].filter(Boolean).join("/");
    try {
      await api(`/api/servers/${id}/files?path=${encodeURIComponent(target)}`, { method: "DELETE" });
      await load(path);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  const crumbs = path.split("/").filter(Boolean);

  return (
    <div className="space-y-4">
      {writable ? <RemoteFiles endpoint={`/api/servers/${id}/remote`} /> : null}
      <ErrorNote code={error} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="text-amber" type="button" onClick={() => void load("")}>
          {t.files.root}
        </button>
        {crumbs.map((crumb, index) => {
          const next = crumbs.slice(0, index + 1).join("/");
          return (
            <button key={next} type="button" className="text-fog" onClick={() => void load(next)}>
              / {crumb}
            </button>
          );
        })}
      </div>
      {file ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" type="button" onClick={() => setFile(null)}>
              {t.back}
            </button>
            <a className="btn btn-ghost" href={`/api/servers/${id}/files/raw?path=${encodeURIComponent(file.path)}`}>
              {t.files.download}
            </a>
            {file.editable && writable ? (
              <button className="btn btn-primary" type="button" onClick={() => void save()}>
                {t.files.save}
              </button>
            ) : null}
          </div>
          {file.editable ? (
            <textarea className="field min-h-80 font-mono text-sm" value={draft} onChange={(event) => setDraft(event.target.value)} readOnly={!writable} />
          ) : (
            <p className="text-sm text-fog">{t.files.binary}</p>
          )}
        </div>
      ) : (
        <>
          {writable ? (
            <div className="flex flex-wrap gap-2">
              <label className="btn btn-ghost cursor-pointer">
                {t.files.upload}
                <input className="hidden" type="file" onChange={(event) => void upload(event.target.files)} />
              </label>
              <button className="btn btn-ghost" type="button" onClick={() => setFolderOpen(true)}>
                {t.files.newFolder}
              </button>
            </div>
          ) : null}
          {entries.length === 0 ? (
            <p className="text-sm text-fog">{t.files.empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.12em] text-fog">
                  <tr>
                    <th className="py-2 font-medium">{t.files.name}</th>
                    <th className="py-2 font-medium">{t.files.size}</th>
                    <th className="py-2 font-medium">{t.files.modified}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.name} className="border-t border-white/8">
                      <td className="py-2">
                        <button type="button" className="text-left hover:text-amber" onClick={() => void openEntry(entry)}>
                          {entry.type === "dir" ? `${entry.name}/` : entry.name}
                        </button>
                      </td>
                      <td className="py-2 text-fog">{entry.type === "dir" ? "—" : formatBytes(entry.size)}</td>
                      <td className="py-2 text-fog">{formatWhen(entry.mtime, lang)}</td>
                      <td className="py-2 text-right">
                        {writable ? (
                          <button className="btn btn-quiet" type="button" onClick={() => void remove(entry)}>
                            {t.delete}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <Modal open={folderOpen} title={t.files.newFolder} onClose={() => setFolderOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const next = [path, folderName.trim()].filter(Boolean).join("/");
            await api(`/api/servers/${id}/files`, {
              method: "POST",
              body: JSON.stringify({ action: "mkdir", path: next }),
            });
            setFolderName("");
            setFolderOpen(false);
            await load(path);
          }}
        >
          <Field label={t.files.folderName}>
            <input className="field" value={folderName} onChange={(event) => setFolderName(event.target.value)} required />
          </Field>
          <button className="btn btn-primary" type="submit">
            {t.createAction}
          </button>
        </form>
      </Modal>
    </div>
  );
}
