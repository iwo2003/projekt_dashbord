"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/client";
import { can } from "@/lib/permissions";
import type { PublicServer, PublicUser } from "@/lib/types";
import { ServerCard } from "./server-card";
import { ErrorNote } from "./ui";
import { useI18n } from "./i18n-provider";

export function ServerList({ user }: { user: PublicUser }) {
  const { t } = useI18n();
  const [servers, setServers] = useState<PublicServer[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const data = await api<{ servers: PublicServer[] }>("/api/servers");
        if (!stop) setServers(data.servers);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  const visible = servers.filter((server) => server.name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.servers.title}</h1>
          <p className="mt-2 text-fog">{t.servers.lead}</p>
        </div>
        {can(user, "servers.create") ? (
          <Link className="btn btn-primary" href="/servers/new">
            {t.dash.newServer}
          </Link>
        ) : null}
      </div>
      <ErrorNote code={error} />
      <input
        className="field max-w-sm"
        placeholder={t.servers.search}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {visible.length === 0 ? (
        <div className="card px-5 py-12 text-center text-fog">{t.servers.empty}</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((server) => (
            <ServerCard key={server.id} server={server} user={user} />
          ))}
        </div>
      )}
    </div>
  );
}
