"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type Schedule = {
  restartAt: string;
  backupAt: string;
  stopAt: string;
  startAt: string;
};

export function SchedulePanel({ id }: { id: string }) {
  const { t } = useI18n();
  const [form, setForm] = useState<Schedule>({ restartAt: "", backupAt: "", stopAt: "", startAt: "" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const data = await api<{ schedule: Schedule }>(`/api/servers/${id}/schedule`);
        if (!stop) setForm(data.schedule);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, [id]);

  function set(key: keyof Schedule, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ schedule: Schedule }>(`/api/servers/${id}/schedule`, {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setForm(data.schedule);
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={save}>
      <p className="text-sm text-fog">{t.plan.lead}</p>
      <ErrorNote code={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t.plan.restart} hint={t.plan.empty}>
          <input className="field" type="time" value={form.restartAt} onChange={(event) => set("restartAt", event.target.value)} />
        </Field>
        <Field label={t.plan.backup} hint={t.plan.backupHint}>
          <input className="field" type="time" value={form.backupAt} onChange={(event) => set("backupAt", event.target.value)} />
        </Field>
        <Field label={t.plan.stop} hint={t.plan.empty}>
          <input className="field" type="time" value={form.stopAt} onChange={(event) => set("stopAt", event.target.value)} />
        </Field>
        <Field label={t.plan.start} hint={t.plan.empty}>
          <input className="field" type="time" value={form.startAt} onChange={(event) => set("startAt", event.target.value)} />
        </Field>
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>
        {busy ? t.loading : t.save}
      </button>
      {saved ? <p className="text-sm text-mint">{t.plan.saved}</p> : null}
    </form>
  );
}
