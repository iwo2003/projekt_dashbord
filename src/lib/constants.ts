import type { Cs2Mode } from "./types";

export const APP_NAME = "Helios";

export const MC_VERSIONS = [
  "LATEST",
  "26.3",
  "26.2",
  "26.1",
  "1.21.11",
  "1.21.8",
  "1.21.4",
  "1.21.1",
  "1.20.6",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.18.2",
] as const;

export const GMOD_MAPS = ["gm_flatgrass", "gm_construct"] as const;

export const TF2_MAPS = ["ctf_2fort", "cp_dustbowl", "pl_upward", "koth_harvest", "cp_process"] as const;

export const FS25_MAPS = ["MapUS", "MapEU"] as const;

export const CS2_MAPS = [
  "de_dust2",
  "de_mirage",
  "de_inferno",
  "de_nuke",
  "de_ancient",
  "de_anubis",
  "de_overpass",
  "de_train",
  "de_vertigo",
] as const;

export const CS2_MODES: Record<Cs2Mode, { type: string; mode: string }> = {
  competitive: { type: "0", mode: "1" },
  casual: { type: "0", mode: "0" },
  wingman: { type: "0", mode: "2" },
  deathmatch: { type: "1", mode: "2" },
};

export const IMAGES = {
  minecraftJava25: "itzg/minecraft-server:java25",
  minecraftJava21: "itzg/minecraft-server:java21",
  minecraftJava17: "itzg/minecraft-server:java17",
  cs2: "joedwards32/cs2:latest",
  gmod: "phyremaster/easy-gmod:latest",
  fs25: "toetje585/arch-fs25server:latest",
  tf2: "cm2network/tf2:latest",
  gta: "spritsail/fivem:latest",
} as const;

export function sidePort(game: "minecraft" | "cs2" | "gmod" | "fs25" | "tf2" | "gta", port: number) {
  if (game === "cs2" || game === "tf2") return port + 5;
  if (game === "gmod" || game === "fs25") return port + 1;
  return null;
}

export const PERMISSION_GROUPS = [
  { id: "panel", items: ["metrics.view", "panel.manage"] },
  {
    id: "servers",
    items: [
      "servers.view",
      "servers.create",
      "servers.delete",
      "servers.power",
      "servers.console",
      "servers.files",
      "servers.files.write",
      "servers.backups",
      "servers.settings",
    ],
  },
  { id: "accounts", items: ["users.view", "users.manage"] },
  { id: "databases", items: ["databases.view", "databases.manage"] },
  { id: "mail", items: ["mail.view", "mail.manage"] },
  { id: "firewall", items: ["firewall.view", "firewall.manage"] },
  { id: "sites", items: ["sites.view", "sites.manage"] },
  { id: "bots", items: ["bots.view", "bots.manage"] },
] as const;
