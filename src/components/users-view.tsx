"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { PERMISSION_GROUPS } from "@/lib/constants";
import { formatWhen } from "@/lib/format";
import { can, PERMISSIONS, ROLE_PRESETS, roleForPermissions, type Permission } from "@/lib/permissions";
import type { PublicUser } from "@/lib/types";
import { ErrorNote, Field, Modal } from "./ui";
import { useI18n } from "./i18n-provider";

type Role = "admin" | "moderator" | "operator" | "custom";

export function UsersView({ actor }: { actor: PublicUser }) {
  const { t, lang } = useI18n();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PublicUser | null>(null);

  async function load() {
    const data = await api<{ users: PublicUser[] }>("/api/users");
    setUsers(data.users);
  }

  useEffect(() => {
    let stop = false;
    async function run() {
      try {
        const data = await api<{ users: PublicUser[] }>("/api/users");
        if (!stop) setUsers(data.users);
      } catch (caught) {
        if (!stop) setError(caught instanceof Error ? caught.message : "request_failed");
      }
    }
    void run();
    return () => {
      stop = true;
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t.users.title}</h1>
          <p className="mt-2 max-w-2xl text-fog">{t.users.lead}</p>
        </div>
        {can(actor, "users.manage") ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            {t.users.add}
          </button>
        ) : null}
      </div>
      <ErrorNote code={error} />
      <div className="card overflow-x-auto p-2">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.12em] text-fog">
            <tr>
              <th className="px-3 py-3 font-medium">{t.users.username}</th>
              <th className="px-3 py-3 font-medium">{t.users.role}</th>
              <th className="px-3 py-3 font-medium">{t.users.totp}</th>
              <th className="px-3 py-3 font-medium">{t.users.last}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-white/8">
                <td className="px-3 py-3 font-medium">
                  {user.username} {user.id === actor.id ? <span className="text-fog">({t.you})</span> : null}
                </td>
                <td className="px-3 py-3 text-fog">{user.isOwner ? t.owner : roleLabel(t, user.role)}</td>
                <td className="px-3 py-3">{user.totpEnabled ? t.on : t.off}</td>
                <td className="px-3 py-3 text-fog">{user.lastLoginAt ? formatWhen(user.lastLoginAt, lang) : t.users.never}</td>
                <td className="px-3 py-3 text-right">
                  {can(actor, "users.manage") && !user.isOwner && user.id !== actor.id ? (
                    <button
                      className="btn btn-quiet"
                      type="button"
                      onClick={() => {
                        setEditing(user);
                        setOpen(true);
                      }}
                    >
                      {t.users.edit}
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? (
        <UserModal
          key={editing?.id ?? "new"}
          open={open}
          user={editing}
          onClose={() => setOpen(false)}
          onSaved={async () => {
            setOpen(false);
            await load();
          }}
        />
      ) : null}
    </div>
  );
}

function roleLabel(t: ReturnType<typeof useI18n>["t"], role: string) {
  if (role === "admin" || role === "moderator" || role === "operator" || role === "custom") return t.users[role];
  return role;
}

function UserModal({
  open,
  user,
  onClose,
  onSaved,
}: {
  open: boolean;
  user: PublicUser | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const startingRole: Role = user
    ? user.role === "admin" || user.role === "moderator" || user.role === "operator" || user.role === "custom"
      ? user.role
      : (roleForPermissions(user.permissions) as Role)
    : "moderator";
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(startingRole);
  const [permissions, setPermissions] = useState<Permission[]>(
    user
      ? user.permissions.filter((item): item is Permission => PERMISSIONS.includes(item as Permission))
      : [...ROLE_PRESETS.moderator],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function applyRole(next: Role) {
    setRole(next);
    if (next !== "custom") setPermissions([...ROLE_PRESETS[next]]);
  }

  function toggle(permission: Permission) {
    const next = permissions.includes(permission)
      ? permissions.filter((item) => item !== permission)
      : [...permissions, permission];
    setPermissions(next);
    setRole(roleForPermissions(next) as Role);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (user) {
        await api(`/api/users/${user.id}`, {
          method: "PATCH",
          body: JSON.stringify({ role, permissions, ...(password ? { password } : {}) }),
        });
      } else {
        await api("/api/users", {
          method: "POST",
          body: JSON.stringify({ username, password, role, permissions }),
        });
      }
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!user || !window.confirm(t.users.deleteAsk)) return;
    setBusy(true);
    try {
      await api(`/api/users/${user.id}`, { method: "DELETE" });
      await onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "request_failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} title={user ? t.users.edit : t.users.add} onClose={onClose}>
      <form className="space-y-4" onSubmit={save}>
        <ErrorNote code={error} />
        <p className="text-sm text-fog">{t.users.presets}</p>
        {user ? null : (
          <Field label={t.users.username}>
            <input className="field" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </Field>
        )}
        <Field label={user ? t.users.newPassword : t.users.password} hint={user ? t.users.passwordOptional : t.setup.passwordHint}>
          <input className="field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required={!user} />
        </Field>
        <Field label={t.users.role}>
          <select className="field" value={role} onChange={(event) => applyRole(event.target.value as Role)}>
            <option value="admin">{t.users.admin}</option>
            <option value="moderator">{t.users.moderator}</option>
            <option value="operator">{t.users.operator}</option>
            <option value="custom">{t.users.custom}</option>
          </select>
        </Field>
        <div className="space-y-4">
          {PERMISSION_GROUPS.map((group) => (
            <fieldset key={group.id}>
              <legend className="mb-2 text-xs uppercase tracking-[0.14em] text-fog">{t.users.groups[group.id]}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {group.items.map((permission) => (
                  <label key={permission} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={permissions.includes(permission)}
                      onChange={() => toggle(permission)}
                    />
                    {t.perms[permission]}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" disabled={busy} type="submit">
            {busy ? t.loading : t.save}
          </button>
          {user ? (
            <button className="btn btn-danger" type="button" disabled={busy} onClick={() => void remove()}>
              {t.delete}
            </button>
          ) : null}
        </div>
      </form>
    </Modal>
  );
}
