<template>
  <section class="animation-page">
    <nav class="animation-mode-tabs" aria-label="动画创作方式">
      <button type="button" :aria-pressed="mode === 'motion'" @click="mode = 'motion'">原作微动</button>
      <button type="button" :aria-pressed="mode === 'story'" @click="mode = 'story'">叙事短片</button>
    </nav>
    <VideoStudio v-if="mode === 'motion'" />
    <NarrativeStudio v-else />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import VideoStudio from '@/components/VideoStudio.vue'
import NarrativeStudio from '@/components/NarrativeStudio.vue'
const route = useRoute()
const router = useRouter()
const mode = computed({
  get: () => route.query.mode === 'story' ? 'story' : 'motion',
  set: (value: string) => { void router.replace({ query: { ...route.query, mode: value } }) }
})
</script>

<style scoped>
.animation-mode-tabs { display: flex; gap: 10px; margin: 0 0 18px; }
.animation-mode-tabs button { padding: 12px 26px; border: 1px solid #cfc1a2; border-radius: 24px; background: #fffaf0; color: #66543b; font: inherit; cursor: pointer; }
.animation-mode-tabs button[aria-pressed="true"] { background: #26231d; color: #f8edd5; }
</style>
