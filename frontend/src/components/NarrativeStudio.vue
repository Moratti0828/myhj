<template>
  <section class="narrative-studio">
    <StudioHero kicker="墨韵成篇" title="叙事短片" description="让一幅原作，成为一个故事的开始。你来定意，画中万物由此生发。" :steps="['原作','构思','分镜','导出']" />

    <div class="story-workbench">
      <section class="story-panel story-source">
        <h2>一幅原作</h2>
        <div class="story-image-stage">
          <img v-if="story.image" :src="story.image" alt="叙事原作" />
          <p v-else>从一棵树、一尾鱼，或你笔下的万物开始。</p>
        </div>
        <div class="story-source-actions">
          <label class="story-button" :class="{ disabled: story.busy }">导入原作
            <input type="file" accept="image/png,image/jpeg,image/webp,image/bmp" :disabled="story.busy" @change="uploadImage" />
          </label>
          <button v-if="creation.generatedImage" type="button" :disabled="story.busy" @click="story.setImage(creation.generatedImage)">使用当前创作</button>
          <button v-if="video.firstFrame && video.firstFrame !== story.image" type="button" :disabled="story.busy" @click="story.setImage(video.firstFrame)">使用微动原作</button>
        </div>
      </section>

      <section class="story-panel">
        <h2>你的故事，由你定意</h2>
        <fieldset :disabled="story.busy">
          <label for="story-idea">想让画中发生什么？</label>
          <textarea id="story-idea" v-model="story.idea" maxlength="1500" placeholder="自由写下情节，也可以留空，让原作带来三个不同的故事。"></textarea>
          <label for="story-meaning">想留下怎样的感受或寓意？</label>
          <input id="story-meaning" v-model="story.meaning" maxlength="1500" placeholder="可写一段心境、一种矛盾，或想让观众思考的问题" />
          <div class="story-two-fields">
            <div><label for="story-preserve">原作中必须保留什么？</label><textarea id="story-preserve" v-model="story.preserve" maxlength="1500"></textarea></div>
            <div><label for="story-changes">哪些内容可以新增或改变？</label><textarea id="story-changes" v-model="story.changes" maxlength="1500"></textarea></div>
          </div>
          <label for="story-ending">你期待怎样的结尾？</label>
          <input id="story-ending" v-model="story.ending" maxlength="1500" placeholder="可以留白，也可以写下你心中的最后一个画面" />
          <button class="story-primary" type="button" :disabled="!story.image || story.busy" @click="story.generate()">
            {{ story.busy ? '正在酝酿故事…' : story.proposals.length ? '重新构思三个故事' : story.idea.trim() ? '依此构思三个故事' : '从原作构思三个故事' }}
          </button>
        </fieldset>
        <p v-if="story.error" class="story-error" role="alert">{{ story.error }}</p>
        <p v-if="storageError" class="story-error" role="status">{{ storageError }}</p>
        <p v-if="story.dirty" class="story-notice">原作或创意已调整。现有分镜仍保留，你可以继续修改，或重新构思。</p>
      </section>
    </div>

    <section v-if="story.proposals.length" class="story-panel story-proposals">
      <header class="story-section-heading"><div><span>故事择意</span><h2>三条路，各有一番画意</h2></div><p>选一份故事，继续写成自己的分镜。</p></header>
      <p class="story-observation"><strong>原作所见</strong>{{ story.observation }}</p>
      <div class="story-proposal-grid">
        <button v-for="(proposal, index) in story.proposals" :key="index" type="button" :aria-pressed="story.selectedIndex === index" :disabled="story.busy" @click="story.selectedIndex = index">
          <span>其{{ ['一','二','三'][index] }}</span><h3>{{ proposal.title }}</h3><p>{{ proposal.logline }}</p><small>{{ proposal.meaning }}</small>
        </button>
      </div>
    </section>

    <section v-if="story.selected" class="story-panel story-editor">
      <header class="story-section-heading"><div><span>分镜细作</span><h2>把故事写进每一个镜头</h2></div><p>{{ story.selected.shots.length }} 镜 · 共 {{ story.totalDuration }} 秒</p></header>
      <fieldset :disabled="story.busy">
        <div class="story-two-fields">
          <div><label for="story-title">片名</label><input id="story-title" v-model="story.selected.title" maxlength="100" /></div>
          <div><label for="story-logline">一句话故事</label><input id="story-logline" v-model="story.selected.logline" maxlength="400" /></div>
        </div>
        <label for="story-synopsis">开场、转折与结尾</label><textarea id="story-synopsis" v-model="story.selected.synopsis" maxlength="2000"></textarea>
        <label for="story-selected-meaning">故事的余味</label><input id="story-selected-meaning" v-model="story.selected.meaning" maxlength="500" />
        <div class="story-shots">
          <article v-for="(shot, index) in story.selected.shots" :key="index" class="story-shot">
            <header><strong>第 {{ index + 1 }} 镜</strong><div>
              <button type="button" :disabled="index === 0" :aria-label="`第${index + 1}镜上移`" @click="story.moveShot(index, -1)">上移</button>
              <button type="button" :disabled="index === story.selected.shots.length - 1" :aria-label="`第${index + 1}镜下移`" @click="story.moveShot(index, 1)">下移</button>
              <button type="button" :disabled="story.selected.shots.length === 1" :aria-label="`删除第${index + 1}镜`" @click="story.removeShot(index)">删除</button>
            </div></header>
            <div class="story-two-fields"><div><label :for="`shot-title-${index}`">镜头名</label><input :id="`shot-title-${index}`" v-model="shot.title" maxlength="100" /></div>
              <div><label :for="`shot-duration-${index}`">时长</label><select :id="`shot-duration-${index}`" v-model.number="shot.duration"><option v-for="duration in 14" :key="duration" :value="duration + 1">{{ duration + 1 }} 秒</option></select></div></div>
            <label :for="`shot-visual-${index}`">关键画面 · 保留与新增</label><textarea :id="`shot-visual-${index}`" v-model="shot.visual" maxlength="1500"></textarea>
            <label :for="`shot-action-${index}`">这一镜发生什么？</label><textarea :id="`shot-action-${index}`" v-model="shot.action" maxlength="1500"></textarea>
            <div class="story-two-fields"><div><label :for="`shot-camera-${index}`">运镜</label><input :id="`shot-camera-${index}`" v-model="shot.camera" maxlength="500" /></div>
              <div><label :for="`shot-transition-${index}`">衔接或收尾</label><input :id="`shot-transition-${index}`" v-model="shot.transition" maxlength="1000" /></div></div>
          </article>
        </div>
        <div class="story-footer-actions">
          <button type="button" :disabled="story.selected.shots.length >= 6" @click="story.addShot()">＋ 添加镜头</button>
          <button type="button" @click="story.exportScript('md')">导出分镜脚本</button>
          <button type="button" @click="story.exportScript('json')">导出 JSON</button>
        </div>
      </fieldset>
    </section>
  </section>
</template>

<script setup lang="ts">
import StudioHero from '@/components/StudioHero.vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNarrativeStore } from '@/stores/narrative'
import { useCreationStore } from '@/stores/creation'
import { useVideoStore } from '@/stores/video'
const story = useNarrativeStore()
const creation = useCreationStore()
const video = useVideoStore()
const storageError = ref('')
let loaded = false
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveDraft() {
  void story.save().catch(() => { storageError.value = '草稿暂未能保存在此浏览器中，请导出脚本留存。' })
}
onMounted(async () => {
  try { await story.restore() } catch { storageError.value = '暂时无法读取上次草稿。' }
  loaded = true
  if (!story.image) story.setImage(creation.generatedImage || video.firstFrame)
})
watch(() => [story.image, story.idea, story.meaning, story.preserve, story.changes, story.ending], () => {
  if (loaded && story.proposals.length) story.dirty = true
}, { flush: 'sync' })
watch(() => [story.image, story.idea, story.meaning, story.preserve, story.changes, story.ending, story.observation, story.proposals, story.selectedIndex, story.dirty], () => {
  if (!loaded) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(saveDraft, 500)
}, { deep: true })
onBeforeUnmount(() => { clearTimeout(saveTimer); if (loaded) saveDraft() })
function uploadImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 20 * 1024 * 1024) { story.error = '请选择20MB以内的图片。'; input.value = ''; return }
  const reader = new FileReader()
  reader.onload = () => story.setImage(String(reader.result))
  reader.onerror = () => { story.error = '图片未能读取，请重新选择。' }
  reader.readAsDataURL(file)
  input.value = ''
}
</script>

<style scoped>
.narrative-studio { color: #302c24; }
.story-hero { padding: clamp(24px,4vw,48px); border-radius: 20px; color: #fff8e9; background: linear-gradient(115deg,#25271ff2,#625039db); margin-bottom: 24px; }
.story-hero > span, .story-section-heading span { color: #bfa573; font-size: 14px; }
.story-hero h1 { margin: 12px 0; font-size: var(--page-heading-size); line-height: var(--page-heading-line-height); }
.story-hero p { line-height: 1.9; margin: 12px 0 22px; }
.story-hero i { font-style: normal; padding: 0 18px; opacity: .6; }
.story-workbench { display: grid; grid-template-columns: minmax(280px,.8fr) minmax(0,1.2fr); gap: 24px; align-items: start; }
.story-panel { padding: clamp(20px,2.5vw,32px); background: #fffdf7f5; border: 1px solid #daceb6; border-radius: 18px; min-width: 0; }
.story-panel h2 { font-size: 25px; margin: 0 0 20px; }
.story-image-stage { min-height: 260px; height: clamp(280px,30vw,460px); background: #f2eee3; display: grid; place-items: center; border: 5px solid #363126; border-radius: 8px; overflow: hidden; }
.story-image-stage img { width: 100%; height: 100%; max-height: 100%; object-fit: contain; }
.story-image-stage p { padding: 30px; color: #8c795d; line-height: 1.9; }
.story-source-actions, .story-footer-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.story-source-actions input { display: none; }
.story-panel button, .story-button { font: inherit; border: 1px solid #ccbea3; color: #67543a; background: #faf5e9; border-radius: 9px; padding: 10px 16px; cursor: pointer; line-height: 1.6; }
button:disabled, .story-button.disabled { cursor: default; opacity: .5; }
fieldset { padding: 0; margin: 0; min-width: 0; border: 0; }
fieldset label { display: block; margin: 16px 0 8px; font-size: 14px; color: #6c5940; }
fieldset > label:first-child { margin-top: 0; }
fieldset input, fieldset textarea, fieldset select { display: block; width: 100%; box-sizing: border-box; padding: 12px; border: 1px solid #d9cfbb; border-radius: 8px; background: #fffdf8; color: #363126; font: inherit; line-height: 1.8; }
fieldset textarea { min-height: 105px; resize: vertical; }
.story-two-fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; }
.story-panel .story-primary { background: #2e3026; color: #ffefc9; width: 100%; margin-top: 22px; }
.story-error { color: #aa4537; font-size: 14px; line-height: 1.8; }
.story-notice { color: #8b6d38; font-size: 14px; line-height: 1.8; }
.story-proposals, .story-editor { margin-top: 24px; }
.story-section-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; }
.story-section-heading h2 { margin: 8px 0 12px; }
.story-section-heading p { color: #85745c; font-size: 14px; }
.story-observation { padding: 14px 18px; background: #f3eddf; line-height: 1.9; border-radius: 10px; }
.story-observation strong { margin-right: 14px; }
.story-proposal-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 18px; margin-top: 22px; }
.story-proposal-grid button { text-align: left; padding: 22px; }
.story-proposal-grid button[aria-pressed="true"] { border-color: #81704d; background: #ede4d1; box-shadow: inset 0 0 0 1px #81704d; }
.story-proposal-grid h3 { font-size: 21px; margin: 12px 0; color: #353025; }
.story-proposal-grid p { font-size: 14px; line-height: 1.9; }
.story-proposal-grid small { display: block; font-size: 13px; line-height: 1.8; color: #8a7553; }
.story-shots { display: grid; gap: 20px; margin-top: 24px; }
.story-shot { padding: 22px; border: 1px solid #dfd4be; background: #f7f2e7; border-radius: 12px; }
.story-shot header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.story-shot header > div { display: flex; gap: 8px; }
.story-shot header button { padding: 5px 10px; font-size: 13px; }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid #94753f; outline-offset: 3px; }
@media(max-width: 900px) { .story-workbench, .story-proposal-grid { grid-template-columns: 1fr; } }
@media(max-width: 560px) { .story-two-fields { grid-template-columns: 1fr; gap: 0; } .story-shot { padding: 16px; } }
</style>
