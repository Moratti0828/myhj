<template>
  <div class="admin-grid">
    <div v-for="card in cards" :key="card.label" class="metric-card">
      <span>{{ card.label }}</span>
      <strong>{{ card.value }}</strong>
    </div>
  </div>
  <el-table :data="overview.users" class="ink-table">
    <el-table-column prop="username" label="用户" />
    <el-table-column prop="role" label="角色" width="100" />
    <el-table-column prop="artwork_count" label="作品数" width="110" />
    <el-table-column prop="last_artwork_at" label="最近创作" />
  </el-table>
  <el-table :data="overview.type_counts" class="ink-table">
    <el-table-column prop="username" label="用户" />
    <el-table-column prop="content_type" label="题材" />
    <el-table-column prop="count" label="数量" width="100" />
  </el-table>
</template>

<script setup lang="ts">
import { ElTable, ElTableColumn } from 'element-plus'
import 'element-plus/es/components/table/style/css'
import 'element-plus/es/components/table-column/style/css'
import { computed } from 'vue'
import type { AdminOverview } from '@/types'

const props = defineProps<{ overview: AdminOverview }>()
const cards = computed(() => [
  { label: '用户总数', value: props.overview.summary.total_users },
  { label: '作品总数', value: props.overview.summary.total_artworks },
  { label: '活跃用户', value: props.overview.summary.active_users },
  { label: '题材记录', value: props.overview.summary.total_type_rows },
])
</script>
