<template>
  <section class="gallery-museum-page">
    <div class="gallery-curator-strip">
      <div>
        <span>私人馆藏</span>
        <strong>把每一次生成、成片和灵感都收束成一间会呼吸的画廊。</strong>
      </div>
      <RouterLink to="/creation">去创作</RouterLink>
    </div>

    <div class="gallery-hero-panel">
      <h1>我的画廊</h1>
      <div class="gallery-stats-row">
        <article v-for="stat in statsCards" :key="stat.value" class="gallery-stat-card">
          <img :src="stat.icon" :alt="stat.label" />
          <strong>{{ stat.count }}</strong>
          <span>{{ stat.label }}</span>
        </article>
      </div>
      <div class="gallery-filter-bar">
        <div class="filter-group">
          <span>筛选：</span>
          <button v-for="item in filters" :key="item.value" :class="{ active: currentFilter === item.value }" @click="currentFilter = item.value">
            {{ item.label }}
          </button>
        </div>
        <div class="sort-group">
          <span>排序：</span>
          <button :class="{ active: sortOrder === 'newest' }" @click="sortOrder = 'newest'">最新</button>
          <button :class="{ active: sortOrder === 'oldest' }" @click="sortOrder = 'oldest'">最早</button>
        </div>
      </div>
    </div>

    <div class="gallery-result-area">
      <div v-if="gallery.loading" class="gallery-state">正在铺展画卷...</div>
      <div v-else-if="gallery.error || !filteredArtworks.length" class="gallery-empty-curated">
        <div class="empty-scroll-preview">
          <article v-for="item in emptyShowcase" :key="item.title">
            <img :src="item.image" :alt="item.title" />
            <span>{{ item.title }}</span>
          </article>
        </div>
        <div class="empty-copy">
          <span>{{ gallery.error ? '需要登录' : '馆藏待启' }}</span>
          <strong>{{ gallery.error ? '登录后开启你的私人画廊。' : '暂无作品，但展墙已经备好。' }}</strong>
          <p>{{ gallery.error ? '当前还不能读取个人馆藏。登录后，画作、成片和提示词都会在这里统一陈列。' : '从创作页生成画作，或在 AIGC 动画工坊制作成片，保存后会在这里按题材、时间与风格归档。' }}</p>
          <div class="empty-actions">
            <RouterLink :to="gallery.error ? '/login' : '/creation'">{{ gallery.error ? '去登录' : '开始创作' }}</RouterLink>
            <RouterLink to="/animation">制作动画</RouterLink>
          </div>
        </div>
      </div>
      <GalleryGrid v-else :items="filteredArtworks" removable @remove="removeArtwork" />
    </div>

    <div class="gallery-tips-panel">
      <h2>💡 创作提示</h2>
      <ul>
        <li>选择绘画内容（如山水、花鸟）和艺术风格（水墨、敦煌等）</li>
        <li>在画布上绘制或导入简单草图</li>
        <li>点击“妙笔生花”让 AI 帮您完善作品</li>
        <li>满意后点击“归档”保存到我的画廊</li>
      </ul>
    </div>

    <div class="gallery-inspiration-wall">
      <article v-for="item in inspirationWall" :key="item.title">
        <img :src="item.image" :alt="item.title" />
        <div>
          <strong>{{ item.title }}</strong>
          <span>{{ item.text }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import GalleryGrid from '@/components/GalleryGrid.vue'
import { useGalleryStore } from '@/stores/gallery'
import { useAuthStore } from '@/stores/auth'

const gallery = useGalleryStore()
const auth = useAuthStore()
const currentFilter = ref('all')
const sortOrder = ref<'newest' | 'oldest'>('newest')

const filters = [
  { label: '全部', value: 'all' },
  { label: '山水', value: 'landscape' },
  { label: '花鸟', value: 'birds' },
  { label: '人物', value: 'figure' },
  { label: '花卉', value: 'flowers' },
  { label: '鱼虫', value: 'fish' },
  { label: '建筑', value: 'architecture' },
  { label: '云雾', value: 'cloud' },
  { label: '飞天', value: 'flying' },
  { label: '龙凤', value: 'dragon' },
]

const statDefs = [
  { label: '作品总数', value: 'all', icon: '/image/icons/gallery.png' },
  { label: '山水', value: 'landscape', icon: '/assets/icons/content_landscape.png' },
  { label: '花鸟', value: 'birds', icon: '/assets/icons/content_birds.png' },
  { label: '人物', value: 'figure', icon: '/assets/icons/content_figure.png' },
  { label: '花卉', value: 'flowers', icon: '/assets/icons/content_flowers.png' },
  { label: '鱼虫', value: 'fish', icon: '/assets/icons/content_fish.png' },
  { label: '建筑', value: 'architecture', icon: '/assets/icons/content_architecture.png' },
  { label: '云雾', value: 'cloud', icon: '/assets/icons/content_clouds.png' },
  { label: '飞天', value: 'flying', icon: '/assets/icons/content_flying.png' },
  { label: '龙凤', value: 'dragon', icon: '/assets/icons/content_dragon.png' },
]

const emptyShowcase = [
  { title: '山水长卷', image: '/image/中国画/山水画.png' },
  { title: '青花器韵', image: '/image/中国陶瓷/青花瓷瓶.png' },
  { title: '花鸟清供', image: '/image/中国画/花鸟画.png' },
]

const inspirationWall = [
  { title: '今日宜留白', text: '山水、云雾、亭台适合做第一幅馆藏。', image: '/assets/icons/content_landscape.png' },
  { title: '成片可归档', text: 'AIGC 动画生成后，也能作为视频记录收藏。', image: '/image/icons/completion.png' },
  { title: '按题材筛选', text: '作品会按山水、花鸟、人物、飞天等维度陈列。', image: '/assets/icons/content_flying.png' },
]

const statsCards = computed(() =>
  statDefs.map((item) => ({
    ...item,
    count:
      item.value === 'all'
        ? gallery.artworks.length
        : gallery.artworks.filter((artwork) => artwork.content === item.value).length,
  })),
)

const filteredArtworks = computed(() => {
  const list =
    currentFilter.value === 'all'
      ? [...gallery.artworks]
      : gallery.artworks.filter((artwork) => artwork.content === currentFilter.value)
  return list.sort((a, b) => {
    const delta = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    return sortOrder.value === 'newest' ? delta : -delta
  })
})

async function removeArtwork(id: string) {
  try {
    await gallery.remove(id)
    ElMessage.success('作品已从画廊移除')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '删除失败，请稍后重试')
  }
}

onMounted(async () => {
  await auth.checkLogin()
  if (!auth.isLoggedIn) {
    gallery.artworks = []
    gallery.error = '请先登录'
    return
  }
  await gallery.refresh()
})
</script>
