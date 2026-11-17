<template>
  <button class="ink-button" :class="[`is-${size}`, { 'is-plain': plain }]" type="button">
    <slot />
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: 'small' | 'medium' | 'large'; plain?: boolean }>(), {
  size: 'medium',
  plain: false,
})
</script>
