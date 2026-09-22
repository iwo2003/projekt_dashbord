"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, copyText } from "@/lib/client";
import { CS2_MAPS, FS25_MAPS, GMOD_MAPS, MC_VERSIONS, TF2_MAPS } from "@/lib/constants";
import { formatWhen } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Cs2Mode, Difficulty, McMode, McType, PublicServer, PublicUser } from "@/lib/types";
import { BackupsPanel } from "./backups-panel";
import { ConsolePanel } from "./console-panel";
import { FilesPanel } from "./files-panel";
import { PlayersPanel } from "./players-panel";
import { SchedulePanel } from "./schedule-panel";
import { statusText, gameLabel } from "./server-card";
import { ErrorNote, Field, Modal, statusTone } from "./ui";
import { useI18n } from "./i18n-provider";

const tabs = ["overview", "console", "players", "files", "backups", "plan", "settings"] as const;
type Tab = (typeof tabs)[number];

export function ServerDetail({ id, user }: { id: string; user: PublicUser }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [server, setServer] = useState<PublicServer | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const data = await api<{ server: PublicServer }>(`/api/servers/${id}`);
        if (!stop) setServer(data.server);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [id]);

  async function power(action: "start" | "stop" | "restart" | "update") {
    if (action === "update" && !window.confirm(t.servers.updateAsk)) return;
    setError(null);
    try {
      const data = await api<{ server: PublicServer }>(`/api/servers/${id}/power`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setServer(data.server);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    }
  }

  async function remove() {
    await api(`/api/servers/${id}`, { method: "DELETE" });
    router.push("/servers");
    router.refresh();
  }

  if (!server) {
    return error ? <ErrorNote code={error} /> : <p className="text-fog">{t.loading}</p>;
  }

  const visibleTabs = tabs.filter((item) => {
    if (item === "console") return can(user, "servers.console");
    if (item === "players") return can(user, "servers.console") || can(user, "servers.power");
    if (item === "files") return can(user, "servers.files");
    if (item === "backups") return can(user, "servers.backups");
    if (item === "plan" || item === "settings") return can(user, "servers.settings");
    return true;
  });

  return (
    <div className="space-y-5">
      <Link className="text-sm text-fog" href="/servers">
        ← {t.nav.servers}
      </Link>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-fog">
            {gameLabel(t, server.game)}
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{server.name}</h1>
          <p className={`mt-2 text-sm ${statusTone(server.status)}`}>{statusText(t, server)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(user, "servers.power") ? (
            server.status === "running" ? (
              <>
                <button className="btn btn-ghost" type="button" onClick={() => void power("restart")}>
                  {t.servers.restart}
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void power("stop")}>
                  {t.servers.stop}
                </button>
              </>
            ) : (
              <button className="btn btn-primary" type="button" disabled={server.status === "provisioning"} onClick={() => void power("start")}>
                {t.servers.start}
              </button>
            )
          ) : null}
          {can(user, "servers.power") ? (
            <button className="btn btn-ghost" type="button" disabled={server.status === "provisioning"} onClick={() => void power("update")}>
              {t.servers.update}
            </button>
          ) : null}
          {can(user, "servers.delete") ? (
            <button className="btn btn-danger" type="button" onClick={() => setConfirmDelete(true)}>
              {t.delete}
            </button>
          ) : null}
        </div>
      </div>
      <ErrorNote code={error} />
      {server.error ? (
        <div className="card p-4 text-sm">
          <p className="font-medium text-coral">{t.detail.errorTitle}</p>
          <p className="mt-1 text-fog">
            {server.error === "provision_interrupted"
              ? t.detail.interrupted
              : server.error === "plugins_failed"
                ? t.detail.pluginsFailed
                : server.error}
          </p>
        </div>
      ) : null}
      <div className="flex gap-2 overflow-x-auto">
        {visibleTabs.map((item) => (
          <button
            key={item}
            type="button"
            className={`chip ${tab === item ? "bg-amber text-ink" : ""}`}
            onClick={() => setTab(item)}
          >
            {t.detail[item]}
          </button>
        ))}
      </div>
      <section className="card p-5">
        {tab === "overview" ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm text-fog">{t.detail.connect}</p>
              <button
                type="button"
                className="mt-1 font-mono text-lg text-amber"
                onClick={() => {
                  void copyText(server.connect).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1200);
                  });
                }}
              >
                {copied ? t.copied : server.connect}
              </button>
              <p className="mt-2 max-w-xl text-sm text-fog">
                {server.game === "minecraft"
                  ? t.detail.mcConnect
                  : server.game === "fs25"
                    ? t.detail.fs25Connect
                    : server.game === "gmod"
                      ? t.detail.gmodConnect
                      : server.game === "tf2"
                        ? t.detail.tf2Connect
                        : t.detail.cs2Connect}
              </p>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Info label={t.create.memory} value={`${server.config.memoryGb} GB`} />
              <Info label={t.create.players} value={String(server.config.maxPlayers)} />
              <Info label={t.create.port} value={String(server.port)} />
              {server.game === "minecraft" ? (
                <>
                  <Info label={t.detail.engine} value={server.config.mcType ?? "PAPER"} />
                  <Info label={t.create.version} value={server.config.version ?? "LATEST"} />
                </>
              ) : server.game === "cs2" ? (
                <>
                  <Info label={t.create.map} value={server.config.map ?? "de_dust2"} />
                  <Info label={t.create.mode} value={server.config.cs2Mode ?? "competitive"} />
                </>
              ) : (
                <Info label={t.create.map} value={server.config.map ?? (server.game === "fs25" ? "MapUS" : server.game === "tf2" ? "ctf_2fort" : "gm_flatgrass")} />
              )}
              {server.game === "fs25" && server.extraPort ? (
                <Info label={t.detail.web} value={String(server.extraPort)} />
              ) : null}
              <Info
                label={t.detail.created}
                value={`${formatWhen(server.createdAt, lang)}${server.createdBy ? ` ${t.detail.by} ${server.createdBy}` : ""}`}
              />
            </dl>
          </div>
        ) : null}
        {tab === "console" ? <ConsolePanel id={server.id} running={server.status === "running"} /> : null}
        {tab === "players" ? (
          <PlayersPanel id={server.id} running={server.status === "running"} game={server.game} canPower={can(user, "servers.power")} />
        ) : null}
        {tab === "files" ? <FilesPanel id={server.id} user={user} /> : null}
        {tab === "backups" ? <BackupsPanel id={server.id} /> : null}
        {tab === "plan" ? <SchedulePanel id={server.id} /> : null}
        {tab === "settings" ? <SettingsForm server={server} onSaved={setServer} /> : null}
      </section>
      <Modal open={confirmDelete} title={t.detail.deleteTitle} onClose={() => setConfirmDelete(false)}>
        <div className="space-y-4">
          <p className="text-sm text-fog">{t.detail.deleteLead}</p>
          <div className="flex gap-2">
            <button className="btn btn-danger" type="button" onClick={() => void remove()}>
              {t.delete}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setConfirmDelete(false)}>
              {t.cancel}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-fog">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

function SettingsForm({
  server,
  onSaved,
}: {
  server: PublicServer;
  onSaved: (server: PublicServer) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(server.name);
  const [port, setPort] = useState(server.port);
  const [memoryGb, setMemoryGb] = useState(server.config.memoryGb);
  const [maxPlayers, setMaxPlayers] = useState(server.config.maxPlayers);
  const [mcType, setMcType] = useState<McType>(server.config.mcType ?? "PAPER");
  const [version, setVersion] = useState(server.config.version ?? "LATEST");
  const [motd, setMotd] = useState(server.config.motd ?? "");
  const [map, setMap] = useState(server.config.map ?? "de_dust2");
  const [gslt, setGslt] = useState(server.config.gslt ?? "");
  const [password, setPassword] = useState(server.config.password ?? "");
  const [cs2Mode, setCs2Mode] = useState<Cs2Mode>(server.config.cs2Mode ?? "competitive");
  const [difficulty, setDifficulty] = useState<Difficulty>(server.config.difficulty ?? "normal");
  const [gameMode, setGameMode] = useState<McMode>(server.config.gameMode ?? "survival");
  const [viewDistance, setViewDistance] = useState(server.config.viewDistance ?? 10);
  const [onlineMode, setOnlineMode] = useState(server.config.onlineMode !== false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const steam = server.game === "cs2" || server.game === "gmod" || server.game === "tf2";
    const body = {
      name,
      port,
      memoryGb,
      maxPlayers,
      ...(server.game === "minecraft" ? { mcType, version, motd, difficulty, gameMode, viewDistance, onlineMode } : {}),
      ...(steam ? { map, gslt, password, ...(server.game === "cs2" ? { cs2Mode } : {}) } : {}),
      ...(server.game === "fs25" ? { map, password } : {}),
    };
    try {
      const data = await api<{ server: PublicServer }>(`/api/servers/${server.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onSaved(data.server);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={save}>
      <p className="text-sm text-fog md:col-span-2">{t.detail.settingsLead}</p>
      {server.game === "minecraft" ? <p className="text-sm text-amber md:col-span-2">{t.detail.versionWarn}</p> : null}
      <ErrorNote code={error} />
      <Field label={t.create.name}>
        <input className="field" value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label={t.create.port}>
        <input className="field" type="number" min={1024} max={65535} value={port} onChange={(event) => setPort(Number(event.target.value))} />
      </Field>
      <Field label={`${t.create.memory}: ${memoryGb} GB`}>
        <input type="range" min={1} max={16} value={memoryGb} onChange={(event) => setMemoryGb(Number(event.target.value))} className="w-full accent-amber" />
      </Field>
      <Field label={t.create.players}>
        <input className="field" type="number" min={1} max={100} value={maxPlayers} onChange={(event) => setMaxPlayers(Number(event.target.value))} />
      </Field>
      {server.game === "minecraft" ? (
        <>
          <Field label={t.create.type}>
            <select className="field" value={mcType} onChange={(event) => setMcType(event.target.value as McType)}>
              <option value="PAPER">Paper</option>
              <option value="VANILLA">Vanilla</option>
            </select>
          </Field>
          <Field label={t.create.version}>
            <select className="field" value={version} onChange={(event) => setVersion(event.target.value)}>
              {MC_VERSIONS.map((item) => (
                <option key={item} value={item}>
                  {item === "LATEST" ? t.create.latest : item}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t.create.motd}>
            <input className="field" value={motd} onChange={(event) => setMotd(event.target.value)} />
          </Field>
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
        </>
      ) : server.game === "fs25" ? (
        <>
          <Field label={t.create.map}>
            <select className="field" value={map} onChange={(event) => setMap(event.target.value)}>
              {FS25_MAPS.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          <Field label={t.create.password}>
            <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        </>
      ) : (
        <>
          <Field label={t.create.gslt}>
            <input className="field font-mono" value={gslt} onChange={(event) => setGslt(event.target.value.trim())} required />
          </Field>
          <Field label={t.create.map}>
            <select className="field" value={map} onChange={(event) => setMap(event.target.value)}>
              {(server.game === "gmod" ? GMOD_MAPS : server.game === "tf2" ? TF2_MAPS : CS2_MAPS).map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
          {server.game === "cs2" ? (
            <Field label={t.create.mode}>
              <select className="field" value={cs2Mode} onChange={(event) => setCs2Mode(event.target.value as Cs2Mode)}>
                <option value="competitive">{t.create.competitive}</option>
                <option value="casual">{t.create.casual}</option>
                <option value="wingman">{t.create.wingman}</option>
                <option value="deathmatch">{t.create.deathmatch}</option>
              </select>
            </Field>
          ) : null}
          <Field label={t.create.password}>
            <input className="field" value={password} onChange={(event) => setPassword(event.target.value)} />
          </Field>
        </>
      )}
      <div className="md:col-span-2">
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? t.loading : t.save}
        </button>
      </div>
    </form>
  );
}
