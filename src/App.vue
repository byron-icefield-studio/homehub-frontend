<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import {
  chooseDockerUrl,
  chooseUrl,
  clearLegacyDockerUrls,
  fetchContainers,
  fetchContainerStats,
  fetchDashboardConfig,
  fetchIconSuggestions,
  fetchServicesConfig,
  fetchSystemStats,
  getCachedServicesConfig,
  getLegacyDockerUrls,
  saveDashboardConfig,
  saveServicesConfig,
  type ContainerInfo,
  type ContainerStats,
  type DashboardConfig,
  type DockerLinkConfig,
  type NetworkMode,
  type ServiceGroup,
  type ServiceItem,
  type SystemStats,
} from "./api";

type NavCard = {
  kind: "docker" | "manual";
  key: string;
  sortKey: string;
  title: string;
  href: string;
  icon: string;
  configured: boolean;
  state?: string;
  containerName?: string;
  serviceId?: string;
  cpuPercent?: number;
  memoryUsageBytes?: number;
  memoryLimitBytes?: number;
  memoryPercent?: number;
  intranetUrl: string;
  extranetUrl: string;
};

type EditorKind = "docker" | "manual" | "";

const groups = ref<ServiceGroup[]>([]);
const system = ref<SystemStats | null>(null);
const containers = ref<ContainerInfo[]>([]);
const containerStats = ref<Record<string, ContainerStats>>({});
const dashboard = ref<DashboardConfig | null>(null);
const dockerError = ref("");
const saving = ref(false);
const savingEditor = ref(false);
const dragKey = ref("");
const flash = reactive({
  visible: false,
  tone: "success" as "success" | "error",
  message: "",
});
const collapsed = reactive({
  system: false,
  services: false,
});
const editor = reactive({
  open: false,
  mode: "create" as "create" | "edit",
  kind: "" as EditorKind,
  key: "",
  id: "",
  name: "",
  intranet_url: "",
  extranet_url: "",
  icon: "",
  iconSuggestions: [] as string[],
  loadingIcons: false,
});
let refreshTimer: number | null = null;
let flashTimer: number | null = null;
const networkMode = ref<NetworkMode>("internal");
const NETWORK_MODE_KEY = "homehub.network.mode.v1";

const serviceGroups = computed(() => groups.value.filter((group) => group.services.length > 0));
const cpuCores = computed(() => system.value?.cpu_percents ?? []);
const statCards = computed(() => {
  if (!system.value) return [];
  return [
    {
      label: "内存",
      value: system.value.memory_percent,
      tone: usageTone(system.value.memory_percent),
      suffix: "%",
      detail: `${formatBytes(system.value.memory_used_bytes)} / ${formatBytes(system.value.memory_total_bytes)}`,
    },
    {
      label: "磁盘",
      value: system.value.disk_percent,
      tone: usageTone(system.value.disk_percent),
      suffix: "%",
      detail: `${formatBytes(system.value.disk_used_bytes)} / ${formatBytes(system.value.disk_total_bytes)}`,
    },
  ];
});

const navCards = computed<NavCard[]>(() => {
  const cards: NavCard[] = [];

  for (const container of containers.value) {
    const config = dockerConfig(container.name);
    const stats = containerStats.value[container.name];
    cards.push({
      kind: "docker",
      key: container.id,
      sortKey: `docker:${container.name}`,
      title: config?.name || container.name,
      href: config ? chooseDockerUrl(config, networkMode.value) : "",
      icon: config?.icon || "",
      configured: Boolean(config && (config.intranet_url || config.extranet_url)),
      state: container.state,
      containerName: container.name,
      cpuPercent: stats?.cpu_percent ?? 0,
      memoryUsageBytes: stats?.memory_usage_bytes ?? 0,
      memoryLimitBytes: stats?.memory_limit_bytes ?? 0,
      memoryPercent: stats?.memory_percent ?? 0,
      intranetUrl: config?.intranet_url || "",
      extranetUrl: config?.extranet_url || "",
    });
  }

  for (const group of serviceGroups.value) {
    for (const item of group.services) {
      cards.push({
        kind: "manual",
        key: item.id,
        sortKey: `manual:${item.id}`,
        title: item.name,
        href: chooseUrl(item, networkMode.value),
        icon: item.icon || "",
        configured: Boolean(item.intranet_url || item.extranet_url),
        serviceId: item.id,
        intranetUrl: item.intranet_url || "",
        extranetUrl: item.extranet_url || "",
      });
    }
  }

  const order = dashboard.value?.nav_order ?? [];
  const orderIndex = new Map(order.map((key, index) => [key, index]));
  return cards
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const aIndex = orderIndex.get(a.card.sortKey);
      const bIndex = orderIndex.get(b.card.sortKey);
      if (aIndex !== undefined && bIndex !== undefined) return aIndex - bIndex;
      if (aIndex !== undefined) return -1;
      if (bIndex !== undefined) return 1;
      return a.index - b.index;
    })
    .map((entry) => entry.card);
});

function defaultDashboard(): DashboardConfig {
  return {
    version: 1,
    title: "HomeHub Dashboard",
    subtitle: "HomeHub 家庭服务中心",
    theme: "light",
    docker_urls: {},
    nav_order: [],
  };
}

function currentDashboard(): DashboardConfig {
  return dashboard.value ?? defaultDashboard();
}

function usageTone(value: number): string {
  if (value >= 85) return "danger";
  if (value >= 65) return "warn";
  return "healthy";
}

function usageStyle(value: number, tone: string): Record<string, string> {
  const palette: Record<string, string> = {
    healthy: "#2ea043",
    warn: "#d29922",
    danger: "#f85149",
  };

  return {
    background: `conic-gradient(${palette[tone]} 0deg ${value * 3.6}deg, var(--meter-track) ${value * 3.6}deg 360deg)`,
  };
}

function navWaterlineStyle(card: NavCard): Record<string, string> {
  if (card.kind !== "docker") return {};
  const coreCount = Math.max(cpuCores.value.length, 1);
  const normalizedCpu = (card.cpuPercent ?? 0) / coreCount;
  const cpu = Math.max(0, Math.min(normalizedCpu, 100));
  const memory = Math.max(0, Math.min(card.memoryPercent ?? 0, 100));
  const level = Math.max(cpu, memory);
  const tone = usageTone(level);
  const palette: Record<string, string> = {
    healthy: "46, 160, 67",
    warn: "210, 153, 34",
    danger: "248, 81, 73",
  };
  return {
    "--waterline-level": `${100 - level}%`,
    "--waterline-rgb": palette[tone],
  };
}

function statusTone(state: string): string {
  if (state === "running") return "running";
  if (state === "exited" || state === "dead") return "stopped";
  return "other";
}

function formatBytes(bytes: number): string {
  const units = ["B", "K", "M", "G", "T", "P", "E"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  if (unitIndex === 0) return `${Math.round(value)}${units[unitIndex]}`;
  if (value >= 100) return `${value.toFixed(0)}${units[unitIndex]}`;
  if (value >= 10) return `${value.toFixed(1)}${units[unitIndex]}`;
  return `${value.toFixed(2)}${units[unitIndex]}`;
}

function formatContainerMemory(usedBytes?: number, limitBytes?: number): string {
  const used = formatBytes(usedBytes ?? 0);
  if (!limitBytes) return used;
  return `${used} / ${formatBytes(limitBytes)}`;
}

function dockerConfig(name: string): DockerLinkConfig | null {
  return currentDashboard().docker_urls[name] ?? null;
}

function toggleSection(section: keyof typeof collapsed) {
  collapsed[section] = !collapsed[section];
}

function setNetworkMode(mode: NetworkMode) {
  networkMode.value = mode;
  localStorage.setItem(NETWORK_MODE_KEY, mode);
}

function missingAddressMessage(card: NavCard): string {
  const hasIntranet = Boolean(card.intranetUrl);
  const hasExtranet = Boolean(card.extranetUrl);
  if (!hasIntranet && !hasExtranet) return "未配置内网/外网地址";
  if (networkMode.value === "internal" && !hasIntranet && hasExtranet) return "当前是内网模式，此服务只有外网地址";
  if (networkMode.value === "external" && !hasExtranet && hasIntranet) return "当前是外网模式，此服务只有内网地址";
  return "当前环境没有可用地址";
}

function openCard(card: NavCard) {
  if (card.href) {
    window.open(card.href, "_blank", "noopener,noreferrer");
    return;
  }
  showFlash(missingAddressMessage(card), "error");
}

function showFlash(message: string, tone: "success" | "error") {
  flash.visible = true;
  flash.tone = tone;
  flash.message = message;
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
  flashTimer = window.setTimeout(() => {
    flash.visible = false;
    flash.message = "";
  }, 2200);
}

async function loadData() {
  try {
    const config = await fetchServicesConfig();
    groups.value = config.groups;
  } catch {
    const cached = getCachedServicesConfig();
    groups.value = cached?.groups ?? [];
  }

  system.value = await fetchSystemStats();

  try {
    const config = await fetchDashboardConfig();
    dashboard.value = config;

    const legacyUrls = getLegacyDockerUrls();
    if (Object.keys(legacyUrls).length > 0) {
      const merged = { ...config.docker_urls };
      for (const [name, url] of Object.entries(legacyUrls)) {
        if (!merged[name]) {
          merged[name] = { name: "", intranet_url: url, extranet_url: "", icon: "" };
        }
      }
      dashboard.value = await saveDashboardConfig({ ...config, docker_urls: merged });
      clearLegacyDockerUrls();
    }
  } catch {
    dashboard.value = defaultDashboard();
  }
}

async function loadDocker() {
  try {
    containers.value = await fetchContainers();
    dockerError.value = "";
    void loadDockerStats();
  } catch (error) {
    dockerError.value = error instanceof Error ? error.message : "docker data unavailable";
  }
}

async function loadDockerStats() {
  try {
    const nextStats = await fetchContainerStats();
    containerStats.value = Object.fromEntries(nextStats.map((item) => [item.name, item]));
  } catch {
    containerStats.value = {};
  }
}

async function refreshAll() {
  await Promise.all([loadData(), loadDocker()]);
}

function openDockerEditor(containerName: string) {
  const config = dockerConfig(containerName) ?? { name: "", intranet_url: "", extranet_url: "", icon: "" };
  editor.open = true;
  editor.mode = "edit";
  editor.kind = "docker";
  editor.key = containerName;
  editor.id = "";
  editor.name = config.name;
  editor.intranet_url = config.intranet_url;
  editor.extranet_url = config.extranet_url;
  editor.icon = config.icon;
  editor.iconSuggestions = [];
}

function openManualEditor(item?: ServiceItem) {
  editor.open = true;
  editor.mode = item ? "edit" : "create";
  editor.kind = "manual";
  editor.key = "";
  editor.id = item?.id || `manual-${Date.now()}`;
  editor.name = item?.name || "";
  editor.intranet_url = item?.intranet_url || "";
  editor.extranet_url = item?.extranet_url || "";
  editor.icon = item?.icon || "";
  editor.iconSuggestions = [];
}

function closeEditor() {
  editor.open = false;
  editor.mode = "create";
  editor.kind = "";
  editor.key = "";
  editor.id = "";
  editor.name = "";
  editor.intranet_url = "";
  editor.extranet_url = "";
  editor.icon = "";
  editor.iconSuggestions = [];
  editor.loadingIcons = false;
}

async function loadIconOptions() {
  const targetUrl = editor.intranet_url.trim() || editor.extranet_url.trim();
  if (!targetUrl) return;
  editor.loadingIcons = true;
  try {
    editor.iconSuggestions = await fetchIconSuggestions(targetUrl);
  } catch {
    editor.iconSuggestions = [];
  } finally {
    editor.loadingIcons = false;
  }
}

async function saveEditor() {
  if (!editor.kind) return;

  if (editor.kind === "docker") {
    const current = currentDashboard();
    savingEditor.value = true;
    try {
      dashboard.value = await saveDashboardConfig({
        ...current,
        docker_urls: {
          ...current.docker_urls,
          [editor.key]: {
            name: editor.name.trim(),
            intranet_url: editor.intranet_url.trim(),
            extranet_url: editor.extranet_url.trim(),
            icon: editor.icon.trim(),
          },
        },
      });
      showFlash("保存成功", "success");
      closeEditor();
    } catch (error) {
      showFlash(error instanceof Error ? error.message : "保存失败", "error");
    } finally {
      savingEditor.value = false;
    }
    return;
  }

  if (!editor.intranet_url.trim()) {
    showFlash("内网地址不能为空", "error");
    return;
  }
  saving.value = true;
  try {
    const nextGroups = [...groups.value];
    const groupIndex = nextGroups.findIndex((group) => group.id === "manual");
    const fallbackName = editor.intranet_url.trim().replace(/^https?:\/\//, "").replace(/\/$/, "") || "未命名链接";
    const nextService: ServiceItem = {
      id: editor.id,
      name: editor.name.trim() || fallbackName,
      intranet_url: editor.intranet_url.trim(),
      extranet_url: editor.extranet_url.trim(),
      open_mode: "auto",
      icon: editor.icon.trim(),
    };

    if (groupIndex >= 0) {
      const foundIndex = nextGroups[groupIndex].services.findIndex((item) => item.id === editor.id);
      const services = [...nextGroups[groupIndex].services];
      if (foundIndex >= 0) {
        services[foundIndex] = nextService;
      } else {
        services.push(nextService);
      }
      nextGroups[groupIndex] = { ...nextGroups[groupIndex], services };
    } else {
      nextGroups.unshift({
        id: "manual",
        name: "手动导航",
        services: [nextService],
      });
    }

    const saved = await saveServicesConfig({ version: 1, groups: nextGroups });
    groups.value = saved.groups;

    const current = currentDashboard();
    const sortKey = `manual:${editor.id}`;
    if (!current.nav_order.includes(sortKey)) {
      dashboard.value = await saveDashboardConfig({
        ...current,
        nav_order: [...current.nav_order, sortKey],
      });
    }
    showFlash("保存成功", "success");
    closeEditor();
  } catch (error) {
    showFlash(error instanceof Error ? error.message : "保存失败", "error");
  } finally {
    saving.value = false;
  }
}

async function saveNavOrder(nextOrder: string[]) {
  const current = currentDashboard();
  dashboard.value = await saveDashboardConfig({
    ...current,
    nav_order: nextOrder,
  });
}

function onDragStart(sortKey: string) {
  dragKey.value = sortKey;
}

function onDrop(targetKey: string) {
  if (!dragKey.value || dragKey.value === targetKey) return;
  const order = navCards.value.map((card) => card.sortKey);
  const from = order.indexOf(dragKey.value);
  const to = order.indexOf(targetKey);
  if (from < 0 || to < 0) return;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  void saveNavOrder(next);
  dragKey.value = "";
}

onMounted(async () => {
  const savedMode = localStorage.getItem(NETWORK_MODE_KEY);
  if (savedMode === "internal" || savedMode === "external") {
    networkMode.value = savedMode;
  }
  await refreshAll();
  refreshTimer = window.setInterval(() => {
    void fetchSystemStats().then((data) => (system.value = data));
    void loadDocker();
  }, 5000);
});

onBeforeUnmount(() => {
  if (refreshTimer !== null) {
    window.clearInterval(refreshTimer);
  }
  if (flashTimer !== null) {
    window.clearTimeout(flashTimer);
  }
});
</script>

<template>
  <main class="page">
    <div v-if="flash.visible" class="app-flash" :data-tone="flash.tone">{{ flash.message }}</div>
    <div class="env-switcher" role="group" aria-label="网络环境切换">
      <button type="button" class="env-btn" :class="{ active: networkMode === 'internal' }" @click="setNetworkMode('internal')">
        内网
      </button>
      <button type="button" class="env-btn" :class="{ active: networkMode === 'external' }" @click="setNetworkMode('external')">
        外网
      </button>
    </div>

    <header class="hero">
      <div class="brand-bar">
        <img class="brand-logo" src="/logo.svg" alt="HomeHub logo" />
      </div>
    </header>

    <section class="module">
      <div class="module-head">
        <button class="section-toggle" type="button" @click="toggleSection('system')">
          <span>服务器数据</span>
          <span class="section-toggle-meta">
            <span class="section-toggle-icon">{{ collapsed.system ? "⌄" : "⌃" }}</span>
          </span>
        </button>
      </div>

      <div v-if="!collapsed.system">
        <div class="stat-grid" v-if="system">
          <article class="cpu-chip-card">
            <div class="cpu-chip-head">
              <div>
                <label>CPU</label>
                <strong>{{ system.cpu_percent.toFixed(0) }}%</strong>
              </div>
              <span class="module-note">{{ cpuCores.length }} 核</span>
            </div>
            <div class="cpu-chip-board">
              <div v-for="(value, index) in cpuCores" :key="index" class="cpu-core-tile" :data-tone="usageTone(value)">
                <span>C{{ index + 1 }}</span>
                <strong>{{ value.toFixed(0) }}%</strong>
              </div>
            </div>
          </article>

          <article v-for="item in statCards" :key="item.label" class="stat-card">
            <div class="meter" :style="usageStyle(item.value, item.tone)">
              <div class="meter-inner">
                <strong>{{ item.value.toFixed(0) }}{{ item.suffix }}</strong>
              </div>
            </div>
            <label>{{ item.label }}</label>
            <span class="stat-detail">{{ item.detail }}</span>
          </article>
        </div>
      </div>

    </section>

    <section class="module">
      <div class="module-head">
        <div class="module-head-inline">
          <div class="section-title-row">
            <button class="section-toggle section-toggle-title" type="button" @click="toggleSection('services')">
              <span>服务导航</span>
            </button>
            <button v-if="!collapsed.services" class="inline-add-button" type="button" @click="openManualEditor()">+</button>
          </div>
          <button class="section-toggle section-toggle-arrow" type="button" @click="toggleSection('services')">
            <span class="section-toggle-meta">
              <span class="section-toggle-icon">{{ collapsed.services ? "⌄" : "⌃" }}</span>
            </span>
          </button>
        </div>
      </div>

      <div v-if="dockerError && !collapsed.services" class="module-note module-error">{{ dockerError }}</div>

      <div v-if="!collapsed.services" class="nav-grid">
        <article
          v-for="card in navCards"
          :key="card.key"
          class="nav-card"
          :class="{ 'is-docker-card': card.kind === 'docker' }"
          :style="navWaterlineStyle(card)"
          draggable="true"
          @dragstart="onDragStart(card.sortKey)"
          @dragover.prevent
          @drop="onDrop(card.sortKey)"
        >
          <a v-if="card.href" class="nav-main" :href="card.href" target="_blank" rel="noreferrer" :class="{ 'is-muted': !card.configured }" @click.prevent="openCard(card)">
            <div class="nav-layout">
              <div class="nav-visual">
                <img v-if="card.icon" class="nav-icon" :src="card.icon" alt="" />
                <span v-else-if="card.kind === 'docker'" class="nav-fallback-label">Docker</span>
                <svg
                  v-else
                  class="link-mark large"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
                </svg>
              </div>
              <div class="nav-content">
                <div class="nav-title-row">
                  <strong class="nav-title">{{ card.title }}</strong>
                  <svg
                    v-if="card.kind === 'manual'"
                    class="link-badge"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
                  </svg>
                </div>
                <div class="nav-subline">{{ card.href }}</div>
                <div v-if="card.kind === 'docker'" class="nav-stats">
                  <span>CPU {{ (card.cpuPercent ?? 0).toFixed(1) }}%</span>
                  <span>MEM {{ formatContainerMemory(card.memoryUsageBytes, card.memoryLimitBytes) }}</span>
                </div>
              </div>
            </div>
          </a>

          <div v-else class="nav-main is-muted nav-clickable" role="button" tabindex="0" @click="openCard(card)" @keydown.enter.prevent="openCard(card)" @keydown.space.prevent="openCard(card)">
            <div class="nav-layout">
              <div class="nav-visual">
                <img v-if="card.icon" class="nav-icon" :src="card.icon" alt="" />
                <span v-else-if="card.kind === 'docker'" class="nav-fallback-label">Docker</span>
                <svg
                  v-else
                  class="link-mark large"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                  <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
                </svg>
              </div>
              <div class="nav-content">
                <div class="nav-title-row">
                  <strong class="nav-title">{{ card.title }}</strong>
                  <svg
                    v-if="card.kind === 'manual'"
                    class="link-badge"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 4" />
                    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
                  </svg>
                </div>
                <div v-if="card.href" class="nav-subline">{{ card.href }}</div>
                <div v-if="card.kind === 'docker'" class="nav-stats">
                  <span>CPU {{ (card.cpuPercent ?? 0).toFixed(1) }}%</span>
                  <span>MEM {{ formatContainerMemory(card.memoryUsageBytes, card.memoryLimitBytes) }}</span>
                </div>
              </div>
            </div>
          </div>

          <span v-if="card.kind === 'docker'" class="status-dot nav-status-dot" :class="statusTone(card.state || '')"></span>
          <button
            class="icon-button"
            type="button"
            @click="card.kind === 'docker' ? openDockerEditor(card.containerName || '') : openManualEditor(serviceGroups.flatMap(group => group.services).find(item => item.id === card.serviceId))"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
            </svg>
          </button>
        </article>
      </div>

    </section>

    <div v-if="editor.open" class="modal-backdrop" @click.self="closeEditor">
      <div class="modal">
        <div class="module-head">
          <h3>
            {{
              editor.kind === 'docker'
                ? '编辑容器服务'
                : editor.mode === 'create'
                  ? '新增链接服务'
                  : '编辑链接服务'
            }}
          </h3>
          <button class="icon-button plain" type="button" @click="closeEditor">x</button>
        </div>

        <div class="modal-form">
          <label class="field-row">
            <span class="field-label">内网地址</span>
            <input v-model="editor.intranet_url" placeholder="默认访问地址" />
          </label>
          <label class="field-row">
            <span class="field-label">外网地址</span>
            <input v-model="editor.extranet_url" placeholder="可空" />
          </label>
          <label class="field-row">
            <span class="field-label">名称</span>
            <input
              v-model="editor.name"
              :placeholder="editor.kind === 'docker' ? '可空，默认使用容器名称' : '可空，默认使用地址生成名称'"
            />
          </label>
        </div>

        <div class="icon-tools">
          <button class="submit-button secondary" type="button" @click="loadIconOptions" :disabled="editor.loadingIcons">
            {{ editor.loadingIcons ? '拉取中...' : '拉取网页图标' }}
          </button>
          <div v-if="editor.icon" class="icon-current">
            <img :src="editor.icon" alt="" />
            <span>已选图标</span>
          </div>
        </div>

        <div v-if="editor.iconSuggestions.length" class="icon-picker">
          <button
            v-for="icon in editor.iconSuggestions"
            :key="icon"
            class="icon-choice"
            :class="{ active: editor.icon === icon }"
            type="button"
            @click="editor.icon = icon"
          >
            <img :src="icon" alt="" />
          </button>
        </div>

        <div class="modal-actions">
          <button class="submit-button" type="button" @click="saveEditor" :disabled="saving || savingEditor">
            {{ saving || savingEditor ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </main>
</template>
