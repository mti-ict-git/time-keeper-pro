import { buildApiUrl } from "@/lib/config/api";
export type UserRow = Record<string, unknown>;

export async function listUsers(): Promise<UserRow[]> {
  const res = await fetch(buildApiUrl("users"), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`);
  const json = (await res.json()) as { data: UserRow[] };
  return json.data;
}

export type AddUserBody = { username?: string; password?: string; name?: string; email?: string; department?: string; authType?: string };

export async function addUser(body: AddUserBody): Promise<{ success: boolean }> {
  const res = await fetch(buildApiUrl("users"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Add user failed: ${res.status}`);
  return (await res.json()) as { success: boolean };
}

export type AdUser = { dn: string; username: string; name: string; email: string };

export async function searchAdUsers(q: string): Promise<AdUser[]> {
  const url = buildApiUrl("users/ad/search", new URLSearchParams({ q }));
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`AD search failed: ${res.status}`);
  const json = (await res.json()) as { data: AdUser[] };
  return json.data;
}

export async function importAdUser(user: AdUser, department?: string): Promise<{ success: boolean }> {
  const res = await fetch(buildApiUrl("users/ad/import"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: user.username, name: user.name, email: user.email, department }),
  });
  if (!res.ok) throw new Error(`AD import failed: ${res.status}`);
  return (await res.json()) as { success: boolean };
}
