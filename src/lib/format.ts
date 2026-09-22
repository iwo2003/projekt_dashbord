export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const amount = value / 1024 ** index;
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatWhen(timestamp: number | null, lang: "pl" | "en") {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(lang === "pl" ? "pl-PL" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}
