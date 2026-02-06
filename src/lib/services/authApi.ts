export type LoginResponse = { success: boolean; user: string; name?: string; email?: string };

export async function loginLdap(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const msg = `Login failed: ${res.status}`;
    throw new Error(msg);
  }
  const json = (await res.json()) as LoginResponse;
  return json;
}

export async function loginLocal(username: string, password: string): Promise<LoginResponse> {
  const res = await fetch("/api/auth/local/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const msg = `Login failed: ${res.status}`;
    throw new Error(msg);
  }
  const json = (await res.json()) as LoginResponse;
  return json;
}
