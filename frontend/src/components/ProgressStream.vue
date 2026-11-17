<template>
  <div class="progress-stream">
    <div v-if="!items.length" class="stream-empty">等待墨色流转...</div>
    <div v-for="(item, index) in items" :key="`${item.stage}-${index}`" class="stream-line">
      <span class="stream-dot" :class="{ done: item.stage === 'done', error: item.stage === 'error', active: isActive(item.stage) }"></span>
      <span>{{ item.message || stageLabel(item.stage) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SseMessage } from '@/types'

defineProps<{ items: SseMessage[] }>()

function isActive(stage: string) {
  return ['submit', 'polling', 'queued', 'running', 'caption_start', 'image_start', 'video_caption'].includes(stage)
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = {
    submit: '正在提交任务',
    queued: '第三方模型排队中',
    running: '模型正在生成',
    polling: '正在等待生成结果',
    caption_start: '正在感知草图意境',
    caption_done: '草图意境识别完成',
    image_start: '丹青模型正在起笔',
    video_caption: '正在识别首帧画面',
    video_caption_fallback: '首帧识别降级',
    done: '生成完成',
    error: '生成遇到阻碍',
  }
  return labels[stage] || stage
}
</script>
