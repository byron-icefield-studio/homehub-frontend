export type ServiceItem = {
  id: string;
  name: string;
  icon?: string;
  intranet_url: string;
  extranet_url?: string;
  open_mode: "auto" | "internal" | "external";
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
  cpu_percents: number[];
  memory_percent: number;
  memory_used_bytes: number;
  memory_total_bytes: number;
  disk_percent: number;
  disk_used_bytes: number;
  disk_total_bytes: number;
  load_avg: number[];
};

export type ContainerInfo = {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
};

export type ContainerStats = {
  name: string;
  cpu_percent: number;
  memory_usage_bytes: number;
  memory_limit_bytes: number;
  memory_percent: number;
};

export type DockerLinkConfig = {
  name: string;
  intranet_url: string;
  extranet_url: string;
  icon: string;
};

export type DashboardConfig = {
  version: number;
  title: string;
  subtitle: string;
  theme: string;
  docker_urls: Record<string, DockerLinkConfig>;
  nav_order: string[];
};

export type NetworkMode = "internal" | "external";

const CACHE_KEY = "homehub.services.config.v1";
const DOCKER_URLS_KEY = "homehub.docker.urls.v1";
const DASHBOARD_CACHE_KEY = "homehub.dashboard.config.v1";

export async function fetchServicesConfig(): Promise<ServicesConfig> {
  const res = await fetch("/api/config/services");
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const data = (await res.json()) as ServicesConfig;
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}

export async function fetchDashboardConfig(): Promise<DashboardConfig> {
  const res = await fetch("/api/config/dashboard");
  if (!res.ok) throw new Error(`dashboard fetch failed: ${res.status}`);
  const data = (await res.json()) as DashboardConfig;
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  return data;
}

export async function saveDashboardConfig(payload: DashboardConfig): Promise<DashboardConfig> {
  const res = await fetch("/api/config/dashboard", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`dashboard save failed: ${res.status}`);
  const data = (await res.json()) as DashboardConfig;
  localStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify(data));
  return data;
}

export async function saveServicesConfig(payload: ServicesConfig): Promise<ServicesConfig> {
  const res = await fetch("/api/config/services", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
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

export function chooseUrl(item: ServiceItem, mode: NetworkMode): string {
  if (mode === "internal") return item.intranet_url || "";
  return item.extranet_url || "";
}

export function chooseDockerUrl(item: DockerLinkConfig, mode: NetworkMode): string {
  if (mode === "internal") return item.intranet_url || "";
  return item.extranet_url || "";
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

export async function fetchContainers(): Promise<ContainerInfo[]> {
  const res = await fetch("/api/docker/containers");
  if (!res.ok) throw new Error(`docker fetch failed: ${res.status}`);
  return (await res.json()) as ContainerInfo[];
}

export async function fetchContainerStats(): Promise<ContainerStats[]> {
  const res = await fetch("/api/docker/containers/stats");
  if (!res.ok) throw new Error(`docker stats fetch failed: ${res.status}`);
  return (await res.json()) as ContainerStats[];
}

export async function fetchIconSuggestions(url: string): Promise<string[]> {
  const res = await fetch(`/api/icons/suggestions?url=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`icon suggestions failed: ${res.status}`);
  const data = (await res.json()) as { icons: string[] };
  return data.icons || [];
}

export function getLegacyDockerUrls(): Record<string, string> {
  const raw = localStorage.getItem(DOCKER_URLS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}

export function clearLegacyDockerUrls(): void {
  localStorage.removeItem(DOCKER_URLS_KEY);
}
