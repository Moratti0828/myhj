<template>
  <section class="page-stack">
    <InkCard title="管理员看板" subtitle="用户、作品与题材分布概览">
      <InkButton size="small" plain @click="load">刷新数据</InkButton>
      <p v-if="error" class="error-text">{{ error }}</p>
      <AdminDashboard v-if="overview" :overview="overview" />
    </InkCard>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AdminDashboard from '@/components/AdminDashboard.vue'
import InkButton from '@/components/InkButton.vue'
import InkCard from '@/components/InkCard.vue'
import * as api from '@/api'
import type { AdminOverview } from '@/types'

const overview = ref<AdminOverview | null>(null)
const error = ref('')

async function load() {
  error.value = ''
  try {
    overview.value = await api.getAdminOverview()
  } catch (err) {
    error.value = err instanceof Error ? err.message : '管理员数据加载失败'
  }
}

onMounted(load)
</script>
