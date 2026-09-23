export type Game = "minecraft" | "cs2" | "gmod" | "fs25" | "tf2" | "gta";
export type ServerStatus = "provisioning" | "running" | "stopped" | "error";
export type McType = "PAPER" | "VANILLA";
export type Difficulty = "peaceful" | "easy" | "normal" | "hard";
export type McMode = "survival" | "creative" | "adventure";
export type Cs2Mode = "competitive" | "casual" | "wingman" | "deathmatch";

export type ServerConfig = {
  maxPlayers: number;
  memoryGb: number;
  rconPassword: string;
  mcType?: McType;
  version?: string;
  motd?: string;
  onlineMode?: boolean;
  difficulty?: Difficulty;
  gameMode?: McMode;
  viewDistance?: number;
  gslt?: string;
  map?: string;
  password?: string;
  cs2Mode?: Cs2Mode;
  licenseKey?: string;
  onesync?: boolean;
};

export type ServerRecord = {
  id: string;
  name: string;
  game: Game;
  status: ServerStatus;
  statusDetail: string | null;
  error: string | null;
  containerId: string | null;
  port: number;
  extraPort: number | null;
  volumePath: string;
  config: ServerConfig;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PublicServer = {
  id: string;
  name: string;
  game: Game;
  status: ServerStatus;
  statusDetail: string | null;
  error: string | null;
  port: number;
  extraPort: number | null;
  connect: string;
  hasContainer: boolean;
  createdBy: string | null;
  createdAt: number;
  updatedAt: number;
  config: Omit<ServerConfig, "rconPassword"> & { gsltSet: boolean; licenseSet: boolean };
};

export type PublicUser = {
  id: string;
  username: string;
  isOwner: boolean;
  role: string;
  permissions: string[];
  totpEnabled: boolean;
  backupCodesLeft: number;
  createdAt: number;
  lastLoginAt: number | null;
};

export type PanelEvent = {
  id: string;
  username: string | null;
  action: string;
  detail: Record<string, string | number>;
  createdAt: number;
};

export type MysqlDatabase = {
  id: string;
  name: string;
  username: string;
  password: string;
  createdBy: string | null;
  createdAt: number;
};

export type Mailbox = {
  id: string;
  localPart: string;
  address: string;
  password: string;
  createdBy: string | null;
  createdAt: number;
};

export type BackupInfo = {
  id: string;
  serverId: string;
  filename: string;
  bytes: number;
  createdBy: string | null;
  createdAt: number;
};

export type Metrics = {
  cpu: { usage: number; cores: number; brand: string };
  memory: { total: number; used: number; percent: number };
  disks: { fs: string; mount: string; size: number; used: number; percent: number }[];
  os: { platform: string; distro: string; release: string; arch: string; hostname: string };
  uptime: number;
  network: { iface: string; rx: number; tx: number; rxSec: number; txSec: number }[];
};
