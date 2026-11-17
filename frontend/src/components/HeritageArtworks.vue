<template>
  <div class="artwork-grid">
    <button v-for="(art, index) in artworks" :key="art.img" class="artwork-card" type="button" @click="openArtwork(index)">
      <img :src="art.img" :alt="art.label" loading="lazy" />
      <span class="artwork-label">{{ art.label }}</span>
      <span class="artwork-entry">入画细赏 →</span>
    </button>
  </div>

  <dialog ref="viewer" class="artwork-dialog" aria-labelledby="artwork-title" @click="closeOnBackdrop">
    <template v-if="selected">
      <header class="artwork-dialog-header">
        <div><span>{{ topicNames[topic] }} · 艺术品鉴</span><h2 id="artwork-title">{{ selected.label }}</h2></div>
        <button type="button" class="artwork-close" aria-label="关闭作品详情" @click="viewer?.close()">关闭 ×</button>
      </header>
      <div class="artwork-dialog-body">
        <img class="artwork-large" :src="selected.img" :alt="selected.label" />
        <section class="artwork-reading">
          <h3>入画问意｜这幅图可以怎样看？</h3>
          <p>{{ reading.intro }}</p>
        </section>
        <section class="artwork-reading">
          <h3>细处寻味｜哪些细节值得留意？</h3>
          <dl><div v-for="term in reading.details" :key="term.name"><dt>{{ term.name }}</dt><dd>{{ term.text }}</dd></div></dl>
        </section>
        <section class="artwork-reading">
          <h3>循源再读</h3>
          <ul><li v-for="source in knowledge.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a></li></ul>
        </section>
      </div>
      <footer class="artwork-dialog-footer">
        <button type="button" :disabled="selectedIndex === 0" @click="selectedIndex--">← 上一幅</button>
        <span aria-live="polite">{{ selectedIndex + 1 }} / {{ artworks.length }}</span>
        <button type="button" :disabled="selectedIndex === artworks.length - 1" @click="selectedIndex++">下一幅 →</button>
      </footer>
    </template>
  </dialog>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { artworkAppreciation } from '@/data/artworkAppreciation'
import { heritageKnowledge, topicNames } from '@/data/heritageKnowledge'
const props = defineProps<{ artworks: { img: string; label: string }[]; topic: string }>()
const viewer = ref<HTMLDialogElement | null>(null)
const selectedIndex = ref(0)
const selected = computed(() => props.artworks[selectedIndex.value])
const knowledge = computed(() => heritageKnowledge[props.topic] || heritageKnowledge.ink)
const reading = computed(() => artworkAppreciation[selected.value.label])
async function openArtwork(index: number) {
  selectedIndex.value = index
  await nextTick()
  viewer.value?.showModal()
}
function closeOnBackdrop(event: MouseEvent) {
  if (event.target === viewer.value) viewer.value?.close()
}
</script>

<style scoped>
.artwork-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.artwork-card { display: flex; flex-direction: column; min-width: 0; padding: 0; overflow: hidden; border: 1px solid #d8ceba; border-radius: 14px; background: #fffdf8; color: #292c26; font: inherit; cursor: pointer; text-align: center; transition: box-shadow .2s; }
.artwork-card:hover { box-shadow: 0 8px 22px #292c2620; }
.artwork-card:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid #8a392e; outline-offset: 3px; }
.artwork-card img { display: block; width: 100%; height: 240px; object-fit: contain; background: #f5f1e8; }
.artwork-label { padding: 14px 12px 6px; line-height: 1.6; }
.artwork-entry { padding: 0 12px 16px; font-size: 13px; color: #8a392e; }
.artwork-dialog { width: min(960px, 94vw); max-width: 94vw; max-height: 90dvh; padding: 0; border: 1px solid #d8ceba; border-radius: 16px; background: #fffdf8; color: #292c26; overflow: auto; }
.artwork-dialog::backdrop { background: #17130fb3; }
.artwork-dialog-header { position: sticky; top: 0; z-index: 1; display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 20px 24px; background: #fffdf8; border-bottom: 1px solid #e5ddcd; }
.artwork-dialog-header span { font-size: 13px; color: #775c36; }
.artwork-dialog-header h2 { margin: 8px 0 0; font-size: clamp(22px, 3vw, 30px); line-height: 1.5; }
.artwork-close, .artwork-dialog-footer button { flex-shrink: 0; padding: 9px 14px; border: 1px solid #d8ceba; border-radius: 8px; background: #f5f1e8; color: #45483f; font: inherit; cursor: pointer; }
.artwork-dialog-body { padding: 24px; }
.artwork-large { display: block; width: 100%; max-height: 55dvh; object-fit: contain; background: #f5f1e8; }
.artwork-reading { margin-top: 28px; }
.artwork-reading h3 { margin-bottom: 12px; font-size: 19px; line-height: 1.6; }
.artwork-reading p, dd, li { line-height: 1.9; }
dl { display: grid; gap: 12px; }
dl > div { padding: 14px; border-radius: 8px; background: #f5f1e8; }
dt { margin-bottom: 6px; font-weight: 700; }
dd { margin: 0; font-size: 14px; }
li + li { margin-top: 10px; }
a { color: #8a392e; text-underline-offset: 4px; overflow-wrap: anywhere; }
.artwork-dialog-footer { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 16px 24px; border-top: 1px solid #e5ddcd; }
button:disabled { opacity: .4; cursor: default; }
@media (max-width: 800px) { .artwork-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .artwork-grid { grid-template-columns: 1fr; } .artwork-dialog-header, .artwork-dialog-body { padding: 16px; } .artwork-dialog-footer { padding: 14px; font-size: 13px; } }
</style>
