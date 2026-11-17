<template>
  <div class="agent-container agent-redesign">
    <section class="agent-chat-panel panel">
      <div class="agent-hero-card">
        <div>
          <span class="agent-kicker">非遗 AI 书童</span>
          <h1>问典故，也可请它作画</h1>
          <p>书童会把非遗知识讲清楚，也能把“帮我画一幅……”转成国风生成提示词。</p>
        </div>
        <div class="agent-ability-row">
          <span>文化讲解</span>
          <span>绘画提示</span>
          <span>作品保存</span>
        </div>
      </div>

      <div ref="messagesEl" class="agent-chat-messages">
        <div class="agent-message system">
          <div class="message-header">AI 书童</div>
          <div class="message-content">
            阁下安好。小生可讲中国书法、宋画、青花、剪纸、刺绣等非遗脉络；若想作画，也可直接说“帮我画一幅……”，小生会为您拟好画意并挥毫成图。
          </div>
        </div>

        <div v-for="message in visibleMessages" :key="message.createdAt + message.content" class="agent-message" :class="message.role === 'assistant' ? 'assistant' : 'user'">
          <div class="message-header">{{ message.role === 'assistant' ? 'AI 书童' : '我' }}</div>
          <small v-if="message.answerSource">{{ message.answerSource }}</small>
          <div class="message-content">{{ message.content }}</div>
          <div v-if="message.drawTaskId" class="agent-draw-status" :class="`is-${message.drawStatus || 'queued'}`">
            <span v-if="message.drawStatus === 'queued' || message.drawStatus === 'running'" class="agent-loading-spin"></span>
            <span class="agent-draw-status-dot"></span>
            <div>
              <strong>{{ drawStatusTitle(message) }}</strong>
              <p>{{ drawStatusText(message) }}</p>
            </div>
          </div>
          <div v-if="message.image" class="agent-image-card">
            <div class="agent-image-wrapper">
              <img :src="message.image" alt="AI 书童画作" />
            </div>
            <div class="agent-image-actions">
              <button type="button" @click="saveAgentImage(message)">保存至画廊</button>
              <button type="button" @click="openImage(message.image)">全屏品鉴</button>
            </div>
          </div>
        </div>

        <div v-if="agent.loading" class="agent-message assistant">
          <div class="message-header">AI 书童</div>
          <div class="message-content agent-loading-bubble">
            <div class="agent-loading-spin"></div>
            <span>书童正在翻检典籍、研墨构图，请稍候...</span>
          </div>
        </div>
      </div>

      <div class="agent-chat-input-area">
        <input ref="baseImageInput" type="file" accept="image/*" hidden @change="importBaseImage" />
        <button type="button" class="agent-upload-btn" title="导入底图" :disabled="agent.loading" @click="baseImageInput?.click()">图</button>
        <input
          v-model="input"
          type="text"
          :disabled="agent.loading"
          placeholder="问非遗典故，或说：帮我画一幅青花瓷月下山水..."
          @keydown.enter.prevent="send"
        />
        <button type="button" :disabled="agent.loading" @click="send">{{ agent.loading ? '研墨中' : '发送' }}</button>
      </div>
    </section>

    <aside class="agent-side-panel panel">
      <div class="agent-side-title">
        <span>灵</span>
        <div>
          <h2>灵感点拨</h2>
          <p>点一句即可开始对话</p>
        </div>
      </div>

      <div class="agent-quick-links">
        <h4>文化提问</h4>
        <div class="quick-links-grid">
          <button v-for="item in cultureQuestions" :key="item" class="quick-link-btn" type="button" :disabled="agent.loading" @click="askQuickQuestion(item)">
            {{ item }}
          </button>
        </div>

        <h4>书童绘图示范</h4>
        <div class="quick-links-grid">
          <button v-for="item in drawingQuestions" :key="item" class="quick-link-btn" type="button" :disabled="agent.loading" @click="askQuickQuestion(item)">
            {{ item }}
          </button>
        </div>
      </div>

      <div class="agent-info-card">
        <strong>书童提示</strong>
        <p>提问文化时，书童会先讲源流、工艺与审美，再给可用于创作的关键词。</p>
        <p>作画时，用“帮我画一幅……”开头，生成作品后可直接保存到个人画廊。</p>
      </div>
      <p v-if="agent.error" class="error-text">{{ agent.error }}</p>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAgentStore } from '@/stores/agent'
import { useCreationStore } from '@/stores/creation'
import { useGalleryStore } from '@/stores/gallery'
import type { AgentMessage } from '@/types'

const agent = useAgentStore()
const creation = useCreationStore()
const gallery = useGalleryStore()
const router = useRouter()
const input = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const baseImageInput = ref<HTMLInputElement | null>(null)

function importBaseImage(event: Event) {
  const fileInput = event.target as HTMLInputElement
  const file = fileInput.files?.[0]
  if (!file) return
  fileInput.value = ''
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择 PNG、JPG 等图片格式的底图')
    return
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning('底图不能超过 20 MB')
    return
  }

  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const dataUrl = String(reader.result || '')
      if (!dataUrl.startsWith('data:image/')) throw new Error('底图读取失败，请重试')
      creation.setSketch(dataUrl, true, 0)
      creation.prompt = ''
      creation.generatedImage = ''
      creation.promptUsed = ''
      creation.progress = []
      creation.error = ''
      await router.push('/creation')
      ElMessage.success('底图已带入创作台，请继续识图与生成')
    } catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '底图导入失败')
    }
  }
  reader.onerror = () => ElMessage.error('底图读取失败，请重试')
  reader.readAsDataURL(file)
}

const cultureQuestions = [
  '介绍一下中国剪纸的历史和美学特征。',
  '苏绣的双面绣有什么神奇之处？',
  '景德镇青花瓷上的花纹有什么寓意？',
  '京剧脸谱中红色和黑色分别代表什么？',
]

const drawingQuestions = [
  '帮我画一幅意境深远的泼墨山水。',
  '我想看一幅苏绣金鱼在池塘中游动、丝线质感的画。',
  '请绘制一盘精美绝伦的青花瓷牡丹图盘。',
  '帮我画一个大红色的中国结，带祥云和如意。',
]

const visibleMessages = computed(() =>
  agent.messages.filter((message, index) => !(index === 0 && message.role === 'assistant')),
)

function scrollToBottom() {
  nextTick(() => {
    if (!messagesEl.value) return
    messagesEl.value.scrollTop = messagesEl.value.scrollHeight
  })
}

async function send() {
  const text = input.value.trim()
  if (!text) return
  input.value = ''
  try {
    await agent.send(text)
  } catch {
    ElMessage.error('会话服务暂不可用')
  } finally {
    scrollToBottom()
  }
}

function askQuickQuestion(questionText: string) {
  input.value = questionText
  send()
}

async function saveAgentImage(message: AgentMessage) {
  if (!message.image) return
  try {
    await gallery.save({
      image: message.image,
      content: 'landscape',
      style: 'ink',
      prompt: message.promptUsed || message.content,
    })
    ElMessage.success('已成功保存至您的个人画廊')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，请先确认已登录')
  }
}

function openImage(image?: string) {
  if (!image) return
  window.open(image, '_blank', 'noopener,noreferrer')
}

function drawStatusTitle(message: AgentMessage) {
  if (message.drawStatus === 'succeeded') return '画作已完成'
  if (message.drawStatus === 'failed') return '生成遇到阻碍'
  if (message.drawStatus === 'running') return '书童正在作画'
  return '已入画案'
}

function drawStatusText(message: AgentMessage) {
  if (message.drawStatus === 'succeeded') return '已将成图补回当前对话，可保存到个人画廊。'
  if (message.drawStatus === 'failed') return message.drawError || '云端作画暂未完成，请稍后重新发送。'
  if (message.drawStatus === 'running') return '正在铺纸、调色与生成，您可以继续向书童提问。'
  return '任务已提交，等待云端开始生成。'
}

watch(
  () => agent.messages.length,
  () => scrollToBottom(),
)

watch(
  () => agent.messages.map((message) => `${message.drawStatus || ''}:${message.image || ''}:${message.drawError || ''}`).join('|'),
  () => scrollToBottom(),
)

watch(
  () => agent.drawingPrompt,
  (prompt) => {
    if (!prompt) return
    creation.setDrawPrompt(prompt)
  },
)
</script>
