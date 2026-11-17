<template>
  <section
    ref="pageRoot"
    class="home-original-page"
    :class="{ 'is-paused': isPaused }"
    :style="heroVars"
  >
    <div class="home-ink-background" aria-hidden="true">
      <div class="home-ink-parallax-plane">
        <div class="home-ink-background-image"></div>
        <div class="home-ink-mist home-ink-mist--far"></div>
        <div class="home-ink-mist home-ink-mist--near"></div>
        <span
          v-for="particle in inkParticles"
          :key="particle.id"
          class="home-ink-particle"
          :style="particle.style"
        ></span>
      </div>
      <div class="home-ink-readability-mask"></div>
    </div>

    <header class="home-original-header">
      <RouterLink class="home-original-logo" to="/">
        <img :src="'/image/logo.png'" alt="墨韵画境" />
        <span>墨韵画境 · AI绘画</span>
      </RouterLink>
      <nav class="home-original-nav">
        <RouterLink to="/" class="active">首页</RouterLink>
        <RouterLink to="/creation">创作</RouterLink>
        <RouterLink to="/animation">AIGC动画</RouterLink>
        <RouterLink to="/agent">非遗书童</RouterLink>
        <RouterLink to="/heritage">非遗文化</RouterLink>
        <RouterLink to="/gallery">我的画廊</RouterLink>
      </nav>
    </header>

    <main class="home-original-main">
      <section ref="heroRoot" class="home-original-hero">
        <div class="home-original-decor home-original-decor-left" aria-hidden="true"></div>
        <div class="home-original-hero-copy">
          <span class="home-original-kicker">国风 AIGC 创作工坊</span>
          <h1>
            墨韵<span>画境</span>
          </h1>
          <h2>让AI传承千年文化，用科技重塑水墨之美</h2>
          <p>融合中国传统艺术与现代AI技术，只需简单几笔，即可生成意境深远的水墨画作。</p>
          <div class="home-original-actions">
            <RouterLink to="/creation" class="home-original-btn primary">开始创作</RouterLink>
            <RouterLink to="/heritage" class="home-original-btn">探索非遗</RouterLink>
          </div>
          <div class="home-original-quote">以笔入画，以墨写意；让算法成为你的第二支毛笔。</div>
          <div class="home-original-scroll">向下探索 · 非遗与创作灵感</div>
        </div>
      </section>

      <section class="home-original-section">
        <h2>平台特色</h2>
        <div class="home-original-features">
          <article v-for="item in features" :key="item.title" class="home-original-feature-card">
            <img :src="item.icon" :alt="item.title" />
            <h3>{{ item.title }}</h3>
            <p>{{ item.text }}</p>
          </article>
        </div>
      </section>

      <section class="home-original-section">
        <h2>作品展示</h2>
        <div class="home-original-showcase">
          <RouterLink v-for="item in showcase" :key="item.title" :to="item.to" class="home-original-showcase-item">
            <img :src="item.image" :alt="item.title" />
            <div>
              <h3>{{ item.title }}</h3>
              <p>{{ item.text }}</p>
            </div>
          </RouterLink>
        </div>
      </section>

      <section class="home-original-stats">
        <article v-for="item in stats" :key="item.label">
          <strong>{{ item.value }}</strong>
          <span>{{ item.label }}</span>
        </article>
      </section>
    </main>

    <footer class="home-original-footer">墨韵画境 · 让传统文化在数字画卷中继续生长</footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { CSSProperties } from 'vue'

type InkParticle = {
  id: number
  style: CSSProperties
}

const pageRoot = ref<HTMLElement | null>(null)
const heroRoot = ref<HTMLElement | null>(null)
const isPaused = ref(false)
const parallaxX = ref(0)
const parallaxY = ref(0)

const heroVars = computed<CSSProperties>(() => ({
  '--home-parallax-x': `${parallaxX.value.toFixed(2)}px`,
  '--home-parallax-y': `${parallaxY.value.toFixed(2)}px`,
}))

const inkParticles: InkParticle[] = [
  { id: 1, style: { '--particle-x': '8%', '--particle-y': '34%', '--particle-size': '3px', '--particle-delay': '-2s', '--particle-duration': '22s', '--particle-drift-x': '18px' } as CSSProperties },
  { id: 2, style: { '--particle-x': '14%', '--particle-y': '68%', '--particle-size': '4px', '--particle-delay': '-9s', '--particle-duration': '26s', '--particle-drift-x': '-16px' } as CSSProperties },
  { id: 3, style: { '--particle-x': '27%', '--particle-y': '23%', '--particle-size': '2px', '--particle-delay': '-14s', '--particle-duration': '19s', '--particle-drift-x': '12px' } as CSSProperties },
  { id: 4, style: { '--particle-x': '36%', '--particle-y': '74%', '--particle-size': '5px', '--particle-delay': '-5s', '--particle-duration': '24s', '--particle-drift-x': '-20px' } as CSSProperties },
  { id: 5, style: { '--particle-x': '63%', '--particle-y': '28%', '--particle-size': '3px', '--particle-delay': '-12s', '--particle-duration': '21s', '--particle-drift-x': '14px' } as CSSProperties },
  { id: 6, style: { '--particle-x': '74%', '--particle-y': '61%', '--particle-size': '4px', '--particle-delay': '-7s', '--particle-duration': '25s', '--particle-drift-x': '-18px' } as CSSProperties },
  { id: 7, style: { '--particle-x': '88%', '--particle-y': '39%', '--particle-size': '2px', '--particle-delay': '-16s', '--particle-duration': '23s', '--particle-drift-x': '10px' } as CSSProperties },
  { id: 8, style: { '--particle-x': '91%', '--particle-y': '77%', '--particle-size': '4px', '--particle-delay': '-3s', '--particle-duration': '28s', '--particle-drift-x': '-14px' } as CSSProperties },
  { id: 9, style: { '--particle-x': '19%', '--particle-y': '51%', '--particle-size': '2px', '--particle-delay': '-20s', '--particle-duration': '27s', '--particle-drift-x': '16px' } as CSSProperties },
]

let pointerCleanup: (() => void) | null = null
let observer: IntersectionObserver | null = null
let mediaQuery: MediaQueryList | null = null
let mediaCleanup: (() => void) | null = null
let frameId = 0
let targetX = 0
let targetY = 0
let currentX = 0
let currentY = 0

function cancelParallaxFrame() {
  if (frameId) {
    window.cancelAnimationFrame(frameId)
    frameId = 0
  }
}

function animateParallax() {
  currentX += (targetX - currentX) * 0.08
  currentY += (targetY - currentY) * 0.08
  parallaxX.value = currentX
  parallaxY.value = currentY

  if (Math.abs(targetX - currentX) > 0.02 || Math.abs(targetY - currentY) > 0.02) {
    frameId = window.requestAnimationFrame(animateParallax)
  } else {
    frameId = 0
  }
}

function requestParallaxUpdate() {
  if (!frameId && !isPaused.value) frameId = window.requestAnimationFrame(animateParallax)
}

function resetParallax() {
  targetX = 0
  targetY = 0
  requestParallaxUpdate()
}

function setupPointerParallax() {
  const root = heroRoot.value
  if (!root || window.innerWidth < 768 || mediaQuery?.matches) return

  const onPointerMove = (event: PointerEvent) => {
    if (isPaused.value || event.pointerType === 'touch') return
    const rect = root.getBoundingClientRect()
    const xRatio = (event.clientX - rect.left) / rect.width - 0.5
    const yRatio = (event.clientY - rect.top) / rect.height - 0.5
    targetX = Math.max(-6, Math.min(6, xRatio * -12))
    targetY = Math.max(-4, Math.min(4, yRatio * -8))
    requestParallaxUpdate()
  }

  root.addEventListener('pointermove', onPointerMove, { passive: true })
  root.addEventListener('pointerleave', resetParallax, { passive: true })
  pointerCleanup = () => {
    root.removeEventListener('pointermove', onPointerMove)
    root.removeEventListener('pointerleave', resetParallax)
  }
}

function teardownPointerParallax() {
  pointerCleanup?.()
  pointerCleanup = null
  resetParallax()
}

onMounted(() => {
  mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (!mediaQuery.matches) setupPointerParallax()

  const onMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) teardownPointerParallax()
    else setupPointerParallax()
  }

  mediaQuery.addEventListener('change', onMediaChange)
  mediaCleanup = () => mediaQuery?.removeEventListener('change', onMediaChange)

  if (heroRoot.value) {
    observer = new IntersectionObserver(
      ([entry]) => {
        isPaused.value = !entry.isIntersecting
        if (isPaused.value) {
          cancelParallaxFrame()
        } else {
          requestParallaxUpdate()
        }
      },
      { threshold: 0 }
    )
    observer.observe(heroRoot.value)
  }
})

onBeforeUnmount(() => {
  teardownPointerParallax()
  observer?.disconnect()
  observer = null
  mediaCleanup?.()
  mediaCleanup = null
  cancelParallaxFrame()
})

const features = [
  { title: '草图创作', text: '支持手绘或导入草图，AI智能识别您想表达的内容。', icon: '/image/icons/sketch.png' },
  { title: '多样风格', text: '水墨、青花瓷、敦煌、工笔等多种艺术风格可选。', icon: '/image/icons/style.png' },
  { title: '智能补全', text: 'AI根据您的构图智能补全细节，让作品更加完整。', icon: '/image/icons/completion.png' },
  { title: '个人画廊', text: '保存和展示您的AI创作，打造专属的艺术空间。', icon: '/image/icons/gallery.png' },
]

const showcase = [
  { title: '水墨山水', text: '远山含烟，云水相生。', image: '/image/中国画/山水画.png', to: '/creation' },
  { title: '陶瓷纹样', text: '青花淡染，瓷韵悠长。', image: '/image/非遗文化/陶瓷艺术.png', to: '/heritage' },
  { title: '人物写意', text: '衣袂生风，神采入画。', image: '/image/中国画/人物画.png', to: '/creation' },
  { title: '锦绣花影', text: '针脚成诗，花色入梦。', image: '/image/非遗文化/中国刺绣.png', to: '/heritage' },
  { title: '花鸟丹青', text: '一枝一叶，皆有生机。', image: '/image/中国画/花鸟画.png', to: '/creation' },
  { title: '书法墨骨', text: '骨肉相融，气韵天成。', image: '/image/非遗文化/中国书法.jpg', to: '/heritage/calligraphy' },
]

const stats = [
  { value: '8+', label: '非遗门类' },
  { value: '9', label: '创作题材' },
  { value: '9', label: '国风风格' },
  { value: 'AI', label: '智能生成' },
]
</script>
