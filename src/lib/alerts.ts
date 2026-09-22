import { alertSentAt, getSetting, listServers, markAlertSent, setSetting } from "./db";
import { inspectState } from "./docker";

const COOLDOWN_MS = 30 * 60 * 1000;
const seenRestarts = new Map<string, number>();

function clip(value: string, max: number) {
  return value.trim().slice(0, max);
}

export function alertSettings() {
  return {
    discordSet: Boolean(getSetting("discord_webhook")),
    telegramSet: Boolean(getSetting("telegram_token")),
    telegramChat: getSetting("telegram_chat"),
  };
}

export function saveAlertSettings(input: {
  discordWebhook?: string;
  telegramToken?: string;
  telegramChat?: string;
  clearDiscord?: boolean;
  clearTelegram?: boolean;
}) {
  if (input.clearDiscord) setSetting("discord_webhook", "");
  if (input.discordWebhook) {
    const url = input.discordWebhook.trim();
    if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/.test(url)) {
      return { ok: false as const, error: "validation" as const };
    }
    setSetting("discord_webhook", url);
  }
  if (input.clearTelegram) {
    setSetting("telegram_token", "");
    setSetting("telegram_chat", "");
  } else if (input.telegramToken || input.telegramChat != null) {
    const token = input.telegramToken?.trim() || getSetting("telegram_token");
    const chat = (input.telegramChat ?? getSetting("telegram_chat")).trim();
    if (input.telegramToken && !/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
      return { ok: false as const, error: "validation" as const };
    }
    if (chat && !/^-?\d{1,20}$/.test(chat)) return { ok: false as const, error: "validation" as const };
    if (input.telegramToken && token) setSetting("telegram_token", token);
    if (input.telegramChat != null) setSetting("telegram_chat", chat);
  }
  return { ok: true as const };
}

async function postDiscord(url: string, text: string) {
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: clip(text, 1800) }),
  });
}

async function postTelegram(token: string, chat: string, text: string) {
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: clip(text, 3500) }),
  });
}

export async function notifyDown(name: string, game: string, detail: string) {
  const text = `Helios: serwer ${name} (${game}) padł. ${detail}`.trim();
  const discord = getSetting("discord_webhook");
  const token = getSetting("telegram_token");
  const chat = getSetting("telegram_chat");
  if (discord) await postDiscord(discord, text).catch(() => undefined);
  if (token && chat) await postTelegram(token, chat, text).catch(() => undefined);
}

export async function watchCrashes() {
  if (!getSetting("discord_webhook") && !getSetting("telegram_token")) return;
  for (const server of listServers()) {
    if (!server.containerId || server.status === "stopped") continue;
    const state = await inspectState(server.containerId);
    if (!state) continue;
    const previous = seenRestarts.get(server.id);
    seenRestarts.set(server.id, state.restartCount);
    const loop = previous != null && state.restartCount >= previous + 2;
    const failed = server.status === "error" || state.restarting || loop;
    if (!failed) continue;
    const sent = alertSentAt(server.id);
    if (Date.now() - sent < COOLDOWN_MS) continue;
    await notifyDown(server.name, server.game, state.error || server.error || "Kontener wstaje od nowa.");
    markAlertSent(server.id, Date.now());
  }
}
