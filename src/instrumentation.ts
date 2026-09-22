export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPanelJobs } = await import("./lib/jobs");
  startPanelJobs();
}
