export function formatTime(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const h = value.getUTCHours();
    const m = value.getUTCMinutes();
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(value);
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = match[2];
    return `${h}:${m}`;
  }
  return s;
}

export function toBoolNextDay(value: string | number | boolean | null): boolean {
  if (value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const v = String(value).trim().toLowerCase();
  return v === "y" || v === "yes" || v === "true" || v === "1";
}

export function formatDate(value: unknown): string {
  if (value === null || value === undefined) return "";
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTimeWita(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    const ms = value.getTime() + 8 * 60 * 60 * 1000;
    const w = new Date(ms);
    const hh = w.getUTCHours().toString().padStart(2, "0");
    const mm = w.getUTCMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  const s = String(value);
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    const h = match[1].padStart(2, "0");
    const m = match[2];
    return `${h}:${m}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const ms = d.getTime() + 8 * 60 * 60 * 1000;
    const w = new Date(ms);
    const hh = w.getUTCHours().toString().padStart(2, "0");
    const mm = w.getUTCMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  return s;
}
