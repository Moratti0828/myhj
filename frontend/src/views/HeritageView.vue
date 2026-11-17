<template>
  <section class="heritage-culture-page">
    <div class="heritage-title-block">
      <h1>非遗文化 · 传承千年</h1>
      <p class="heritage-intro">从作品中认识传统艺术，再把你的观察变成创作灵感。</p>
      <label class="heritage-search">
        <span>查找主题</span>
        <input v-model="search" type="search" placeholder="搜索书法、剪纸、青花、刺绣…" />
      </label>
      <p class="heritage-count" aria-live="polite">共 {{ filteredItems.length }} 个主题</p>
    </div>
    <div class="heritage-card-grid">
      <RouterLink v-for="item in filteredItems" :key="item.type" class="heritage-culture-card" :to="`/heritage/${item.type}`">
        <img :src="item.image" :alt="item.title" />
        <div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.description }}</p>
        </div>
      </RouterLink>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { heritageKnowledge } from '@/data/heritageKnowledge'
const search = ref('')
const heritageItems = [
  {
    type: 'calligraphy',
    title: '中国书法',
    description: '汉字书写的艺术，涵盖楷书、行书、草书等书体',
    image: '/image/非遗文化/中国书法.jpg',
  },
  {
    type: 'ink',
    title: '中国画',
    description: '以毛笔为主，题材分为人物、山水、花鸟',
    image: '/image/非遗文化/中国画.png',
  },
  {
    type: 'embroidery',
    title: '刺绣',
    description: '苏绣、湘绣、蜀绣、粤绣四大名绣',
    image: '/image/非遗文化/中国刺绣.png',
  },
  {
    type: 'papercut',
    title: '剪纸',
    description: '民间传统装饰艺术，逢年过节必备',
    image: '/image/非遗文化/剪纸.png',
  },
  {
    type: 'ceramics',
    title: '陶瓷艺术',
    description: '景德镇青花瓷、龙泉青瓷等名扬海外',
    image: '/image/非遗文化/陶瓷艺术.png',
  },
  {
    type: 'lantern',
    title: '花灯',
    description: '传统照明与装饰艺术，象征团圆美满',
    image: '/image/非遗文化/花灯.png',
  },
  {
    type: 'knot',
    title: '中国结',
    description: '用绳线编织的装饰品，寓意吉祥如意',
    image: '/image/非遗文化/中国结.png',
  },
  {
    type: 'mask',
    title: '脸谱',
    description: '京剧脸谱，展现人物性格的绘画艺术',
    image: '/image/非遗文化/脸谱.png',
  },
]
const filteredItems = computed(() => {
  const keyword = search.value.trim().toLowerCase()
  return heritageItems.filter(item => `${item.title} ${item.description} ${heritageKnowledge[item.type].overview} ${heritageKnowledge[item.type].branches.map(branch => branch.title + branch.text).join(" ")} ${heritageKnowledge[item.type].terms.map(term => term.name).join(" ")}`.toLowerCase().includes(keyword))
})
</script>

<style scoped>
.heritage-intro { margin: 16px 0 24px; color: #53564f; line-height: 1.8; }
.heritage-search { display: flex; align-items: center; gap: 14px; max-width: 560px; margin: 0 auto; padding: 12px 18px; background: #fffdf8; border: 1px solid #c8c0ae; border-radius: 12px; }
.heritage-search span { flex-shrink: 0; color: #45483f; font-size: 14px; }
.heritage-search input { width: 100%; min-width: 0; border: 0; background: transparent; color: #222; font: inherit; }
.heritage-search:focus-within { outline: 2px solid #8a392e; outline-offset: 3px; }
.heritage-search input:focus { outline: none; }
.heritage-count, .heritage-empty { margin: 18px 0; text-align: center; color: #53564f; }
</style>
