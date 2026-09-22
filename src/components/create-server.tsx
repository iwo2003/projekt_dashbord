"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { CS2_MAPS, MC_VERSIONS } from "@/lib/constants";
import type { Cs2Mode, Difficulty, Game, McMode, McType } from "@/lib/types";
import { ErrorNote, Field } from "./ui";
import { useI18n } from "./i18n-provider";

export function CreateServer() {
  const { t } = useI18n();
  const router = useRouter();
  const [game, setGame] = useState<Game>("minecraft");
  const [name, setName] = useState("Survival");
  const [port, setPort] = useState(0);
  const [memoryGb, setMemoryGb] = useState(2);
  const [maxPlayers, setMaxPlayers] = useState(20);
  const [mcType, setMcType] = useState<McType>("PAPER");
  const [version, setVersion] = useState<(typeof MC_VERSIONS)[number]>("LATEST");
  const [motd, setMotd] = useState("");
  const [map, setMap] = useState<(typeof CS2_MAPS)[number]>("de_dust2");
  const [gslt, setGslt] = useState("");
  const [password, setPassword] = useState("");
  const [cs2Mode, setCs2Mode] = useState<Cs2Mode>("competitive");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [gameMode, setGameMode] = useState<McMode>("survival");
  const [viewDistance, setViewDistance] = useState(10);
  const [onlineMode, setOnlineMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ suggested: { minecraft: number; cs2: number } }>("/api/servers")
      .then((data) => setPort(game === "minecraft" ? data.suggested.minecraft : data.suggested.cs2))
      .catch(() => undefined);
  }, [game]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body =
      game === "minecraft"
        ? {
            game,
            name,
            port,
            memoryGb,
            maxPlayers,
            mcType,
            version,
            motd: motd || name,
            difficulty,
            gameMode,
            viewDistance,
            onlineMode,
          }
        : {
            game,
            name,
            port,
            memoryGb,
            maxPlayers,
            map,
            gslt,
            password,
            cs2Mode,
          };
    try {
      const data = await api<{ server: { id: string } }>("/api/servers", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push(`/servers/${data.server.id}`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={submit}>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t.create.title}</h1>
        <p className="mt-2 max-w-2xl text-fog">{t.create.lead}</p>
      </div>
      <ErrorNote code={error} />
      <div className="grid gap-3 md:grid-cols-2">
        <GameChoice
          active={game === "minecraft"}
          title={t.servers.minecraft}
          text={t.create.mcLead}
          onClick={() => {
            setGame("minecraft");
            setName("Survival");
            setMemoryGb(2);
            setMaxPlayers(20);
          }}
        />
        <GameChoice
          active={game === "cs2"}
          title={t.servers.cs2}
          text={t.create.cs2Lead}
          onClick={() => {
            setGame("cs2");
            setName("CS2");
            setMemoryGb(4);
            setMaxPlayers(10);
          }}
        />
      </div>
      <div className="card grid gap-4 p-5 md:grid-cols-2">
        <Field label={t.create.name}>
          <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label={t.create.port} hint={t.create.portHint}>
          <input className="field" type="number" min={1024} max={65535} value={port || ""} onChange={(event) => setPort(Number(event.target.value))} required />
        </Field>
        <Field label={`${t.create.memory}: ${memoryGb} ${t.create.gb}`}>
          <input className="w-full accent-amber" type="range" min={1} max={16} value={memoryGb} onChange={(event) => setMemoryGb(Number(event.target.value))} />
        </Field>
        <Field label={t.create.players}>
          <input className="field" type="number" min={1} max={game === "cs2" ? 64 : 100} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} required />
        </Field>
        {game === "minecraft" ? (
          <>
            <Field label={t.create.type}>
              <select className="field" value={mcType} onChange={(event) => setMcType(event.target.value as McType)}>
                <option value="PAPER">Paper</option>
                <option value="VANILLA">Vanilla</option>
              </select>
            </Field>
            <Field label={t.create.version}>
              <select className="field" value={version} onChange={(event) => setVersion(event.target.value as (typeof MC_VERSIONS)[number])}>
                {MC_VERSIONS.map((item) => (
                  <option key={item} value={item}>
                    {item === "LATEST" ? t.create.latest : item}
                  </option>
                ))}
              </select>
            </Field>
            <div className="md:col-span-2">
              <Field label={t.create.motd}>
                <input className="field" value={motd} onChange={(event) => setMotd(event.target.value)} placeholder={name} />
              </Field>
            </div>
          </>
        ) : (
          <>
            <div className="md:col-span-2">
              <Field
                label={t.create.gslt}
                hint={
                  <>
                    {t.create.gsltHint}{" "}
                    <a className="text-amber underline-offset-2 hover:underline" href="https://steamcommunity.com/dev/managegameservers" target="_blank" rel="noreferrer">
                      steamcommunity.com/dev/managegameservers
                    </a>
                  </>
                }
              >
                <input className="field font-mono" value={gslt} onChange={(event) => setGslt(event.target.value.trim())} required />
              </Field>
            </div>
            <Field label={t.create.map}>
              <select className="field" value={map} onChange={(event) => setMap(event.target.value as (typeof CS2_MAPS)[number])}>
                {CS2_MAPS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label={t.create.mode}>
              <select className="field" value={cs2Mode} onChange={(event) => setCs2Mode(event.target.value as Cs2Mode)}>
                <option value="competitive">{t.create.competitive}</option>
                <option value="casual">{t.create.casual}</option>
                <option value="wingman">{t.create.wingman}</option>
                <option value="deathmatch">{t.create.deathmatch}</option>
              </select>
            </Field>
            <Field label={`${t.create.password} (${t.optional})`}>
              <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
          </>
        )}
      </div>
      {game === "minecraft" ? (
        <details className="card p-5">
          <summary className="cursor-pointer font-medium">{t.create.advanced}</summary>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t.create.difficulty}>
              <select className="field" value={difficulty} onChange={(event) => setDifficulty(event.target.value as Difficulty)}>
                <option value="peaceful">{t.create.peaceful}</option>
                <option value="easy">{t.create.easy}</option>
                <option value="normal">{t.create.normal}</option>
                <option value="hard">{t.create.hard}</option>
              </select>
            </Field>
            <Field label={t.create.gamemode}>
              <select className="field" value={gameMode} onChange={(event) => setGameMode(event.target.value as McMode)}>
                <option value="survival">{t.create.survival}</option>
                <option value="creative">{t.create.creative}</option>
                <option value="adventure">{t.create.adventure}</option>
              </select>
            </Field>
            <Field label={t.create.view}>
              <input className="field" type="number" min={4} max={32} value={viewDistance} onChange={(event) => setViewDistance(Number(event.target.value))} />
            </Field>
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlineMode} onChange={(event) => setOnlineMode(event.target.checked)} />
              {t.create.online}
            </label>
          </div>
        </details>
      ) : null}
      <button className="btn btn-primary" disabled={busy || port < 1024} type="submit">
        {busy ? t.loading : t.create.submit}
      </button>
    </form>
  );
}

function GameChoice({
  active,
  title,
  text,
  onClick,
}: {
  active: boolean;
  title: string;
  text: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-5 text-left ${active ? "ring-2 ring-amber" : ""}`}
    >
      <p className="text-lg font-semibold">{title}</p>
      <p className="mt-2 text-sm text-fog">{text}</p>
    </button>
  );
}
