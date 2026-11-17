<template>
  <div class="gallery-grid">
    <article v-for="item in items" :key="item.id" class="artwork-tile">
      <img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.prompt || '画廊作品'" />
      <div v-else class="empty-preview">无预览</div>
      <div class="artwork-meta">
        <strong>{{ item.style || '国风作品' }}</strong>
        <span>{{ item.content || '未分类' }} · {{ formatDate(item.createdAt) }}</span>
        <p>{{ item.prompt || '未记录提示词' }}</p>
        <button v-if="removable" @click="$emit('remove', item.id)">删除</button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import type { Artwork } from '@/types'
import { formatDate } from '@/utils/artwork'

defineProps<{ items: Artwork[]; removable?: boolean }>()
defineEmits<{ remove: [id: string] }>()
</script>
