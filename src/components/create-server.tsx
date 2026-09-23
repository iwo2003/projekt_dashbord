"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";
import { CS2_MAPS, FS25_MAPS, GMOD_MAPS, MC_VERSIONS, TF2_MAPS } from "@/lib/constants";
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
  const [map, setMap] = useState("de_dust2");
  const [gslt, setGslt] = useState("");
  const [password, setPassword] = useState("");
  const [licenseKey, setLicenseKey] = useState("");
  const [onesync, setOnesync] = useState(true);
  const [cs2Mode, setCs2Mode] = useState<Cs2Mode>("competitive");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [gameMode, setGameMode] = useState<McMode>("survival");
  const [viewDistance, setViewDistance] = useState(10);
  const [onlineMode, setOnlineMode] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<{ suggested: Record<Game, number> }>("/api/servers")
      .then((data) => setPort(data.suggested[game]))
      .catch(() => undefined);
  }, [game]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const steam = game === "cs2" || game === "gmod" || game === "tf2";
    const body = {
      game,
      name,
      port,
      memoryGb,
      maxPlayers,
      ...(game === "minecraft"
        ? { mcType, version, motd: motd || name, difficulty, gameMode, viewDistance, onlineMode }
        : {}),
      ...(steam ? { map, gslt, password } : {}),
      ...(game === "cs2" ? { cs2Mode } : {}),
      ...(game === "fs25" ? { map, password } : {}),
      ...(game === "gta" ? { licenseKey, onesync, motd: motd || name } : {}),
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
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(
          [
            ["minecraft", t.servers.minecraft, t.create.mcLead, "Survival", 2, 20, "de_dust2"],
            ["cs2", t.servers.cs2, t.create.cs2Lead, "CS2", 4, 10, "de_dust2"],
            ["gmod", t.servers.gmod, t.create.gmodLead, "Garry's Mod", 2, 16, "gm_flatgrass"],
            ["fs25", t.servers.fs25, t.create.fs25Lead, "Farma", 4, 8, "MapUS"],
            ["tf2", t.servers.tf2, t.create.tf2Lead, "TF2", 2, 24, "ctf_2fort"],
            ["gta", t.servers.gta, t.create.gtaLead, "GTA V", 4, 48, ""],
          ] as const
        ).map(([id, title, text, label, memory, players, startMap]) => (
          <GameChoice
            key={id}
            active={game === id}
            title={title}
            text={text}
            onClick={() => {
              setGame(id);
              setName(label);
              setMemoryGb(memory);
              setMaxPlayers(players);
              setMap(startMap);
            }}
          />
        ))}
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
        ) : game === "fs25" ? (
          <>
            <Field label={t.create.map}>
              <select className="field" value={map} onChange={(event) => setMap(event.target.value)}>
                {FS25_MAPS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label={`${t.create.password} (${t.optional})`}>
              <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
          </>
        ) : game === "gta" ? (
          <>
            <div className="md:col-span-2">
              <Field
                label={t.create.license}
                hint={
                  <>
                    {t.create.licenseHint}{" "}
                    <a className="text-amber underline-offset-2 hover:underline" href="https://keymaster.fivem.net" target="_blank" rel="noreferrer">
                      keymaster.fivem.net
                    </a>
                  </>
                }
              >
                <input className="field font-mono" value={licenseKey} onChange={(event) => setLicenseKey(event.target.value.trim())} required />
              </Field>
            </div>
            <Field label={t.create.motd}>
              <input className="field" value={motd} onChange={(event) => setMotd(event.target.value)} placeholder={name} />
            </Field>
            <label className="mt-7 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onesync} onChange={(event) => setOnesync(event.target.checked)} />
              {t.create.onesync}
            </label>
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
                    {game === "gmod" ? ` ${t.create.gsltGmod}` : null}
                    {game === "tf2" ? ` ${t.create.gsltTf2}` : null}
                    {game === "cs2" ? ` ${t.create.gsltCs2}` : null}
                  </>
                }
              >
                <input className="field font-mono" value={gslt} onChange={(event) => setGslt(event.target.value.trim())} required />
              </Field>
            </div>
            <Field label={t.create.map}>
              <select className="field" value={map} onChange={(event) => setMap(event.target.value)}>
                {(game === "gmod" ? GMOD_MAPS : game === "tf2" ? TF2_MAPS : CS2_MAPS).map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </Field>
            {game === "cs2" ? (
              <Field label={t.create.mode}>
                <select className="field" value={cs2Mode} onChange={(event) => setCs2Mode(event.target.value as Cs2Mode)}>
                  <option value="competitive">{t.create.competitive}</option>
                  <option value="casual">{t.create.casual}</option>
                  <option value="wingman">{t.create.wingman}</option>
                  <option value="deathmatch">{t.create.deathmatch}</option>
                </select>
              </Field>
            ) : null}
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
