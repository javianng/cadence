"use client";

import { auth } from "~/lib/firebase/client";

/** POSTs JSON to our API with the user's ID token; throws readable errors. */
export async function apiPost<T = unknown>(
  path: string,
  body: unknown,
): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error("You're signed out — sign in again.");
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => null)) as
    ({ ok?: boolean; error?: string } & T) | null;
  if (!response.ok || json?.ok === false) {
    throw new Error(json?.error ?? `Request failed (${response.status})`);
  }
  return json as T;
}
