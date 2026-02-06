const apiBaseRaw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? undefined;
const apiBase = apiBaseRaw && apiBaseRaw.length ? apiBaseRaw : "/api";
const useRelativeRaw = (import.meta.env.VITE_USE_RELATIVE_API_URL as string | undefined) ?? undefined;
const useRelative = String(useRelativeRaw ?? "true").toLowerCase() === "true";
const backendUrlRaw = (import.meta.env.VITE_BACKEND_URL as string | undefined) ?? undefined;
const backendUrl = backendUrlRaw && backendUrlRaw.length ? backendUrlRaw : "";

export function buildApiUrl(path: string, qs?: URLSearchParams): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  const urlPath = `${apiBase}${p}`;
  const query = qs && qs.toString().length ? `?${qs.toString()}` : "";
  if (useRelative || !backendUrl) return `${urlPath}${query}`;
  return `${backendUrl}${urlPath}${query}`;
}
