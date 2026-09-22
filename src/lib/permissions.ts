import type { PublicUser } from "./types";

export const PERMISSIONS = [
  "metrics.view",
  "servers.view",
  "servers.create",
  "servers.delete",
  "servers.power",
  "servers.console",
  "servers.files",
  "servers.files.write",
  "servers.backups",
  "servers.settings",
  "users.view",
  "users.manage",
  "databases.view",
  "databases.manage",
  "mail.view",
  "mail.manage",
  "firewall.view",
  "firewall.manage",
  "panel.manage",
  "sites.view",
  "sites.manage",
  "bots.view",
  "bots.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PRESETS: Record<"admin" | "moderator" | "operator", Permission[]> = {
  admin: [...PERMISSIONS],
  moderator: [
    "metrics.view",
    "servers.view",
    "servers.power",
    "servers.console",
    "servers.files",
    "servers.files.write",
    "servers.backups",
  ],
  operator: ["servers.view", "servers.power", "servers.console"],
};

export function sanitizePermissions(list: string[]): Permission[] {
  const allowed = new Set<string>(PERMISSIONS);
  return PERMISSIONS.filter((permission) => list.includes(permission) && allowed.has(permission));
}

export function can(user: Pick<PublicUser, "isOwner" | "permissions">, permission: Permission) {
  if (user.isOwner) return true;
  return user.permissions.includes(permission);
}

export function resolveRolePermissions(
  actor: PublicUser,
  role: string,
  requested: string[],
): Permission[] | "forbidden" {
  if (role === "owner") return "forbidden";
  let permissions: Permission[];
  if (role === "admin" || role === "moderator" || role === "operator") {
    permissions = [...ROLE_PRESETS[role]];
  } else if (role === "custom") {
    permissions = sanitizePermissions(requested);
  } else {
    return "forbidden";
  }
  if (!actor.isOwner && permissions.some((permission) => !can(actor, permission))) {
    return "forbidden";
  }
  return permissions;
}

export function roleForPermissions(permissions: string[]) {
  for (const [role, preset] of Object.entries(ROLE_PRESETS) as [
    keyof typeof ROLE_PRESETS,
    Permission[],
  ][]) {
    if (
      preset.length === permissions.length &&
      preset.every((permission) => permissions.includes(permission))
    ) {
      return role;
    }
  }
  return "custom";
}
