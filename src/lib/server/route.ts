import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { AIError } from "@/lib/ai/client";
import { getUser } from "@/lib/supabase/server";

export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

type Handler = (ctx: { req: Request; supabase: SupabaseClient; user: User }) => Promise<unknown>;

/** Wraps an API route: requires a signed-in user and converts errors into friendly JSON. */
export function authed(handler: Handler) {
  return async (req: Request) => {
    try {
      const { supabase, user } = await getUser();
      if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
      const result = await handler({ req, supabase, user });
      return NextResponse.json(result);
    } catch (err) {
      if (err instanceof HttpError || err instanceof AIError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      console.error(err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError("Invalid request body.");
  }
}
