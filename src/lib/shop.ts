import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { randomSecret } from "./crypto";
import {
  claimShopOrder,
  claimShopCode,
  deleteShopCode,
  deleteShopProduct,
  getServer,
  getSetting,
  getShopCode,
  getShopOrder,
  getShopProduct,
  insertShopOrder,
  insertShopProduct,
  insertShopCode,
  listPluginShopOrders,
  listQueuedShopOrders,
  listServers,
  listShopCodes,
  listShopOrders,
  listShopProducts,
  releaseShopSending,
  releaseShopCode,
  saveShopAgent,
  setSetting,
  setShopOrder,
  shopAgentServer,
  shopAgentToken,
  updateShopProduct,
  type ShopOrderRow,
  type ShopCodeRow,
  type ShopProductRow,
} from "./db";
import { playerSnapshot } from "./players";
import { sendCommand } from "./servers";
import { SHOP_GAMES } from "./constants";
import { pluginFiles, type PluginFile } from "./shop-plugin";
import { enabledProviders, readStripeSecret, type ShopProvider } from "./shop-pay";
import type { Game, ServerRecord } from "./types";

const HOST = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function shopPanelUrl() {
  const shop = getSetting("shop_host");
  const panel = getSetting("panel_host") || getSetting("https_domain");
  if (shop) return `https://${shop}`;
  if (panel) return `https://${panel}`;
  return "";
}

function cleanHost(value: string) {
  return value.trim().toLowerCase().replace(/:\d+$/, "");
}

function validHost(host: string) {
  return host.length <= 253 && HOST.test(host);
}

export function shopGameHosts() {
  return Object.fromEntries(SHOP_GAMES.map((game) => [game, getSetting(`shop_host_${game}`)])) as Record<(typeof SHOP_GAMES)[number], string>;
}

export function shopGameForHost(host: string) {
  const normalized = cleanHost(host);
  for (const game of SHOP_GAMES) {
    if (getSetting(`shop_host_${game}`) === normalized && normalized) return game;
  }
  return "" as const;
}

export function allShopHosts() {
  return [getSetting("shop_host"), ...SHOP_GAMES.map((game) => getSetting(`shop_host_${game}`))].map((host) => cleanHost(host)).filter(Boolean);
}

function keepSecret(next: string | undefined, key: string) {
  const value = next?.trim() ?? "";
  if (value) setSetting(key, value);
}

export function saveShopSettings(input: {
  host: string;
  stripe: boolean;
  paypal: boolean;
  p24: boolean;
  enabled?: boolean;
  stripeSecret?: string;
  paypalClient?: string;
  paypalSecret?: string;
  paypalSandbox?: boolean;
  p24Merchant?: string;
  p24Crc?: string;
  p24Api?: string;
  p24Sandbox?: boolean;
  sellerName?: string;
  sellerAddress?: string;
  sellerEmail?: string;
  sellerNip?: string;
  gameHosts?: Partial<Record<(typeof SHOP_GAMES)[number], string>>;
}) {
  const previousHost = getSetting("shop_host");
  const host = cleanHost(input.host);
  if (host && !validHost(host)) return { ok: false as const, error: "validation" as const };
  const gameHosts = input.gameHosts;
  const seen = new Set<string>();
  if (host) seen.add(host);
  let hostChanged = host !== previousHost;
  if (gameHosts) {
    for (const game of SHOP_GAMES) {
      const next = cleanHost(gameHosts[game] ?? "");
      if (next && (!validHost(next) || seen.has(next))) return { ok: false as const, error: "validation" as const };
      if (next) seen.add(next);
      if (next !== getSetting(`shop_host_${game}`)) hostChanged = true;
    }
  }
  const stripeKey = input.stripeSecret?.trim() ? readStripeSecret(input.stripeSecret) : null;
  if (stripeKey && !stripeKey.ok) return { ok: false as const, error: stripeKey.error };
  setSetting("shop_host", host);
  setSetting("shop_stripe", input.stripe ? "1" : "");
  setSetting("shop_paypal", input.paypal ? "1" : "");
  setSetting("shop_p24", input.p24 ? "1" : "");
  setSetting("shop_paypal_sandbox", input.paypalSandbox ? "1" : "");
  setSetting("shop_p24_sandbox", input.p24Sandbox ? "1" : "");
  if (input.enabled !== undefined) setSetting("shop_enabled", input.enabled ? "1" : "0");
  keepSecret(input.paypalClient, "shop_paypal_client");
  keepSecret(input.paypalSecret, "shop_paypal_secret");
  if (stripeKey?.ok) setSetting("shop_stripe_secret", stripeKey.secret);
  keepSecret(input.p24Merchant, "shop_p24_merchant");
  keepSecret(input.p24Crc, "shop_p24_crc");
  keepSecret(input.p24Api, "shop_p24_api");
  if (input.sellerName !== undefined) setSetting("shop_seller_name", input.sellerName.trim());
  if (input.sellerAddress !== undefined) setSetting("shop_seller_address", input.sellerAddress.trim());
  if (input.sellerEmail !== undefined) setSetting("shop_seller_email", input.sellerEmail.trim());
  if (input.sellerNip !== undefined) setSetting("shop_seller_nip", input.sellerNip.trim());
  if (gameHosts) {
    for (const game of SHOP_GAMES) setSetting(`shop_host_${game}`, cleanHost(gameHosts[game] ?? ""));
  }
  return { ok: true as const, hostChanged };
}

export function shopAdminState() {
  const servers = listServers().map((server) => ({
    id: server.id,
    name: server.name,
    game: server.game,
    token: shopAgentToken(server.id),
  }));
  return {
    host: getSetting("shop_host"),
    enabled: getSetting("shop_enabled") !== "0",
    panelUrl: shopPanelUrl(),
    stripe: getSetting("shop_stripe") === "1",
    paypal: getSetting("shop_paypal") === "1",
    p24: getSetting("shop_p24") === "1",
    paypalSandbox: getSetting("shop_paypal_sandbox") === "1",
    p24Sandbox: getSetting("shop_p24_sandbox") === "1",
    stripeSecretSet: Boolean(getSetting("shop_stripe_secret")),
    paypalClientSet: Boolean(getSetting("shop_paypal_client")),
    paypalSecretSet: Boolean(getSetting("shop_paypal_secret")),
    p24Merchant: getSetting("shop_p24_merchant"),
    p24CrcSet: Boolean(getSetting("shop_p24_crc")),
    p24ApiSet: Boolean(getSetting("shop_p24_api")),
    sellerName: getSetting("shop_seller_name"),
    sellerAddress: getSetting("shop_seller_address"),
    sellerEmail: getSetting("shop_seller_email"),
    sellerNip: getSetting("shop_seller_nip"),
    gameHosts: shopGameHosts(),
    providers: enabledProviders(),
    servers,
    products: listShopProducts(),
    orders: listShopOrders(),
    codes: listShopCodes(),
  };
}

export function shopSeller() {
  return {
    name: getSetting("shop_seller_name"),
    address: getSetting("shop_seller_address"),
    email: getSetting("shop_seller_email"),
    nip: getSetting("shop_seller_nip"),
  };
}

export function shopCatalog(requestHost = "") {
  const open = getSetting("shop_enabled") !== "0";
  const servers = new Map(listServers().map((server) => [server.id, server]));
  const lockedGame = shopGameForHost(requestHost);
  if (!open) return { host: getSetting("shop_host"), open: false, providers: [], products: [], seller: shopSeller(), lockedGame };
  return {
    host: getSetting("shop_host"),
    open: true,
    lockedGame,
    providers: enabledProviders(),
    products: listShopProducts().map((product) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        priceCents: product.price_cents,
        serverName: servers.get(product.server_id)?.name ?? "",
        game: servers.get(product.server_id)?.game ?? "",
      })),
    seller: shopSeller(),
  };
}

function commandLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function saveShopProduct(input: {
  id?: string;
  serverId: string;
  name: string;
  description?: string;
  priceCents: number;
  delivery: "off" | "console" | "plugin";
  waitOnline?: boolean;
  commands?: string;
}) {
  if (!getServer(input.serverId)) return { ok: false as const, error: "not_found" as const };
  const commands = commandLines(input.commands ?? "").join("\n");
  if (input.delivery !== "off" && !commands) return { ok: false as const, error: "shop_commands" as const };
  const row: ShopProductRow = {
    id: input.id || randomUUID(),
    server_id: input.serverId,
    name: input.name.trim(),
    description: (input.description ?? "").trim(),
    price_cents: input.priceCents,
    delivery: input.delivery,
    wait_online: input.waitOnline === false ? 0 : 1,
    commands,
    created_at: Date.now(),
  };
  if (input.id) {
    const previous = getShopProduct(input.id);
    if (!previous) return { ok: false as const, error: "not_found" as const };
    row.created_at = previous.created_at;
    updateShopProduct(row);
  } else {
    insertShopProduct(row);
  }
  return { ok: true as const, product: row };
}

export function removeShopCode(id: string) {
  deleteShopCode(id);
  return { ok: true as const };
}

export function saveShopCode(input: { kind: "discount" | "voucher"; code: string; mode?: "percent" | "amount"; percent?: number; amountCents?: number; uses?: number }) {
  const code = input.code.trim().toUpperCase();
  if (getShopCode(code)) return { ok: false as const, error: "code_taken" as const };
  const percent = input.kind === "discount" && input.mode !== "amount" ? Math.round(input.percent ?? 0) : 0;
  const amount = input.kind === "voucher" || input.mode === "amount" ? input.amountCents ?? 0 : 0;
  if (percent < 1 && amount < 100) return { ok: false as const, error: "validation" as const };
  if (percent > 100) return { ok: false as const, error: "validation" as const };
  const row: ShopCodeRow = {
    id: randomUUID(),
    kind: input.kind,
    code,
    percent,
    amount_cents: amount,
    uses_max: input.kind === "voucher" ? Math.max(1, input.uses ?? 1) : input.uses ?? 0,
    uses_count: 0,
    created_at: Date.now(),
  };
  insertShopCode(row);
  return { ok: true as const, code: row };
}

function priced(cents: number, promo: ShopCodeRow) {
  if (promo.percent > 0) return Math.max(0, Math.round((cents * (100 - promo.percent)) / 100));
  return Math.max(0, cents - promo.amount_cents);
}

export function removeShopProduct(id: string) {
  if (!getShopProduct(id)) return { ok: false as const, error: "not_found" as const };
  deleteShopProduct(id);
  return { ok: true as const };
}

export function fillCommand(command: string, order: Pick<ShopOrderRow, "nick" | "steam" | "fivem">) {
  return command
    .replaceAll("{nick}", order.nick)
    .replaceAll("{steam}", order.steam)
    .replaceAll("{fivem}", order.fivem);
}

function playerMatches(order: ShopOrderRow, name: string, steam: string) {
  if (name.toLowerCase() === order.nick.toLowerCase()) return true;
  if (order.steam && steam.toLowerCase() === order.steam.toLowerCase()) return true;
  return false;
}

async function isOnline(server: ServerRecord, order: ShopOrderRow) {
  try {
    const snap = await playerSnapshot(server);
    if (!snap.ok) return false;
    return snap.online.some((row) => playerMatches(order, row.name, row.steam));
  } catch {
    return false;
  }
}

async function runCommands(server: ServerRecord, order: ShopOrderRow) {
  const lines = commandLines(order.commands).map((line) => fillCommand(line, order));
  if (!lines.length) return "shop_commands";
  for (const command of lines) {
    try {
      const result = await sendCommand(server, command);
      if (!result.ok) return result.error;
    } catch (error) {
      const message = error instanceof Error ? error.message : "request_failed";
      if (message === "server_offline" || message === "rcon_timeout" || message === "rcon_auth") return message;
      return "request_failed";
    }
  }
  return "";
}

export async function deliverOrder(id: string, force = false) {
  const order = getShopOrder(id);
  if (!order) return;
  if (order.status !== "queued" && order.status !== "sending" && !(force && order.status === "failed")) return;
  if (order.delivery === "plugin" && !force) return;
  if (order.status === "queued" && !claimShopOrder(id)) return;
  if (force && order.status === "failed") setShopOrder(id, { status: "sending", error: "" });
  const server = getServer(order.server_id);
  if (!server) {
    setShopOrder(id, { status: "failed", error: "not_found" });
    return;
  }
  if (!force && order.wait_online && !(await isOnline(server, order))) {
    setShopOrder(id, { status: "queued", error: "" });
    return;
  }
  const error = await runCommands(server, order);
  if (!error) {
    setShopOrder(id, { status: "delivered", error: "" });
    return;
  }
  if (error === "server_offline" || error === "rcon_timeout") {
    setShopOrder(id, { status: "queued", error: "" });
    return;
  }
  setShopOrder(id, { status: "failed", error });
}

export async function markShopPaid(orderId: string, providerRef = "") {
  const order = getShopOrder(orderId);
  if (!order || order.status !== "pending") return false;
  setShopOrder(orderId, { status: "queued", providerRef: providerRef || order.provider_ref, paidAt: Date.now(), error: "" });
  if (order.delivery === "console") await deliverOrder(orderId);
  return true;
}

export async function deliverShopQueue() {
  releaseShopSending();
  for (const order of listQueuedShopOrders()) {
    if (order.delivery !== "console") continue;
    await deliverOrder(order.id);
  }
}

export function createShopOrder(input: {
  productId: string;
  nick: string;
  email: string;
  steam?: string;
  fivem?: string;
  provider: ShopProvider;
  code?: string;
}) {
  const product = getShopProduct(input.productId);
  if (getSetting("shop_enabled") === "0") return { ok: false as const, error: "shop_closed" as const };
  const seller = shopSeller();
  if (!seller.name || !seller.address || !seller.email) return { ok: false as const, error: "seller_missing" as const };
  if (!product) return { ok: false as const, error: "not_found" as const };
  let price = product.price_cents;
  let codeId = "";
  const rawCode = (input.code ?? "").trim();
  if (rawCode) {
    const promo = getShopCode(rawCode);
    if (!promo) return { ok: false as const, error: "code_bad" as const };
    if (promo.uses_max > 0 && promo.uses_count >= promo.uses_max) return { ok: false as const, error: "code_used" as const };
    price = priced(product.price_cents, promo);
    if (price > 0 && price < 200) return { ok: false as const, error: "code_small" as const };
    if (price > 0 && !enabledProviders().includes(input.provider)) return { ok: false as const, error: "payment_off" as const };
    if (!claimShopCode(promo.id)) return { ok: false as const, error: "code_used" as const };
    codeId = promo.id;
  }
  if (price > 0 && !enabledProviders().includes(input.provider)) return { ok: false as const, error: "payment_off" as const };
  const now = Date.now();
  const order: ShopOrderRow = {
    id: randomUUID(),
    product_id: product.id,
    server_id: product.server_id,
    name: product.name,
    nick: input.nick.trim(),
    email: input.email.trim(),
    steam: (input.steam ?? "").trim(),
    fivem: (input.fivem ?? "").trim(),
    price_cents: price,
    delivery: product.delivery,
    wait_online: product.wait_online,
    commands: product.commands,
    provider: input.provider,
    provider_ref: "",
    status: "pending",
    error: "",
    created_at: now,
    paid_at: null,
    consent: 1,
    code_id: codeId,
  };
  try {
    insertShopOrder(order);
  } catch (error) {
    if (codeId) releaseShopCode(codeId);
    throw error;
  }
  return { ok: true as const, order };
}

export function releaseOrderCode(orderId: string) {
  const order = getShopOrder(orderId);
  if (order?.code_id) releaseShopCode(order.code_id);
}

export function publicOrder(id: string) {
  const order = getShopOrder(id);
  if (!order) return null;
  return { id: order.id, name: order.name, status: order.status, provider: order.provider };
}

export function agentJobs(token: string) {
  const serverId = shopAgentServer(token);
  if (!serverId) return null;
  const jobs = listPluginShopOrders(serverId).map((order) => ({
      id: order.id,
      nick: order.nick,
      steam: order.steam,
      fivem: order.fivem,
      waitOnline: order.wait_online === 1,
      commands: commandLines(order.commands).map((line) => fillCommand(line, order)),
    }));
  return { jobs };
}

export function ackAgentJob(token: string, id: string) {
  const serverId = shopAgentServer(token);
  const order = getShopOrder(id);
  if (!serverId || !order || order.server_id !== serverId || order.delivery !== "plugin") return false;
  if (order.status !== "queued" && order.status !== "sending") return false;
  setShopOrder(id, { status: "delivered", error: "" });
  return true;
}

export async function installShopPlugin(serverId: string) {
  const server = getServer(serverId);
  const url = shopPanelUrl();
  if (!server) return { ok: false as const, error: "not_found" as const };
  if (!url) return { ok: false as const, error: "shop_host" as const };
  const token = shopAgentToken(server.id) || randomSecret(24);
  saveShopAgent(server.id, token);
  await writePluginFiles(server.volumePath, server.game, pluginFiles(server.game, url, token));
  if (server.game === "gta") await ensureFiveM(server.volumePath);
  return { ok: true as const, token };
}

export function downloadShopPlugin(serverId: string) {
  const server = getServer(serverId);
  const url = shopPanelUrl() || "https://panel.example.com";
  if (!server) return null;
  const token = shopAgentToken(server.id) || "TOKEN";
  return { game: server.game as Game, files: pluginFiles(server.game, url, token) };
}

async function writePluginFiles(root: string, _game: Game, files: PluginFile[]) {
  for (const file of files) {
    const target = path.join(root, file.path);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, file.body);
  }
}

async function ensureFiveM(root: string) {
  const cfgPath = path.join(root, "server.cfg");
  const current = await fs.readFile(cfgPath, "utf8").catch(() => "");
  if (/^ensure\s+helios-shop\s*$/m.test(current)) return;
  await fs.writeFile(cfgPath, `${current.trimEnd()}\nensure helios-shop\n`);
}
