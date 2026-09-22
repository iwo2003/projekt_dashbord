import { watchCrashes } from "./alerts";
import { runSchedules } from "./schedules";

const globalForJobs = globalThis as { heliosJobs?: boolean };
let busy = false;

async function tick() {
  if (busy) return;
  busy = true;
  try {
    await watchCrashes();
    await runSchedules();
  } finally {
    busy = false;
  }
}

export function startPanelJobs() {
  if (globalForJobs.heliosJobs) return;
  globalForJobs.heliosJobs = true;
  const timer = setInterval(() => {
    void tick();
  }, 30_000);
  timer.unref?.();
  void tick();
}
