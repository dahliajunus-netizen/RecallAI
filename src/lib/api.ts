"use client";

/** POST JSON to one of our API routes; throws an Error with a friendly message on failure. */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  return handle<T>(res);
}

export async function getJson<T>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = (json as { error?: string } | null)?.error;
    if (message) throw new Error(message);
    // A gateway timeout from the host has no JSON body.
    if (res.status === 504) throw new Error("The request took too long. Try again, or with fewer documents.");
    throw new Error(`Request failed (${res.status}).`);
  }
  return json as T;
}
