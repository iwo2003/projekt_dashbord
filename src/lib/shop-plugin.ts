import { createHash } from "crypto";
import type { Game } from "./types";

export type PluginFile = { path: string; body: string };

function cfg(url: string, token: string) {
  return `url=${url}\ntoken=${token}\n`;
}

function readme(game: string) {
  return [
    `Helios Shop — ${game}`,
    "",
    "Łącznik pyta panel o opłacone zamówienia i wykonuje komendy, gdy gracz jest online.",
    "Plik z adresem i tokenem leży obok tej wtyczki. Nie udostępniaj go.",
    "",
    "The connector asks the panel for paid orders and runs the commands when the player is online.",
    "The address and token sit next to this plugin. Do not share that file.",
    "",
  ].join("\n");
}

export function pluginFiles(game: Game, url: string, token: string): PluginFile[] {
  const config = cfg(url, token);
  if (game === "gta") {
    return [
      { path: "resources/helios-shop/fxmanifest.lua", body: "fx_version 'cerulean'\ngame 'gta5'\nserver_script 'server.lua'\n" },
      { path: "resources/helios-shop/helios.cfg", body: config },
      { path: "resources/helios-shop/CZYTAJ.txt", body: readme("FiveM") },
      {
        path: "resources/helios-shop/server.lua",
        body: `local raw = LoadResourceFile(GetCurrentResourceName(), "helios.cfg") or ""
local url, token = "", ""
for line in string.gmatch(raw, "[^\\r\\n]+") do
  local key, value = line:match("^(%w+)%s*=%s*(.+)$")
  if key == "url" then url = value end
  if key == "token" then token = value end
end

local function online(nick, fivem)
  for _, id in ipairs(GetPlayers()) do
    local name = GetPlayerName(id) or ""
    if name:lower() == (nick or ""):lower() then return true end
    if fivem and fivem ~= "" then
      for _, ident in ipairs(GetPlayerIdentifiers(id)) do
        if ident:lower():find((fivem):lower(), 1, true) then return true end
      end
    end
  end
  return false
end

CreateThread(function()
  while true do
    Wait(15000)
    if url ~= "" and token ~= "" then
      PerformHttpRequest(url .. "/api/shop/agent?token=" .. token, function(code, body)
        if code ~= 200 or not body or body == "" then return end
        local data = json.decode(body)
        if type(data) ~= "table" or type(data.jobs) ~= "table" then return end
        for _, job in ipairs(data.jobs) do
          if job.waitOnline and not online(job.nick or "", job.fivem or "") then
          else
            for _, command in ipairs(job.commands or {}) do
              ExecuteCommand(command)
            end
            PerformHttpRequest(url .. "/api/shop/agent", function() end, "POST", json.encode({ token = token, id = job.id }), { ["Content-Type"] = "application/json" })
          end
        end
      end, "GET")
    end
  end
end)
`,
      },
    ];
  }
  if (game === "gmod") {
    return [
      { path: "addons/helios_shop/helios.cfg", body: config },
      { path: "addons/helios_shop/CZYTAJ.txt", body: readme("Garry's Mod") },
      {
        path: "addons/helios_shop/lua/autorun/server/helios_shop.lua",
        body: `local raw = file.Read("addons/helios_shop/helios.cfg", "GAME") or ""
local url, token = "", ""
for line in string.gmatch(raw, "[^\\r\\n]+") do
  local key, value = line:match("^(%w+)%s*=%s*(.+)$")
  if key == "url" then url = value end
  if key == "token" then token = value end
end

local function online(nick, steam)
  for _, ply in ipairs(player.GetAll()) do
    if string.lower(ply:Nick()) == string.lower(nick or "") then return true end
    if steam and steam ~= "" and string.lower(ply:SteamID()) == string.lower(steam) then return true end
  end
  return false
end

timer.Create("helios_shop", 15, 0, function()
  if url == "" or token == "" then return end
  http.Fetch(url .. "/api/shop/agent?token=" .. token, function(body)
    local data = util.JSONToTable(body or "")
    if not data or not data.jobs then return end
    for _, job in ipairs(data.jobs) do
      if job.waitOnline and not online(job.nick or "", job.steam or "") then
      else
        for _, command in ipairs(job.commands or {}) do
          game.ConsoleCommand(command .. "\\n")
        end
        HTTP({
          url = url .. "/api/shop/agent",
          method = "post",
          type = "application/json",
          body = util.TableToJSON({ token = token, id = job.id }),
        })
      end
    end
  end)
end)
`,
      },
    ];
  }
  if (game === "minecraft") {
    return [
      { path: "plugins/HeliosShop/config.yml", body: `url: "${url}"\ntoken: "${token}"\n` },
      { path: "plugins/HeliosShop/CZYTAJ.txt", body: readme("Minecraft") },
      {
        path: "plugins/HeliosShop/HeliosShop.java",
        body: `// Paper plugin. Compile against paper-api, put the jar in plugins/, and keep config.yml.
// The panel can also deliver the same commands over RCON when the product uses console delivery.
`,
      },
    ];
  }
  if (game === "cs2") {
    return [
      { path: "game/csgo/addons/counterstrikesharp/plugins/HeliosShop/helios.cfg", body: config },
      { path: "game/csgo/addons/counterstrikesharp/plugins/HeliosShop/CZYTAJ.txt", body: readme("Counter-Strike 2") },
    ];
  }
  if (game === "tf2") {
    return [
      { path: "tf/addons/sourcemod/data/helios_shop.cfg", body: config },
      { path: "tf/addons/sourcemod/data/helios_shop_CZYTAJ.txt", body: readme("Team Fortress 2") },
    ];
  }
  return [
    { path: "helios-shop/helios.cfg", body: config },
    {
      path: "helios-shop/CZYTAJ.txt",
      body: `${readme("Farming Simulator 25")}Na tym serwerze nagrody wysyła panel komendami. Wtyczka trzyma token, gdy pojawi się łącznik.\n\nOn this server the panel sends rewards as commands. The plugin folder keeps the token for a connector.\n`,
    },
  ];
}

function crc32(buffer: Buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

export function zipStore(files: PluginFile[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path.replace(/\\/g, "/"));
    const data = Buffer.from(file.body);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

export function pluginZipName(game: Game) {
  return `helios-shop-${game}.zip`;
}

export function sha384(value: string) {
  return createHash("sha384").update(value).digest("hex");
}
