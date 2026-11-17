<template>
  <header class="studio-hero">
    <div class="studio-hero-copy"><span class="studio-kicker">{{ kicker }}</span><h1>{{ title }}</h1><p>{{ description }}</p></div>
    <div class="studio-hero-steps" aria-label="创作流程"><span v-for="step in steps" :key="step">{{ step }}</span></div>
  </header>
</template>
<script setup lang="ts">
defineProps<{ kicker: string; title: string; description: string; steps: string[] }>()
</script>
<style scoped>
.studio-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; margin-bottom: 22px; padding: 20px 26px; overflow: hidden; box-sizing: border-box; border: 1px solid #8b735524; border-radius: 18px; background: linear-gradient(105deg,#12100deb,#3e3325bd),url('/assets/shanshui_bg.png') center 38% / cover; color: #fffaf0; box-shadow: 0 18px 44px #0d121c24; }
.studio-hero-copy { min-width: 0; }
.studio-kicker { display: inline-flex; margin-bottom: 6px; color: #d7bd79; font-weight: 900; font-size: 14px; }
.studio-hero h1 { margin: 0 0 8px; font-family: 'Ma Shan Zheng','Noto Serif SC',serif; font-size: var(--page-heading-size); line-height: var(--page-heading-line-height); overflow-wrap: anywhere; }
.studio-hero p { max-width: 680px; margin: 0; color: #fffaf0c7; font-size: 14px; line-height: 1.7; }
.studio-hero-steps { display: flex; gap: 10px; flex-shrink: 0; }
.studio-hero-steps span { display: inline-flex; align-items: center; justify-content: center; min-width: 64px; min-height: 36px; padding: 0 8px; border: 1px solid #fff3; border-radius: 999px; color: #fffaf0db; background: #ffffff14; box-sizing: border-box; }
@media(max-width: 900px) { .studio-hero { align-items: flex-start; flex-direction: column; } .studio-hero-steps { flex-wrap: wrap; } }
</style>
