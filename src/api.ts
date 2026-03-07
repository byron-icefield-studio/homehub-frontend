export type ServiceItem = {
  id: string;
  name: string;
  icon?: string;
  intranet_url: string;
  extranet_url?: string;
  open_mode: "auto" | "internal" | "external";
  tags: string[];
};

export type ServiceGroup = {
  id: string;
  name: string;
  services: ServiceItem[];
};

export type ServicesConfig = {
  version: number;
  updated_at?: string;
  groups: ServiceGroup[];
};

export type SystemStats = {
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  load_avg: number[];
};

const CACHE_KEY = "homehub.services.config.v1";

export async function fetchServicesConfig(): Promise<ServicesConfig> {
  const res = await fetch("/api/config/services");
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as ServicesConfig;
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}

export function getCachedServicesConfig(): ServicesConfig | null {
  const raw = localStorage.getItem(CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServicesConfig;
  } catch {
    return null;
  }
}

export function chooseUrl(item: ServiceItem): string {
  if (item.open_mode === "internal") return item.intranet_url;
  if (item.open_mode === "external") return item.extranet_url || item.intranet_url;

  const host = window.location.hostname;
  const isInternalHost =
    host === "localhost" || host.startsWith("192.168.") || host.startsWith("10.") || host.endsWith(".local");

  if (isInternalHost) return item.intranet_url;
  return item.extranet_url || item.intranet_url;
}

export async function fetchSystemStats(): Promise<SystemStats | null> {
  try {
    const res = await fetch("/api/system/stats");
    if (!res.ok) return null;
    return (await res.json()) as SystemStats;
  } catch {
    return null;
  }
}
