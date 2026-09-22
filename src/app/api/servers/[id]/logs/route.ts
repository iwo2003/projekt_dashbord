import { apiError, guard } from "@/lib/api";
import { getServer } from "@/lib/db";
import { decodeDockerChunk, followLogs, readLogs } from "@/lib/docker";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await guard("servers.console");
  if (auth.error) return auth.error;
  const { id } = await ctx.params;
  const server = getServer(id);
  if (!server?.containerId) return apiError("not_found", 404);

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };
  const encoder = new TextEncoder();
  const follow = server.status === "running";

  try {
    const logs = follow ? await followLogs(server.containerId) : await readLogs(server.containerId);
    const stream = new ReadableStream({
      start(controller) {
        const send = (line: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ line })}\n\n`));
        };
        if (Buffer.isBuffer(logs)) {
          send(decodeDockerChunk(logs));
          controller.close();
          return;
        }
        const source = logs;
        const onData = (chunk: Buffer | string) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          send(decodeDockerChunk(buffer));
        };
        const beat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": ping\n\n"));
          } catch {
            clearInterval(beat);
          }
        }, 15000);
        const close = () => {
          clearInterval(beat);
          source.off("data", onData);
          const closable = source as NodeJS.ReadableStream & { destroy?: () => void };
          closable.destroy?.();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };
        source.on("data", onData);
        source.on("end", close);
        source.on("error", close);
        request.signal.addEventListener("abort", close);
      },
    });
    return new Response(stream, { headers });
  } catch (error) {
    console.error(error);
    return apiError("request_failed", 500);
  }
}
