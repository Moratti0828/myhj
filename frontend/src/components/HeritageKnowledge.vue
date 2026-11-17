<template>
  <section id="heritage-knowledge" class="knowledge-section">
    <header class="knowledge-heading">
      <span>百科全解 · 寻源问艺</span>
      <h2>从一个主题，读懂更多关联</h2>
      <p>{{ knowledge.overview }}</p>
    </header>

    <div class="knowledge-branches">
      <details v-for="(branch, index) in knowledge.branches" :key="`${topic}-${branch.title}`" :open="index === 0">
        <summary>{{ branch.title }}</summary>
        <div class="branch-body">
          <p>{{ branch.text }}</p>
          <div class="branch-references" aria-label="参考资料">
            <h4>参考与延伸</h4>
            <ul><li v-for="(sourceIndex, referenceIndex) in branch.references" :key="sourceIndex">
              <span>{{ referenceIndex === 0 ? '参考依据' : '延伸查阅' }}</span>
              <a :href="knowledge.sources[sourceIndex].url" target="_blank" rel="noopener noreferrer">{{ knowledge.sources[sourceIndex].title }} ↗</a>
            </li></ul>
          </div>
        </div>
      </details>
    </div>

    <section class="knowledge-terms" aria-label="术语速览">
      <h3>术语速览</h3>
      <dl>
        <div v-for="term in knowledge.terms" :key="term.name">
          <dt>{{ term.name }}</dt>
          <dd>{{ term.text }}</dd>
        </div>
      </dl>
    </section>

    <aside class="knowledge-exercise">
      <h3>试着观察 · 动手练习</h3>
      <p>{{ knowledge.exercise }}</p>
    </aside>

    <nav class="knowledge-related" aria-label="相关主题">
      <strong>继续探索</strong>
      <RouterLink v-for="type in knowledge.related" :key="type" :to="`/heritage/${type}`">{{ topicNames[type] }} →</RouterLink>
    </nav>

    <details class="knowledge-sources">
      <summary><h4>资料来源 <span>（{{ knowledge.sources.length }} 项）</span></h4></summary>
      <ul>
        <li v-for="source in knowledge.sources" :key="source.url"><a :href="source.url" target="_blank" rel="noopener noreferrer">{{ source.title }} ↗</a></li>
      </ul>
    </details>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { heritageKnowledge, topicNames } from '@/data/heritageKnowledge'
const props = defineProps<{ topic: string }>()
const knowledge = computed(() => heritageKnowledge[props.topic] || heritageKnowledge.ink)
</script>

<style scoped>
.knowledge-section { margin: 32px 0 48px; padding: clamp(20px, 4vw, 36px); border: 1px solid #d8ceba; border-radius: 18px; background: #fffdf8; color: #292c26; }
.knowledge-heading > span { color: #8a392e; font-size: 14px; }
.knowledge-heading h2 { margin: 10px 0 18px; font-size: clamp(22px, 2.5vw, 30px); line-height: 1.5; }
p, dd { line-height: 1.95; overflow-wrap: anywhere; }
.knowledge-heading p { margin-bottom: 24px; }
.knowledge-branches { display: grid; gap: 12px; }
details { border: 1px solid #ddd5c5; border-radius: 10px; background: #fff; }
summary { padding: 17px 18px; cursor: pointer; font-size: 17px; line-height: 1.7; font-weight: 700; }
summary:focus-visible, a:focus-visible { outline: 2px solid #8a392e; outline-offset: 3px; }
details[open] > summary { border-bottom: 1px solid #e8e1d4; }
.branch-body { padding: 0 20px 20px; }
.branch-body p { margin: 16px 0; }
a { color: #8a392e; text-underline-offset: 4px; overflow-wrap: anywhere; }
.branch-body a { font-size: 13px; }
h3 { margin: 0 0 14px; font-size: 19px; }
.knowledge-terms { margin-top: 28px; }
dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin: 0; }
dl > div { padding: 18px; border-radius: 10px; background: #f5f1e8; }
dt { margin-bottom: 8px; font-weight: 700; color: #775c36; }
dd { margin: 0; font-size: 14px; }
.knowledge-exercise { margin-top: 24px; padding: 20px; border-left: 3px solid #8a392e; background: #faf5ee; }
.knowledge-exercise p { margin: 0 0 10px; }
.knowledge-exercise > span { color: #65635a; font-size: 12px; }
.knowledge-related { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin: 24px 0; }
.knowledge-related a { border: 1px solid #d8ceba; border-radius: 20px; padding: 8px 14px; text-decoration: none; }
.knowledge-sources { background: #faf8f3; }
.knowledge-sources p, .knowledge-sources ul { margin: 14px 20px; font-size: 13px; line-height: 1.9; }
.knowledge-sources li + li { margin-top: 10px; }
@media (max-width: 640px) { dl { grid-template-columns: 1fr; } summary { font-size: 16px; } }
.branch-references { margin-top: 20px; padding: 14px 16px; background: #faf8f3; border-radius: 8px; }
.branch-references h4 { margin: 0 0 10px; font-size: 13px; font-weight: 600; color: #65635a; }
.branch-references ul { margin: 0; padding-left: 18px; }
.branch-references li { margin: 8px 0; line-height: 1.7; }
.branch-references li > span { font-size: 12px; color: #65635a; margin-right: 10px; }
.knowledge-sources summary { font-size: 14px; font-weight: 400; }
.knowledge-sources h4 { display: inline; margin: 0; font-size: 14px; font-weight: 500; }
.knowledge-sources h4 > span { font-weight: 400; color: #65635a; }
</style>
