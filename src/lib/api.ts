import { NextResponse } from "next/server";
import { getCurrentUser } from "./auth";
import { can, type Permission } from "./permissions";
import type { PublicUser } from "./types";

export function apiError(code: string, status: number, detail?: string) {
  const extra = detail?.replace(/\s+/g, " ").trim().slice(0, 180);
  return NextResponse.json(extra ? { error: code, detail: extra } : { error: code }, { status });
}

export async function guard(permission?: Permission): Promise<
  | { user: PublicUser; error: null }
  | { user: null; error: NextResponse }
> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: apiError("unauthorized", 401) };
  if (permission && !can(user, permission)) return { user: null, error: apiError("forbidden", 403) };
  return { user, error: null };
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    return null;
  }
}
