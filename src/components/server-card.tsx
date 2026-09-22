"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, copyText } from "@/lib/client";
import { can } from "@/lib/permissions";
import type { PublicServer, PublicUser } from "@/lib/types";
import { useI18n } from "./i18n-provider";
import { statusTone } from "./ui";

export function statusText(
  t: ReturnType<typeof useI18n>["t"],
  server: Pick<PublicServer, "status" | "statusDetail">,
) {
  if (server.status === "provisioning" && server.statusDetail) {
    const detail = t.servers[server.statusDetail as keyof typeof t.servers];
    if (typeof detail === "string") return detail;
  }
  return t.servers[server.status];
}

export function ServerCard({ server, user }: { server: PublicServer; user: PublicUser }) {
  const { t } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function power(action: "start" | "stop" | "restart") {
    setBusy(true);
    try {
      await api(`/api/servers/${server.id}/power`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="card flex flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-fog">
            {server.game === "minecraft" ? t.servers.minecraft : t.servers.cs2}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">{server.name}</h3>
        </div>
        <span className={`chip ${statusTone(server.status)}`}>
          {server.status === "running" || server.status === "provisioning" ? <span className="pulse" /> : null}
          {statusText(t, server)}
        </span>
      </div>
      <button
        type="button"
        className="w-fit font-mono text-sm text-amber"
        onClick={() => {
          void copyText(server.connect).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          });
        }}
      >
        {copied ? t.copied : server.connect}
      </button>
      <div className="mt-auto flex flex-wrap gap-2">
        <Link className="btn btn-ghost" href={`/servers/${server.id}`}>
          {t.servers.open}
        </Link>
        {can(user, "servers.power") ? (
          server.status === "running" ? (
            <>
              <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => void power("restart")}>
                {t.servers.restart}
              </button>
              <button className="btn btn-quiet" type="button" disabled={busy} onClick={() => void power("stop")}>
                {t.servers.stop}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" type="button" disabled={busy || server.status === "provisioning"} onClick={() => void power("start")}>
              {t.servers.start}
            </button>
          )
        ) : null}
      </div>
    </article>
  );
}
