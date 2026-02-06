import { Controller } from "@/lib/models";

export interface ControllerApiItem {
  name: string;
  records: number;
}

function toId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function fetchControllers(): Promise<Controller[]> {
  const base = import.meta.env.VITE_BACKEND_URL && import.meta.env.VITE_BACKEND_URL.length ? import.meta.env.VITE_BACKEND_URL : "";
  const path = "/api/controllers";
  const url = base ? `${base}${path}` : path;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`Failed to fetch controllers: ${res.status}`);
  }
  const json = (await res.json()) as { data: ControllerApiItem[] };
  const now = new Date();
  return json.data.map((item) => ({
    id: toId(item.name || "controller"),
    name: item.name,
    location: "",
    ipAddress: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
  }));
}
