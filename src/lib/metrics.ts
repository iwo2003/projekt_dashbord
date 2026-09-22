import os from "os";
import si from "systeminformation";
import type { Metrics } from "./types";

let cache: { at: number; data: Metrics } | null = null;

export function hostAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}

export async function getMetrics(): Promise<Metrics> {
  if (cache && Date.now() - cache.at < 1500) return cache.data;
  const [load, mem, disks, info, cpu, time, network] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.osInfo(),
    si.cpu(),
    si.time(),
    si.networkStats(),
  ]);
  const used = mem.active || mem.used;
  const data: Metrics = {
    cpu: {
      usage: Math.round(load.currentLoad * 10) / 10,
      cores: cpu.cores,
      brand: cpu.brand,
    },
    memory: {
      total: mem.total,
      used,
      percent: mem.total ? Math.round((used / mem.total) * 1000) / 10 : 0,
    },
    disks: disks
      .filter((disk) => disk.size > 0)
      .slice(0, 6)
      .map((disk) => ({
        fs: disk.fs,
        mount: disk.mount,
        size: disk.size,
        used: disk.used,
        percent: disk.use,
      })),
    os: {
      platform: info.platform,
      distro: info.distro,
      release: info.release,
      arch: info.arch,
      hostname: info.hostname,
    },
    uptime: time.uptime,
    network: network
      .filter((item) => item.iface && !item.iface.toLowerCase().includes("loopback"))
      .slice(0, 4)
      .map((item) => ({
        iface: item.iface,
        rx: item.rx_bytes,
        tx: item.tx_bytes,
        rxSec: item.rx_sec ?? 0,
        txSec: item.tx_sec ?? 0,
      })),
  };
  cache = { at: Date.now(), data };
  return data;
}
