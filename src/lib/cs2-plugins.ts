import { execFile } from "child_process";
import fs from "fs/promises";
import path from "path";
import { promisify } from "util";

const exec = promisify(execFile);

const PRE_SH = `#!/bin/bash
echo "Helios: Metamod i CounterStrikeSharp"
ROOT="\${STEAMAPPDIR:-/home/steam/cs2-dedicated}"
GAME="$ROOT/game/csgo"
PLUGIN_DIR="$ROOT/.helios-plugins"
mkdir -p "$GAME"

if [[ -f "$GAME/addons/metamod.vdf" && -d "$GAME/addons/counterstrikesharp" ]]; then
  echo "Helios: dodatki są już na dysku"
else
  if [[ ! -f "$PLUGIN_DIR/metamod.tar.gz" || ! -f "$PLUGIN_DIR/counterstrikesharp.zip" ]]; then
    echo "Helios: brak paczek dodatków" >&2
    exit 1
  fi
  echo "Helios: rozpakowywanie Metamod"
  tar -xzf "$PLUGIN_DIR/metamod.tar.gz" -C "$GAME"
  echo "Helios: rozpakowywanie CounterStrikeSharp"
  unzip -o -q "$PLUGIN_DIR/counterstrikesharp.zip" -d "$GAME"
fi

GI="$GAME/gameinfo.gi"
if [[ -f "$GI" ]] && ! grep -q 'csgo/addons/metamod' "$GI"; then
  awk '
    { print }
    /Game_LowViolence[[:space:]]+csgo_lv/ && !done {
      print "\\t\\t\\tGame\\tcsgo/addons/metamod"
      done = 1
    }
  ' "$GI" > "$GI.helios" && mv "$GI.helios" "$GI"
  echo "Helios: dopisano Metamod do gameinfo.gi"
fi
`;

async function downloadTo(url: string, dest: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "helios-panel", Accept: "application/octet-stream" },
    redirect: "follow",
  });
  if (!response.ok) throw new Error("plugins_failed");
  const partial = `${dest}.part`;
  await fs.writeFile(partial, Buffer.from(await response.arrayBuffer()));
  await fs.rename(partial, dest);
}

async function fileExists(file: string) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export async function installCs2Plugins(volumePath: string) {
  const dir = path.join(volumePath, ".helios-plugins");
  await fs.mkdir(dir, { recursive: true });
  const metamod = path.join(dir, "metamod.tar.gz");
  const sharp = path.join(dir, "counterstrikesharp.zip");

  if (!(await fileExists(metamod))) {
    const latest = await fetch("https://mms.alliedmods.net/mmsdrop/2.0/mmsource-latest-linux", {
      headers: { "User-Agent": "helios-panel" },
    });
    if (!latest.ok) throw new Error("plugins_failed");
    const filename = (await latest.text()).trim();
    if (!/^mmsource-[\w.-]+-linux\.tar\.gz$/.test(filename)) throw new Error("plugins_failed");
    await downloadTo(`https://mms.alliedmods.net/mmsdrop/2.0/${filename}`, metamod);
  }

  if (!(await fileExists(sharp))) {
    const release = await fetch("https://api.github.com/repos/roflmuffin/CounterStrikeSharp/releases/latest", {
      headers: {
        "User-Agent": "helios-panel",
        Accept: "application/vnd.github+json",
      },
    });
    if (!release.ok) throw new Error("plugins_failed");
    const body = (await release.json()) as { assets?: { name?: string; browser_download_url?: string }[] };
    const asset = body.assets?.find((item) =>
      /^counterstrikesharp-with-runtime-linux-.*\.zip$/.test(item.name ?? ""),
    );
    if (!asset?.browser_download_url) throw new Error("plugins_failed");
    await downloadTo(asset.browser_download_url, sharp);
  }

  const hook = path.join(volumePath, "pre.sh");
  await fs.writeFile(hook, PRE_SH.replace(/\r\n/g, "\n"), "utf8");
  await fs.chmod(hook, 0o755);
  await unpackIntoGame(volumePath, metamod, sharp);
}

async function unpackIntoGame(volumePath: string, metamod: string, sharp: string) {
  const game = path.join(volumePath, "game", "csgo");
  if (!(await fileExists(game))) return;
  const ready = path.join(game, "addons", "counterstrikesharp");
  if (!(await fileExists(path.join(game, "addons", "metamod.vdf"))) || !(await fileExists(ready))) {
    await exec("tar", ["-xzf", metamod, "-C", game]);
    await exec("tar", ["-xf", sharp, "-C", game]);
  }
  const info = path.join(game, "gameinfo.gi");
  if (!(await fileExists(info))) return;
  const text = await fs.readFile(info, "utf8");
  if (text.includes("csgo/addons/metamod")) return;
  const next = text.replace(/(Game_LowViolence\s+csgo_lv)/, "$1\n\t\t\tGame\tcsgo/addons/metamod");
  if (next !== text) await fs.writeFile(info, next);
}
