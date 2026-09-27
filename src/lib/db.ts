import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "crypto";
import { sanitizePermissions } from "./permissions";
import type {
  BackupInfo,
  PanelEvent,
  PublicUser,
  Mailbox,
  MysqlDatabase,
  ServerConfig,
  ServerRecord,
  ServerStatus,
} from "./types";

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  is_owner: number;
  role: string;
  permissions: string;
  totp_secret: string | null;
  totp_enabled: number;
  backup_codes: string;
  created_at: number;
  last_login_at: number | null;
};

type ServerRow = {
  id: string;
  name: string;
  game: ServerRecord["game"];
  status: ServerStatus;
  status_detail: string | null;
  error: string | null;
  container_id: string | null;
  port: number;
  extra_port: number | null;
  volume_path: string;
  config: string;
  created_by: string | null;
  created_at: number;
  updated_at: number;
};

type EventRow = {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  detail: string | null;
  created_at: number;
};

type BackupRow = {
  id: string;
  server_id: string;
  filename: string;
  bytes: number;
  created_by: string | null;
  created_at: number;
};

const globalForDb = globalThis as { heliosDb?: DatabaseSync };
let mysqlSchemaReady = false;

function database() {
  if (!globalForDb.heliosDb) {
    const dir = path.join(process.cwd(), "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "panel.db"));
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        is_owner INTEGER NOT NULL DEFAULT 0,
        role TEXT NOT NULL,
        permissions TEXT NOT NULL,
        totp_secret TEXT,
        totp_enabled INTEGER NOT NULL DEFAULT 0,
        backup_codes TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        last_login_at INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS login_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        game TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        error TEXT,
        container_id TEXT,
        port INTEGER NOT NULL,
        extra_port INTEGER,
        volume_path TEXT NOT NULL,
        config TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        username TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        filename TEXT NOT NULL,
        bytes INTEGER NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mysql_databases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS file_logins (
        server_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mail_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        domain TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mailboxes (
        id TEXT PRIMARY KEY,
        local_part TEXT NOT NULL UNIQUE COLLATE NOCASE,
        address TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS panel_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS server_schedules (
        server_id TEXT PRIMARY KEY,
        restart_at TEXT NOT NULL DEFAULT '',
        backup_at TEXT NOT NULL DEFAULT '',
        stop_at TEXT NOT NULL DEFAULT '',
        start_at TEXT NOT NULL DEFAULT '',
        last_restart TEXT NOT NULL DEFAULT '',
        last_backup TEXT NOT NULL DEFAULT '',
        last_stop TEXT NOT NULL DEFAULT '',
        last_start TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS alert_sent (
        server_id TEXT PRIMARY KEY,
        sent_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
        php INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL,
        container_id TEXT,
        status TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS webauthn_credentials (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        counter INTEGER NOT NULL DEFAULT 0,
        transports TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_webauthn_user ON webauthn_credentials(user_id);

      CREATE TABLE IF NOT EXISTS webauthn_challenges (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        challenge TEXT NOT NULL,
        expires_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shop_products (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL,
        delivery TEXT NOT NULL DEFAULT 'off',
        wait_online INTEGER NOT NULL DEFAULT 1,
        commands TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shop_orders (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        server_id TEXT NOT NULL,
        name TEXT NOT NULL,
        nick TEXT NOT NULL,
        email TEXT NOT NULL,
        steam TEXT NOT NULL DEFAULT '',
        fivem TEXT NOT NULL DEFAULT '',
        price_cents INTEGER NOT NULL,
        delivery TEXT NOT NULL,
        wait_online INTEGER NOT NULL,
        commands TEXT NOT NULL,
        provider TEXT NOT NULL,
        provider_ref TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        error TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        paid_at INTEGER,
        consent INTEGER NOT NULL DEFAULT 0,
        code_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS shop_codes (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        percent INTEGER NOT NULL DEFAULT 0,
        amount_cents INTEGER NOT NULL DEFAULT 0,
        uses_max INTEGER NOT NULL DEFAULT 0,
        uses_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS shop_agents (
        server_id TEXT PRIMARY KEY,
        token TEXT NOT NULL
      );
    `);
    globalForDb.heliosDb = db;
  }
  if (!mysqlSchemaReady && globalForDb.heliosDb) {
    globalForDb.heliosDb.exec(`
      CREATE TABLE IF NOT EXISTS mysql_databases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE COLLATE NOCASE,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS file_logins (
        server_id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mail_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        domain TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS mailboxes (
        id TEXT PRIMARY KEY,
        local_part TEXT NOT NULL UNIQUE COLLATE NOCASE,
        address TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS panel_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS server_schedules (
        server_id TEXT PRIMARY KEY,
        restart_at TEXT NOT NULL DEFAULT '',
        backup_at TEXT NOT NULL DEFAULT '',
        stop_at TEXT NOT NULL DEFAULT '',
        start_at TEXT NOT NULL DEFAULT '',
        last_restart TEXT NOT NULL DEFAULT '',
        last_backup TEXT NOT NULL DEFAULT '',
        last_stop TEXT NOT NULL DEFAULT '',
        last_start TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS alert_sent (
        server_id TEXT PRIMARY KEY,
        sent_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sites (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        domain TEXT NOT NULL UNIQUE COLLATE NOCASE,
        php INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL,
        container_id TEXT,
        status TEXT NOT NULL,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
    `);
    grantDatabasePermissions(globalForDb.heliosDb);
    mysqlSchemaReady = true;
  }
  ensureSitePhp(globalForDb.heliosDb);
  ensureShopConsent(globalForDb.heliosDb);
  ensureShopCode(globalForDb.heliosDb);
  return globalForDb.heliosDb;
}

function ensureSitePhp(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(sites)").all() as { name: string }[];
  if (!columns.length || columns.some((column) => column.name === "php")) return;
  db.exec("ALTER TABLE sites ADD COLUMN php INTEGER NOT NULL DEFAULT 0");
}

function ensureShopConsent(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(shop_orders)").all() as { name: string }[];
  if (!columns.length || columns.some((column) => column.name === "consent")) return;
  db.exec("ALTER TABLE shop_orders ADD COLUMN consent INTEGER NOT NULL DEFAULT 0");
}

function ensureShopCode(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(shop_orders)").all() as { name: string }[];
  if (columns.length && !columns.some((column) => column.name === "code_id")) {
    db.exec("ALTER TABLE shop_orders ADD COLUMN code_id TEXT NOT NULL DEFAULT ''");
  }
}

function grantDatabasePermissions(db: DatabaseSync) {
  const rows = db.prepare("SELECT id, is_owner, role, permissions FROM users").all() as UserRow[];
  for (const row of rows) {
    if (row.is_owner !== 1 && row.role !== "admin") continue;
    let list: string[] = [];
    try {
      const parsed = JSON.parse(row.permissions) as unknown;
      list = Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      list = [];
    }
    let changed = false;
    for (const permission of ["databases.view", "databases.manage", "mail.view", "mail.manage", "firewall.view", "firewall.manage", "panel.manage", "sites.view", "sites.manage", "bots.view", "bots.manage", "shop.view", "shop.manage"]) {
      if (!list.includes(permission)) {
        list.push(permission);
        changed = true;
      }
    }
    if (changed) {
      db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(JSON.stringify(list), row.id);
    }
  }
}

function one<T>(sql: string, ...params: unknown[]) {
  return database().prepare(sql).get(...params) as T | undefined;
}

function many<T>(sql: string, ...params: unknown[]) {
  return database().prepare(sql).all(...params) as T[];
}

export function withImmediate<T>(fn: () => T) {
  const db = database();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* already closed */
    }
    throw error;
  }
}

export function toPublicUser(row: UserRow): PublicUser {
  let codes: unknown = [];
  let permissions: unknown = [];
  try {
    codes = JSON.parse(row.backup_codes);
  } catch {
    codes = [];
  }
  try {
    permissions = JSON.parse(row.permissions);
  } catch {
    permissions = [];
  }
  return {
    id: row.id,
    username: row.username,
    isOwner: row.is_owner === 1,
    role: row.role,
    permissions: sanitizePermissions(Array.isArray(permissions) ? (permissions as string[]) : []),
    totpEnabled: row.totp_enabled === 1,
    helloEnabled: countHello(row.id) > 0,
    backupCodesLeft: Array.isArray(codes) ? codes.length : 0,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

export function hasUsers() {
  const row = one<{ c: number }>("SELECT COUNT(*) AS c FROM users");
  return (row?.c ?? 0) > 0;
}

export function findUserByUsername(username: string) {
  return one<UserRow>("SELECT * FROM users WHERE username = ? COLLATE NOCASE", username.trim());
}

export function findUserById(id: string) {
  return one<UserRow>("SELECT * FROM users WHERE id = ?", id);
}

export function listUserRows() {
  return many<UserRow>("SELECT * FROM users ORDER BY is_owner DESC, created_at ASC");
}

export function insertUser(input: {
  id: string;
  username: string;
  passwordHash: string;
  isOwner: boolean;
  role: string;
  permissions: string[];
}) {
  database()
    .prepare(
      `INSERT INTO users (
        id, username, password_hash, is_owner, role, permissions, totp_secret, totp_enabled, backup_codes, created_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0, '[]', ?, NULL)`,
    )
    .run(
      input.id,
      input.username.trim(),
      input.passwordHash,
      input.isOwner ? 1 : 0,
      input.role,
      JSON.stringify(input.permissions),
      Date.now(),
    );
}

export function updateUser(
  id: string,
  patch: {
    passwordHash?: string;
    role?: string;
    permissions?: string[];
    totpSecret?: string | null;
    totpEnabled?: boolean;
    backupCodes?: string[];
    lastLoginAt?: number | null;
  },
) {
  const user = findUserById(id);
  if (!user) return;
  database()
    .prepare(
      `UPDATE users SET password_hash = ?, role = ?, permissions = ?, totp_secret = ?, totp_enabled = ?, backup_codes = ?, last_login_at = ? WHERE id = ?`,
    )
    .run(
      patch.passwordHash ?? user.password_hash,
      patch.role ?? user.role,
      patch.permissions ? JSON.stringify(patch.permissions) : user.permissions,
      patch.totpSecret === undefined ? user.totp_secret : patch.totpSecret,
      patch.totpEnabled === undefined ? user.totp_enabled : patch.totpEnabled ? 1 : 0,
      patch.backupCodes ? JSON.stringify(patch.backupCodes) : user.backup_codes,
      patch.lastLoginAt === undefined ? user.last_login_at : patch.lastLoginAt,
      id,
    );
}

export function deleteUser(id: string) {
  database().prepare("DELETE FROM users WHERE id = ?").run(id);
}

export function userBackupHashes(id: string) {
  const user = findUserById(id);
  if (!user) return [];
  try {
    const parsed = JSON.parse(user.backup_codes) as unknown;
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function userTotpSecret(id: string) {
  return findUserById(id)?.totp_secret ?? null;
}

export function userPasswordHash(id: string) {
  return findUserById(id)?.password_hash ?? null;
}

type HelloRow = {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string;
};

export function countHello(userId: string) {
  const row = one<{ c: number }>("SELECT COUNT(*) AS c FROM webauthn_credentials WHERE user_id = ?", userId);
  return row?.c ?? 0;
}

export function listHello(userId: string) {
  return many<HelloRow>("SELECT id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = ?", userId);
}

export function helloCredential(userId: string, id: string) {
  return one<HelloRow>(
    "SELECT id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE user_id = ? AND id = ?",
    userId,
    id,
  );
}

export function insertHello(input: { id: string; userId: string; publicKey: string; counter: number; transports: string[] }) {
  database()
    .prepare(
      "INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(input.id, input.userId, input.publicKey, input.counter, JSON.stringify(input.transports), Date.now());
}

export function updateHelloCounter(id: string, counter: number) {
  database().prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?").run(counter, id);
}

export function deleteHello(userId: string) {
  database().prepare("DELETE FROM webauthn_credentials WHERE user_id = ?").run(userId);
}

export function saveWebauthnChallenge(id: string, userId: string, challenge: string) {
  const db = database();
  db.prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(id);
  db.prepare("INSERT INTO webauthn_challenges (id, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)").run(
    id,
    userId,
    challenge,
    Date.now() + 5 * 60 * 1000,
  );
}

export function takeWebauthnChallenge(id: string, userId: string) {
  const row = one<{ challenge: string; expires_at: number; user_id: string }>(
    "SELECT challenge, expires_at, user_id FROM webauthn_challenges WHERE id = ?",
    id,
  );
  database().prepare("DELETE FROM webauthn_challenges WHERE id = ?").run(id);
  if (!row || row.user_id !== userId || row.expires_at < Date.now()) return null;
  return row.challenge;
}

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function insertSession(idHash: string, userId: string) {
  const now = Date.now();
  database()
    .prepare("INSERT INTO sessions (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(idHash, userId, now + SESSION_MS, now);
}

export function findSessionUser(idHash: string) {
  return one<UserRow>(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?`,
    idHash,
    Date.now(),
  );
}

export function deleteSession(idHash: string) {
  database().prepare("DELETE FROM sessions WHERE id = ?").run(idHash);
}

export function deleteUserSessions(userId: string) {
  database().prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export function purgeExpired() {
  const now = Date.now();
  database().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
  database().prepare("DELETE FROM login_challenges WHERE expires_at <= ?").run(now);
  database().prepare("DELETE FROM webauthn_challenges WHERE expires_at <= ?").run(now);
}

export function insertChallenge(id: string, userId: string) {
  database()
    .prepare("INSERT INTO login_challenges (id, user_id, attempts, expires_at) VALUES (?, ?, 0, ?)")
    .run(id, userId, Date.now() + 5 * 60 * 1000);
}

export function getChallenge(id: string) {
  return one<{ id: string; user_id: string; attempts: number; expires_at: number }>(
    "SELECT * FROM login_challenges WHERE id = ?",
    id,
  );
}

export function bumpChallenge(id: string) {
  database().prepare("UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ?").run(id);
}

export function deleteChallenge(id: string) {
  database().prepare("DELETE FROM login_challenges WHERE id = ?").run(id);
}

function mapServer(row: ServerRow): ServerRecord {
  return {
    id: row.id,
    name: row.name,
    game: row.game,
    status: row.status,
    statusDetail: row.status_detail,
    error: row.error,
    containerId: row.container_id,
    port: row.port,
    extraPort: row.extra_port,
    volumePath: row.volume_path,
    config: JSON.parse(row.config) as ServerConfig,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listServers() {
  return many<ServerRow>("SELECT * FROM servers ORDER BY created_at DESC").map(mapServer);
}

export function getServer(id: string) {
  const row = one<ServerRow>("SELECT * FROM servers WHERE id = ?", id);
  return row ? mapServer(row) : undefined;
}

export function insertServer(server: ServerRecord) {
  database()
    .prepare(
      `INSERT INTO servers (
        id, name, game, status, status_detail, error, container_id, port, extra_port, volume_path, config, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      server.id,
      server.name,
      server.game,
      server.status,
      server.statusDetail,
      server.error,
      server.containerId,
      server.port,
      server.extraPort,
      server.volumePath,
      JSON.stringify(server.config),
      server.createdBy,
      server.createdAt,
      server.updatedAt,
    );
}

export function updateServer(
  id: string,
  patch: Partial<
    Pick<
      ServerRecord,
      "name" | "status" | "statusDetail" | "error" | "containerId" | "port" | "extraPort" | "config"
    >
  >,
) {
  const current = getServer(id);
  if (!current) return null;
  const next: ServerRecord = {
    ...current,
    ...patch,
    updatedAt: Date.now(),
  };
  database()
    .prepare(
      `UPDATE servers SET name = ?, status = ?, status_detail = ?, error = ?, container_id = ?, port = ?, extra_port = ?, config = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      next.name,
      next.status,
      next.statusDetail,
      next.error,
      next.containerId,
      next.port,
      next.extraPort,
      JSON.stringify(next.config),
      next.updatedAt,
      id,
    );
  return next;
}

export function deleteServerRow(id: string) {
  database().prepare("DELETE FROM backups WHERE server_id = ?").run(id);
  database().prepare("DELETE FROM server_schedules WHERE server_id = ?").run(id);
  database().prepare("DELETE FROM alert_sent WHERE server_id = ?").run(id);
  database().prepare("DELETE FROM servers WHERE id = ?").run(id);
}

export function logEvent(
  user: { id: string; username: string } | null,
  action: string,
  detail?: Record<string, string | number>,
) {
  database()
    .prepare(
      "INSERT INTO events (id, user_id, username, action, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(
      randomUUID(),
      user?.id ?? null,
      user?.username ?? null,
      action,
      detail ? JSON.stringify(detail) : null,
      Date.now(),
    );
}

export function listEvents(limit = 12): PanelEvent[] {
  return many<EventRow>("SELECT * FROM events ORDER BY created_at DESC LIMIT ?", limit).map((row) => {
    let detail: Record<string, string | number> = {};
    if (row.detail) {
      try {
        const parsed = JSON.parse(row.detail) as unknown;
        if (parsed && typeof parsed === "object") detail = parsed as Record<string, string | number>;
      } catch {
        detail = {};
      }
    }
    return {
      id: row.id,
      username: row.username,
      action: row.action,
      detail,
      createdAt: row.created_at,
    };
  });
}

function mapBackup(row: BackupRow): BackupInfo {
  return {
    id: row.id,
    serverId: row.server_id,
    filename: row.filename,
    bytes: row.bytes,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function listBackups(serverId: string) {
  return many<BackupRow>(
    "SELECT * FROM backups WHERE server_id = ? ORDER BY created_at DESC",
    serverId,
  ).map(mapBackup);
}

export function getBackup(id: string) {
  const row = one<BackupRow>("SELECT * FROM backups WHERE id = ?", id);
  return row ? mapBackup(row) : undefined;
}

export function insertBackup(backup: BackupInfo) {
  database()
    .prepare(
      "INSERT INTO backups (id, server_id, filename, bytes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(backup.id, backup.serverId, backup.filename, backup.bytes, backup.createdBy, backup.createdAt);
}

export function deleteBackupRow(id: string) {
  database().prepare("DELETE FROM backups WHERE id = ?").run(id);
}

type MysqlRow = {
  id: string;
  name: string;
  username: string;
  password: string;
  created_by: string | null;
  created_at: number;
};

function mapMysql(row: MysqlRow): MysqlDatabase {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    password: row.password,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function listMysqlDatabases() {
  return many<MysqlRow>("SELECT * FROM mysql_databases ORDER BY created_at DESC").map(mapMysql);
}

export function getMysqlDatabase(id: string) {
  const row = one<MysqlRow>("SELECT * FROM mysql_databases WHERE id = ?", id);
  return row ? mapMysql(row) : undefined;
}

export function mysqlNameTaken(name: string) {
  return Boolean(
    one("SELECT id FROM mysql_databases WHERE name = ? COLLATE NOCASE OR username = ? COLLATE NOCASE", name, name),
  );
}

export function insertMysqlDatabase(row: MysqlDatabase) {
  database()
    .prepare(
      "INSERT INTO mysql_databases (id, name, username, password, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(row.id, row.name, row.username, row.password, row.createdBy, row.createdAt);
}

export function deleteMysqlDatabaseRow(id: string) {
  database().prepare("DELETE FROM mysql_databases WHERE id = ?").run(id);
}

type MailboxRow = {
  id: string;
  local_part: string;
  address: string;
  password: string;
  created_by: string | null;
  created_at: number;
};

function mapMailbox(row: MailboxRow): Mailbox {
  return {
    id: row.id,
    localPart: row.local_part,
    address: row.address,
    password: row.password,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export function getMailDomain() {
  const row = one<{ domain: string }>("SELECT domain FROM mail_settings WHERE id = 1");
  return row?.domain ?? null;
}

export function setMailDomain(domain: string) {
  database()
    .prepare(
      "INSERT INTO mail_settings (id, domain) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET domain = excluded.domain",
    )
    .run(domain);
}

export function listMailboxes() {
  return many<MailboxRow>("SELECT * FROM mailboxes ORDER BY created_at DESC").map(mapMailbox);
}

export function getMailbox(id: string) {
  const row = one<MailboxRow>("SELECT * FROM mailboxes WHERE id = ?", id);
  return row ? mapMailbox(row) : undefined;
}

export function mailboxTaken(localPart: string) {
  return Boolean(one("SELECT id FROM mailboxes WHERE local_part = ? COLLATE NOCASE", localPart));
}

export function insertMailbox(row: Mailbox) {
  database()
    .prepare(
      "INSERT INTO mailboxes (id, local_part, address, password, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .run(row.id, row.localPart, row.address, row.password, row.createdBy, row.createdAt);
}

export function deleteMailboxRow(id: string) {
  database().prepare("DELETE FROM mailboxes WHERE id = ?").run(id);
}

export function getSetting(key: string) {
  const row = one<{ value: string }>('SELECT value FROM panel_settings WHERE "key" = ?', key);
  return row?.value ?? "";
}

export function setSetting(key: string, value: string) {
  if (!value) {
    database().prepare('DELETE FROM panel_settings WHERE "key" = ?').run(key);
    return;
  }
  database()
    .prepare(
      'INSERT INTO panel_settings ("key", value) VALUES (?, ?) ON CONFLICT("key") DO UPDATE SET value = excluded.value',
    )
    .run(key, value);
}

export type ShopProductRow = {
  id: string;
  server_id: string;
  name: string;
  description: string;
  price_cents: number;
  delivery: "off" | "console" | "plugin";
  wait_online: number;
  commands: string;
  created_at: number;
};

export type ShopOrderRow = {
  id: string;
  product_id: string;
  server_id: string;
  name: string;
  nick: string;
  email: string;
  steam: string;
  fivem: string;
  price_cents: number;
  delivery: "off" | "console" | "plugin";
  wait_online: number;
  commands: string;
  provider: string;
  provider_ref: string;
  status: string;
  error: string;
  created_at: number;
  paid_at: number | null;
  consent: number;
  code_id: string;
};

export function listShopProducts() {
  return many<ShopProductRow>("SELECT * FROM shop_products ORDER BY created_at DESC");
}

export function getShopProduct(id: string) {
  return one<ShopProductRow>("SELECT * FROM shop_products WHERE id = ?", id);
}

export function insertShopProduct(row: ShopProductRow) {
  database()
    .prepare(
      `INSERT INTO shop_products (
        id, server_id, name, description, price_cents, delivery, wait_online, commands, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.server_id, row.name, row.description, row.price_cents, row.delivery, row.wait_online, row.commands, row.created_at);
}

export function updateShopProduct(row: ShopProductRow) {
  database()
    .prepare(
      `UPDATE shop_products
       SET server_id = ?, name = ?, description = ?, price_cents = ?, delivery = ?, wait_online = ?, commands = ?
       WHERE id = ?`,
    )
    .run(row.server_id, row.name, row.description, row.price_cents, row.delivery, row.wait_online, row.commands, row.id);
}

export function deleteShopProduct(id: string) {
  database().prepare("DELETE FROM shop_products WHERE id = ?").run(id);
}

export type ShopCodeRow = {
  id: string;
  kind: "discount" | "voucher";
  code: string;
  percent: number;
  amount_cents: number;
  uses_max: number;
  uses_count: number;
  created_at: number;
};

export function listShopCodes() {
  return many<ShopCodeRow>("SELECT * FROM shop_codes ORDER BY created_at DESC");
}

export function getShopCode(code: string) {
  return one<ShopCodeRow>("SELECT * FROM shop_codes WHERE code = ? COLLATE NOCASE", code.trim());
}

export function insertShopCode(row: ShopCodeRow) {
  database()
    .prepare(
      `INSERT INTO shop_codes (id, kind, code, percent, amount_cents, uses_max, uses_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, row.kind, row.code, row.percent, row.amount_cents, row.uses_max, row.uses_count, row.created_at);
}

export function deleteShopCode(id: string) {
  database().prepare("DELETE FROM shop_codes WHERE id = ?").run(id);
}

export function claimShopCode(id: string) {
  const result = database()
    .prepare("UPDATE shop_codes SET uses_count = uses_count + 1 WHERE id = ? AND (uses_max = 0 OR uses_count < uses_max)")
    .run(id);
  return Number(result.changes) === 1;
}

export function releaseShopCode(id: string) {
  if (!id) return;
  database()
    .prepare("UPDATE shop_codes SET uses_count = CASE WHEN uses_count > 0 THEN uses_count - 1 ELSE 0 END WHERE id = ?")
    .run(id);
}

export function insertShopOrder(row: ShopOrderRow) {
  database()
    .prepare(
      `INSERT INTO shop_orders (
        id, product_id, server_id, name, nick, email, steam, fivem, price_cents, delivery, wait_online,
        commands, provider, provider_ref, status, error, created_at, paid_at, consent, code_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.id,
      row.product_id,
      row.server_id,
      row.name,
      row.nick,
      row.email,
      row.steam,
      row.fivem,
      row.price_cents,
      row.delivery,
      row.wait_online,
      row.commands,
      row.provider,
      row.provider_ref,
      row.status,
      row.error,
      row.created_at,
      row.paid_at,
      row.consent,
      row.code_id,
    );
}

export function getShopOrder(id: string) {
  return one<ShopOrderRow>("SELECT * FROM shop_orders WHERE id = ?", id);
}

export function listShopOrders(limit = 40) {
  return many<ShopOrderRow>("SELECT * FROM shop_orders ORDER BY created_at DESC LIMIT ?", limit);
}

export function listQueuedShopOrders(limit = 10) {
  return many<ShopOrderRow>("SELECT * FROM shop_orders WHERE status = 'queued' AND delivery = 'console' ORDER BY paid_at ASC LIMIT ?", limit);
}

export function listPluginShopOrders(serverId: string) {
  return many<ShopOrderRow>(
    "SELECT * FROM shop_orders WHERE status = 'queued' AND delivery = 'plugin' AND server_id = ? ORDER BY paid_at ASC LIMIT 20",
    serverId,
  );
}

export function claimShopOrder(id: string) {
  const result = database().prepare("UPDATE shop_orders SET status = 'sending' WHERE id = ? AND status = 'queued'").run(id);
  return Number(result.changes) === 1;
}

export function releaseShopSending() {
  database().prepare("UPDATE shop_orders SET status = 'queued' WHERE status = 'sending'").run();
}

export function setShopOrder(id: string, patch: { status?: string; error?: string; providerRef?: string; paidAt?: number | null }) {
  const row = getShopOrder(id);
  if (!row) return;
  database()
    .prepare("UPDATE shop_orders SET status = ?, error = ?, provider_ref = ?, paid_at = ? WHERE id = ?")
    .run(
      patch.status ?? row.status,
      patch.error ?? row.error,
      patch.providerRef ?? row.provider_ref,
      patch.paidAt === undefined ? row.paid_at : patch.paidAt,
      id,
    );
}

export function shopAgentToken(serverId: string) {
  return one<{ token: string }>("SELECT token FROM shop_agents WHERE server_id = ?", serverId)?.token ?? "";
}

export function saveShopAgent(serverId: string, token: string) {
  database()
    .prepare("INSERT INTO shop_agents (server_id, token) VALUES (?, ?) ON CONFLICT(server_id) DO UPDATE SET token = excluded.token")
    .run(serverId, token);
}

export function shopAgentServer(token: string) {
  return one<{ server_id: string }>("SELECT server_id FROM shop_agents WHERE token = ?", token)?.server_id ?? "";
}

export type ServerSchedule = {
  serverId: string;
  restartAt: string;
  backupAt: string;
  stopAt: string;
  startAt: string;
  lastRestart: string;
  lastBackup: string;
  lastStop: string;
  lastStart: string;
};

type ScheduleRow = {
  server_id: string;
  restart_at: string;
  backup_at: string;
  stop_at: string;
  start_at: string;
  last_restart: string;
  last_backup: string;
  last_stop: string;
  last_start: string;
};

function mapSchedule(row: ScheduleRow): ServerSchedule {
  return {
    serverId: row.server_id,
    restartAt: row.restart_at,
    backupAt: row.backup_at,
    stopAt: row.stop_at,
    startAt: row.start_at,
    lastRestart: row.last_restart,
    lastBackup: row.last_backup,
    lastStop: row.last_stop,
    lastStart: row.last_start,
  };
}

export function getSchedule(serverId: string): ServerSchedule {
  const row = one<ScheduleRow>("SELECT * FROM server_schedules WHERE server_id = ?", serverId);
  return (
    (row && mapSchedule(row)) ?? {
      serverId,
      restartAt: "",
      backupAt: "",
      stopAt: "",
      startAt: "",
      lastRestart: "",
      lastBackup: "",
      lastStop: "",
      lastStart: "",
    }
  );
}

export function listSchedules() {
  return many<ScheduleRow>("SELECT * FROM server_schedules").map(mapSchedule);
}

export function saveSchedule(schedule: ServerSchedule) {
  database()
    .prepare(
      `INSERT INTO server_schedules (
        server_id, restart_at, backup_at, stop_at, start_at, last_restart, last_backup, last_stop, last_start
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(server_id) DO UPDATE SET
        restart_at = excluded.restart_at,
        backup_at = excluded.backup_at,
        stop_at = excluded.stop_at,
        start_at = excluded.start_at,
        last_restart = excluded.last_restart,
        last_backup = excluded.last_backup,
        last_stop = excluded.last_stop,
        last_start = excluded.last_start`,
    )
    .run(
      schedule.serverId,
      schedule.restartAt,
      schedule.backupAt,
      schedule.stopAt,
      schedule.startAt,
      schedule.lastRestart,
      schedule.lastBackup,
      schedule.lastStop,
      schedule.lastStart,
    );
}

export function alertSentAt(serverId: string) {
  const row = one<{ sent_at: number }>("SELECT sent_at FROM alert_sent WHERE server_id = ?", serverId);
  return row?.sent_at ?? 0;
}

export function markAlertSent(serverId: string, sentAt: number) {
  database()
    .prepare(
      "INSERT INTO alert_sent (server_id, sent_at) VALUES (?, ?) ON CONFLICT(server_id) DO UPDATE SET sent_at = excluded.sent_at",
    )
    .run(serverId, sentAt);
}

export type FileLogin = {
  serverId: string;
  username: string;
  password: string;
  volumePath: string;
  createdAt: number;
};

type FileLoginRow = {
  server_id: string;
  username: string;
  password: string;
  volume_path: string;
  created_at: number;
};

function mapFileLogin(row: FileLoginRow): FileLogin {
  return {
    serverId: row.server_id,
    username: row.username,
    password: row.password,
    volumePath: row.volume_path,
    createdAt: row.created_at,
  };
}

function loginVolume(id: string) {
  const server = getServer(id);
  if (server) return server.volumePath;
  if (getSiteRow(id)) return path.join(process.cwd(), "data", "sites", id);
  if (getBotRow(id)) return path.join(process.cwd(), "data", "bots", id);
  return undefined;
}

export function getFileLogin(targetId: string) {
  const row = one<{ server_id: string; username: string; password: string; created_at: number }>(
    "SELECT server_id, username, password, created_at FROM file_logins WHERE server_id = ?",
    targetId,
  );
  const volumePath = row ? loginVolume(row.server_id) : undefined;
  if (!row || !volumePath) return undefined;
  return mapFileLogin({ ...row, volume_path: volumePath });
}

export function listFileLogins() {
  return many<{ server_id: string; username: string; password: string; created_at: number }>(
    "SELECT server_id, username, password, created_at FROM file_logins ORDER BY created_at",
  ).flatMap((row) => {
    const volumePath = loginVolume(row.server_id);
    return volumePath ? [mapFileLogin({ ...row, volume_path: volumePath })] : [];
  });
}

export function upsertFileLogin(login: { serverId: string; username: string; password: string; createdAt: number }) {
  database()
    .prepare(
      `INSERT INTO file_logins (server_id, username, password, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(server_id) DO UPDATE SET username = excluded.username, password = excluded.password`,
    )
    .run(login.serverId, login.username, login.password, login.createdAt);
}

export function deleteFileLogin(serverId: string) {
  database().prepare("DELETE FROM file_logins WHERE server_id = ?").run(serverId);
}

export type SiteRow = {
  id: string;
  name: string;
  domain: string;
  php: boolean;
  createdBy: string | null;
  createdAt: number;
};

export function listSiteRows() {
  return many<{ id: string; name: string; domain: string; php: number; created_by: string | null; created_at: number }>(
    "SELECT id, name, domain, php, created_by, created_at FROM sites ORDER BY created_at",
  ).map((row) => ({
    id: row.id,
    name: row.name,
    domain: row.domain,
    php: row.php === 1,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export function siteDomainTaken(domain: string) {
  return Boolean(one("SELECT id FROM sites WHERE domain = ? COLLATE NOCASE", domain));
}

export function insertSite(row: SiteRow) {
  database()
    .prepare("INSERT INTO sites (id, name, domain, php, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(row.id, row.name, row.domain, row.php ? 1 : 0, row.createdBy, row.createdAt);
}

export function setSitePhpFlag(id: string, enabled: boolean) {
  database().prepare("UPDATE sites SET php = ? WHERE id = ?").run(enabled ? 1 : 0, id);
}

export function getSiteRow(id: string) {
  return listSiteRows().find((site) => site.id === id);
}

export function deleteSiteRow(id: string) {
  database().prepare("DELETE FROM sites WHERE id = ?").run(id);
}

export type BotRow = {
  id: string;
  name: string;
  token: string;
  containerId: string | null;
  status: string;
  createdBy: string | null;
  createdAt: number;
};

export function listBotRows() {
  return many<{
    id: string;
    name: string;
    token: string;
    container_id: string | null;
    status: string;
    created_by: string | null;
    created_at: number;
  }>("SELECT id, name, token, container_id, status, created_by, created_at FROM bots ORDER BY created_at").map((row) => ({
    id: row.id,
    name: row.name,
    token: row.token,
    containerId: row.container_id,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }));
}

export function getBotRow(id: string) {
  return listBotRows().find((bot) => bot.id === id);
}

export function insertBot(row: BotRow) {
  database()
    .prepare("INSERT INTO bots (id, name, token, container_id, status, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(row.id, row.name, row.token, row.containerId, row.status, row.createdBy, row.createdAt);
}

export function updateBot(id: string, patch: { token?: string; containerId?: string | null; status?: string; name?: string }) {
  const current = getBotRow(id);
  if (!current) return;
  const next = {
    name: patch.name ?? current.name,
    token: patch.token ?? current.token,
    containerId: patch.containerId === undefined ? current.containerId : patch.containerId,
    status: patch.status ?? current.status,
  };
  database()
    .prepare("UPDATE bots SET name = ?, token = ?, container_id = ?, status = ? WHERE id = ?")
    .run(next.name, next.token, next.containerId, next.status, id);
}

export function deleteBotRow(id: string) {
  database().prepare("DELETE FROM bots WHERE id = ?").run(id);
}
