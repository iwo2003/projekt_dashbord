import { z } from "zod";
import { CS2_MAPS, MC_VERSIONS } from "./constants";

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9._-]+$/);

export const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[A-Za-z]/)
  .regex(/[0-9]/);

export const setupSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(128),
});

export const totpLoginSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().trim().min(6).max(20),
});

export const passwordChangeSchema = z.object({
  current: z.string().min(1).max(128),
  next: passwordSchema,
});

export const codeSchema = z.object({
  code: z.string().trim().min(6).max(12),
});

export const disableTotpSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().trim().min(6).max(12),
});

export const userCreateSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  role: z.enum(["admin", "moderator", "operator", "custom"]),
  permissions: z.array(z.string()).default([]),
});

export const userPatchSchema = z.object({
  password: passwordSchema.optional(),
  role: z.enum(["admin", "moderator", "operator", "custom"]),
  permissions: z.array(z.string()).default([]),
});

const serverFields = {
  name: z.string().trim().min(2).max(48),
  port: z.number().int().min(1024).max(65535),
  maxPlayers: z.number().int().min(1).max(100),
  memoryGb: z.number().int().min(1).max(32),
  mcType: z.enum(["PAPER", "VANILLA"]).optional(),
  version: z.enum(MC_VERSIONS).optional(),
  motd: z.string().trim().max(80).optional(),
  onlineMode: z.boolean().optional(),
  difficulty: z.enum(["peaceful", "easy", "normal", "hard"]).optional(),
  gameMode: z.enum(["survival", "creative", "adventure"]).optional(),
  viewDistance: z.number().int().min(4).max(32).optional(),
  gslt: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]+$/)
    .min(8)
    .max(64)
    .optional()
    .or(z.literal("")),
  map: z.enum(CS2_MAPS).optional(),
  password: z.string().max(64).optional(),
  cs2Mode: z.enum(["competitive", "casual", "wingman", "deathmatch"]).optional(),
};

export const createServerSchema = z
  .object({
    game: z.enum(["minecraft", "cs2"]),
    ...serverFields,
  })
  .superRefine((value, ctx) => {
    if (value.game === "cs2") {
      if (!value.gslt || value.gslt.length < 8) {
        ctx.addIssue({ code: "custom", path: ["gslt"], message: "gslt" });
      }
      if (value.maxPlayers > 64) {
        ctx.addIssue({ code: "custom", path: ["maxPlayers"], message: "players" });
      }
    }
  });

export const updateServerSchema = z.object(serverFields);

export const commandSchema = z.object({
  command: z.string().trim().min(1).max(500),
});

export const fileWriteSchema = z.object({
  action: z.enum(["write", "mkdir"]),
  path: z.string().max(400),
  content: z.string().max(1_000_000).optional(),
});

export const powerSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export const backupCreateSchema = z.object({
  safe: z.boolean().optional(),
});

export const databaseCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z][a-z0-9_]{1,31}$/),
});

export const mailDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/),
});

export const mailboxCreateSchema = z.object({
  local: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9._-]{0,30}[a-z0-9])?$/),
  password: z
    .string()
    .min(10)
    .max(64)
    .regex(/^[A-Za-z0-9!@#%^*+=._][A-Za-z0-9!@#%^*+=._-]*$/)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
});

export const firewallActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("enable") }),
  z.object({ action: z.literal("disable") }),
  z.object({
    action: z.literal("service"),
    id: z.enum(["minecraft", "cs2", "mysql", "ftp", "mail"]),
    open: z.boolean(),
  }),
  z.object({ action: z.literal("server"), id: z.string().uuid(), open: z.boolean() }),
  z.object({
    action: z.literal("allow"),
    port: z.string().regex(/^\d{1,5}(?::\d{1,5})?$/),
    proto: z.enum(["tcp", "udp"]),
  }),
  z.object({
    action: z.literal("close"),
    port: z.string().regex(/^\d{1,5}(?::\d{1,5})?$/),
    proto: z.enum(["tcp", "udp"]),
  }),
]);
