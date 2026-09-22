"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Database,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  Server,
  Settings,
  Shield,
  Globe,
  Bot,
  Users,
  X,
} from "lucide-react";
import type { PublicUser } from "@/lib/types";
import { can } from "@/lib/permissions";
import { api } from "@/lib/client";
import { Logo } from "./logo";
import { LanguageSwitch } from "./ui";
import { useI18n } from "./i18n-provider";

const links = [
  { href: "/", key: "overview", icon: LayoutDashboard, show: () => true },
  { href: "/servers", key: "servers", icon: Server, show: (user: PublicUser) => can(user, "servers.view") },
  { href: "/servers/new", key: "create", icon: Plus, show: (user: PublicUser) => can(user, "servers.create") },
  { href: "/metrics", key: "metrics", icon: Activity, show: (user: PublicUser) => can(user, "metrics.view") },
  { href: "/databases", key: "databases", icon: Database, show: (user: PublicUser) => can(user, "databases.view") },
  { href: "/mail", key: "mail", icon: Mail, show: (user: PublicUser) => can(user, "mail.view") },
  { href: "/sites", key: "sites", icon: Globe, show: (user: PublicUser) => can(user, "sites.view") },
  { href: "/bots", key: "bots", icon: Bot, show: (user: PublicUser) => can(user, "bots.view") },
  { href: "/firewall", key: "firewall", icon: Shield, show: (user: PublicUser) => can(user, "firewall.view") },
  { href: "/users", key: "users", icon: Users, show: (user: PublicUser) => can(user, "users.view") },
  { href: "/settings", key: "settings", icon: Settings, show: () => true },
] as const;

function active(href: string, pathname: string) {
  if (href === "/") return pathname === "/";
  if (href === "/servers") {
    return pathname === "/servers" || (pathname.startsWith("/servers/") && !pathname.startsWith("/servers/new"));
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Shell({ user, children }: { user: PublicUser; children: React.ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [docker, setDocker] = useState<boolean | null>(null);

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const data = await api<{ ok: boolean }>("/api/docker");
        if (!stop) setDocker(data.ok);
      } catch {
        if (!stop) setDocker(false);
      }
    }
    void tick();
    const timer = window.setInterval(() => void tick(), 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  async function logout() {
    await api("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-2">
        <Logo />
        <button className="btn btn-quiet lg:hidden" type="button" onClick={() => setOpen(false)} aria-label={t.close}>
          <X size={18} />
        </button>
      </div>
      <div className="mt-4 px-2">
        <span className={`chip ${docker ? "text-mint" : "text-coral"}`}>
          <span className={docker ? "pulse" : "h-2 w-2 rounded-full bg-current"} />
          {docker === null ? t.loading : docker ? t.docker.online : t.docker.offline}
        </span>
      </div>
      <nav className="mt-6 flex flex-1 flex-col gap-1">
        {links
          .filter((item) => item.show(user))
          .map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-active={active(item.href, pathname)}
                className="nav-link"
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {t.nav[item.key]}
              </Link>
            );
          })}
      </nav>
      <div className="mt-4 space-y-3 border-t border-white/10 px-2 pt-4">
        <LanguageSwitch />
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-medium">{user.username}</p>
            <p className="text-xs text-fog">{user.isOwner ? t.owner : user.role}</p>
          </div>
          <button className="btn btn-quiet" type="button" onClick={() => void logout()}>
            <LogOut size={16} />
            <span className="sr-only">{t.logout}</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen border-r border-white/8 bg-ink/40 px-4 py-5 backdrop-blur lg:block">
        {nav}
      </aside>
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button className="absolute inset-0 bg-black/70" aria-label={t.close} onClick={() => setOpen(false)} />
          <aside className="relative h-full w-[min(100%,320px)] border-r border-white/10 bg-ink px-4 py-5">
            {nav}
          </aside>
        </div>
      ) : null}
      <div className="min-w-0">
        <header className="flex items-center justify-between px-4 py-3 lg:hidden">
          <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)} aria-label="menu">
            <Menu size={18} />
          </button>
          <Logo compact />
          <span className="w-10" />
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
