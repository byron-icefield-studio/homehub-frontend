<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { chooseUrl, fetchServicesConfig, fetchSystemStats, getCachedServicesConfig, type ServiceGroup, type SystemStats } from "./api";

const groups = ref<ServiceGroup[]>([]);
const source = ref<"api" | "cache" | "empty">("empty");
const system = ref<SystemStats | null>(null);

const totalServices = computed(() => groups.value.reduce((sum, g) => sum + g.services.length, 0));

async function loadData() {
  try {
    const config = await fetchServicesConfig();
    groups.value = config.groups;
    source.value = "api";
  } catch {
    const cached = getCachedServicesConfig();
    if (cached) {
      groups.value = cached.groups;
      source.value = "cache";
    } else {
      groups.value = [];
      source.value = "empty";
    }
  }

  system.value = await fetchSystemStats();
}

onMounted(loadData);
</script>

<template>
  <main class="page">
    <header class="hero">
      <div>
        <h1>HomeHub Dashboard</h1>
        <p>家庭服务、导航与概览</p>
      </div>
      <div class="badges">
        <span class="badge">服务 {{ totalServices }}</span>
        <span class="badge" v-if="source === 'api'">在线数据</span>
        <span class="badge warn" v-else-if="source === 'cache'">缓存数据</span>
        <span class="badge danger" v-else>暂无配置</span>
      </div>
    </header>

    <section class="system" v-if="system">
      <div class="metric"><label>CPU</label><b>{{ system.cpu_percent.toFixed(1) }}%</b></div>
      <div class="metric"><label>内存</label><b>{{ system.memory_percent.toFixed(1) }}%</b></div>
      <div class="metric"><label>磁盘</label><b>{{ system.disk_percent.toFixed(1) }}%</b></div>
      <div class="metric"><label>负载</label><b>{{ system.load_avg.join(' / ') }}</b></div>
    </section>

    <section v-for="group in groups" :key="group.id" class="group">
      <h2>{{ group.name }}</h2>
      <div class="grid">
        <a
          v-for="item in group.services"
          :key="item.id"
          class="card"
          :href="chooseUrl(item)"
          target="_blank"
          rel="noreferrer"
        >
          <div class="title">{{ item.name }}</div>
          <div class="url">{{ chooseUrl(item) }}</div>
          <div class="tags" v-if="item.tags?.length">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
        </a>
      </div>
    </section>
  </main>
</template>
