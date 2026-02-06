import { Controller } from "@/lib/models";
import { buildApiUrl } from "@/lib/config/api";

export interface ControllerApiItem {
  name: string;
  records: number;
}

function toId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export async function fetchControllers(): Promise<Controller[]> {
  const res = await fetch(buildApiUrl("controllers"), { headers: { Accept: "application/json" } });
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
