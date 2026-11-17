<template>
  <InkCard title="丹青设定" subtitle="选择风格、题材和意境方向">
    <div class="toolbox-group">
      <label>国风风格</label>
      <div class="chip-grid">
        <button v-for="item in styles" :key="item.value" :class="{ active: modelStyle === item.value }" @click="modelStyle = item.value">
          {{ item.label }}
        </button>
      </div>
    </div>
    <div class="toolbox-group">
      <label>题材</label>
      <div class="chip-grid">
        <button v-for="item in contents" :key="item.value" :class="{ active: modelContent === item.value }" @click="modelContent = item.value">
          {{ item.label }}
        </button>
      </div>
    </div>
  </InkCard>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import InkCard from '@/components/InkCard.vue'
import type { CreationOption } from '@/types'

const props = defineProps<{ style: string; content: string }>()
const emit = defineEmits<{ 'update:style': [value: string]; 'update:content': [value: string] }>()

const modelStyle = computed({
  get: () => props.style,
  set: (value: string) => emit('update:style', value),
})
const modelContent = computed({
  get: () => props.content,
  set: (value: string) => emit('update:content', value),
})

const styles: CreationOption[] = [
  { label: '水墨写意', value: 'ink' },
  { label: '工笔设色', value: 'gongbi' },
  { label: '宋画雅韵', value: 'song' },
  { label: '敦煌飞天', value: 'dunhuang' },
  { label: '青花瓷意', value: 'bluewhite' },
  { label: '宫廷金绘', value: 'court' },
]

const contents: CreationOption[] = [
  { label: '山水云岚', value: 'landscape' },
  { label: '花鸟草木', value: 'flowers' },
  { label: '鱼跃江河', value: 'fish' },
  { label: '楼阁桥院', value: 'architecture' },
  { label: '人物仕女', value: 'figure' },
  { label: '龙纹瑞兽', value: 'dragon' },
]
</script>
