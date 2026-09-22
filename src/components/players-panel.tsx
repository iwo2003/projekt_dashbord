"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

type Player = { name: string; id: string; steam: string };
type Snapshot = { online: Player[]; banned: Player[] };

export function PlayersPanel({ id, running, game, canPower }: { id: string; running: boolean; game: string; canPower: boolean }) {
  const { t } = useI18n();
  const [data, setData] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");

  async function load() {
    const next = await api<Snapshot>(`/api/servers/${id}/players`);
    setData(next);
  }

  useEffect(() => {
    if (!running) return;
    let stop = false;
    async function run() {
      try {
        const next = await api<Snapshot>(`/api/servers/${id}/players`);
        if (!stop) setData(next);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, [id, running]);

  async function act(action: "kick" | "ban" | "pardon", value: string) {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/servers/${id}/players`, {
        method: "POST",
        body: JSON.stringify({ action, target: value, reason }),
      });
      setTarget("");
      setReason("");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  if (!running) return <p className="text-sm text-fog">{t.players.offline}</p>;

  return (
    <div className="space-y-4">
      <ErrorNote code={error} />
      <div>
        <h2 className="text-lg font-semibold">{t.players.online}</h2>
        {data && data.online.length === 0 ? <p className="mt-2 text-sm text-fog">{t.players.nobody}</p> : null}
        <ul className="mt-2 space-y-2">
          {data?.online.map((player) => (
            <li key={`${player.id}-${player.name}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">{player.name}</span>
              {canPower ? (
                <span className="flex gap-2">
                  <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void act("kick", player.id)}>
                    {t.players.kick}
                  </button>
                  <button
                    className="btn btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() => void act("ban", game === "cs2" ? player.steam || player.id : player.name)}
                  >
                    {t.players.ban}
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
      {canPower ? (
      <form
        className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          void act("ban", target);
        }}
      >
        <Field label={t.players.name}>
          <input className="field" value={target} onChange={(event) => setTarget(event.target.value.trim())} required />
        </Field>
        <Field label={t.players.reason}>
          <input className="field" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <div className="flex gap-2">
          <button className="btn btn-danger" type="submit" disabled={busy}>
            {t.players.ban}
          </button>
          <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void act("pardon", target)}>
            {t.players.pardon}
          </button>
        </div>
      </form>
      ) : null}
      <div>
        <h2 className="text-lg font-semibold">{t.players.banned}</h2>
        {game === "cs2" ? <p className="mt-1 text-sm text-fog">{t.players.cs2Ban}</p> : null}
        {data && data.banned.length === 0 ? <p className="mt-2 text-sm text-fog">{t.players.noBans}</p> : null}
        <ul className="mt-2 space-y-2">
          {data?.banned.map((player) => (
            <li key={player.id} className="flex items-center justify-between gap-2 text-sm">
              <span>{player.name}</span>
              {canPower ? (
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => void act("pardon", player.name)}>
                  {t.players.pardon}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
