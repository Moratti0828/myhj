<template>
  <section class="ink-card">
    <div v-if="title || subtitle" class="ink-card__head">
      <span v-if="kicker" class="kicker">{{ kicker }}</span>
      <h2 v-if="title">{{ title }}</h2>
      <p v-if="subtitle">{{ subtitle }}</p>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
defineProps<{ title?: string; subtitle?: string; kicker?: string }>()
</script>
