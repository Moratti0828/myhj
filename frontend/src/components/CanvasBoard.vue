<template>
  <div class="sketch-canvas-wrapper">
    <div class="floating-vertical-toolbar">
      <button class="v-tool-btn" :class="{ active: tool === 'brush' }" type="button" title="毛笔" @click="$emit('tool', 'brush')">🖌️</button>
      <button class="v-tool-btn" :class="{ active: tool === 'eraser' }" type="button" title="宣纸擦" @click="$emit('tool', 'eraser')">🧽</button>
      <span class="tool-divider"></span>
      <button class="v-tool-btn" type="button" title="撤销" @click="undo">↶</button>
      <button class="v-tool-btn" type="button" title="重做" @click="redo">↷</button>
      <button class="v-tool-btn" type="button" title="清空" @click="clear">⌫</button>
    </div>
    <div ref="viewportRef" class="canvas-scroll-frame-dark">
      <div class="canvas-zoom-stage" :style="{ width: `${displayWidth}px`, height: `${displayHeight}px` }">
      <div class="canvas-container-dark" :style="{ width: `${displayWidth}px`, height: `${displayHeight}px`, flex: 'none' }">
        <canvas
          ref="canvasRef"
          class="drawing-canvas"
          width="960"
          height="1180"
          @pointerdown="start"
          @pointermove="draw"
          @pointerup="stop"
          @pointerleave="stop"
        ></canvas>
      </div>
      </div>
    </div>
    <div class="canvas-zoom-controls">
      <button type="button" aria-label="缩小画布" @click="zoom = Math.max(50, zoom - 25)">−</button>
      <input v-model.number="zoom" aria-label="画布缩放" type="range" min="50" max="400" step="5" />
      <output>{{ zoom }}%</output>
      <button type="button" aria-label="放大画布" @click="zoom = Math.min(400, zoom + 25)">＋</button>
      <button type="button" @click="zoom = 100">适配</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    brushSize?: number
    brushColor?: string
    opacity?: number
    tool?: 'brush' | 'eraser'
  }>(),
  {
    brushSize: 3,
    brushColor: '#111111',
    opacity: 1,
    tool: 'brush',
  },
)

const emit = defineEmits<{ changed: [dataUrl: string, hasMarks: boolean, inkRatio: number]; tool: [value: 'brush' | 'eraser'] }>()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const undoStack: ImageData[] = []
const redoStack: ImageData[] = []
const canvasRatio = ref('960 / 1180')
const viewportRef = ref<HTMLDivElement | null>(null)
const viewportWidth = ref(400)
const viewportHeight = ref(320)
const zoom = ref(100)
const ratio = computed(() => { const [w, h] = canvasRatio.value.split(' / ').map(Number); return w / h })
const fitWidth = computed(() => Math.min(viewportWidth.value - 4, (viewportHeight.value - 4) * ratio.value))
const displayWidth = computed(() => fitWidth.value * zoom.value / 100)
const displayHeight = computed(() => displayWidth.value / ratio.value)
const resizeObserver = new ResizeObserver(([entry]) => {
  viewportWidth.value = entry.contentRect.width
  viewportHeight.value = entry.contentRect.height
})
onBeforeUnmount(() => resizeObserver.disconnect())
let drawing = false
let hasMarks = false

function context() {
  return canvasRef.value?.getContext('2d') || null
}

function snapshot() {
  const canvas = canvasRef.value
  const ctx = context()
  if (!canvas || !ctx) return
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  if (undoStack.length > 18) undoStack.shift()
  redoStack.length = 0
}

function hasVisibleMarks() {
    return inkStats().hasMarks
}

/** 同时返回“有没有落笔”和“墨迹覆盖率”，后者用于提示稀疏草图会被模型脑补。 */
function inkStats() {
    const canvas = canvasRef.value
    const ctx = context()
    if (!canvas || !ctx) return { hasMarks: false, ratio: 0 }
    const sample = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let i = 0; i < sample.length; i += 4) {
        const r = sample[i]
        const g = sample[i + 1]
        const b = sample[i + 2]
        const a = sample[i + 3]
        if (a > 0 && (Math.abs(r - 250) > 8 || Math.abs(g - 248) > 8 || Math.abs(b - 244) > 8)) count++
    }
    return {
        hasMarks: count > 0,
        ratio: count / (canvas.width * canvas.height),
    }
}

function sync(nextHasMarks = hasMarks) {
  const canvas = canvasRef.value
  const stats = inkStats()
  hasMarks = nextHasMarks
  if (canvas) emit('changed', canvas.toDataURL('image/png'), hasMarks, stats.ratio)
}

function point(event: PointerEvent) {
  const canvas = canvasRef.value
  if (!canvas) return { x: 0, y: 0 }
  const rect = canvas.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  }
}

function start(event: PointerEvent) {
  const ctx = context()
  if (!ctx) return
  snapshot()
  drawing = true
  const p = point(event)
  ctx.beginPath()
  ctx.moveTo(p.x, p.y)
}

function draw(event: PointerEvent) {
  if (!drawing) return
  const ctx = context()
  if (!ctx) return
  const p = point(event)
  ctx.globalAlpha = props.opacity
  ctx.globalCompositeOperation = props.tool === 'eraser' ? 'destination-out' : 'source-over'
  ctx.lineWidth = props.tool === 'eraser' ? props.brushSize * 2.6 : props.brushSize
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = props.brushColor
  ctx.lineTo(p.x, p.y)
  ctx.stroke()
  ctx.globalAlpha = 1
  sync(props.tool === 'brush' ? true : hasVisibleMarks())
}

function stop() {
  if (!drawing) return
  drawing = false
  sync()
}

function fillPaper() {
  const canvas = canvasRef.value
  const ctx = context()
  if (!canvas || !ctx) return
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#faf8f4'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
}

function clear() {
  snapshot()
  fillPaper()
  sync(false)
}

function loadImage(dataUrl: string) {
  const canvas = canvasRef.value
  const ctx = context()
  if (!canvas || !ctx) return Promise.reject(new Error('画布尚未准备好'))

  return new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      snapshot()
      const scale = Math.min(1, 2048 / Math.max(image.width, image.height))
      canvas.width = Math.round(image.width * scale)
      canvas.height = Math.round(image.height * scale)
      canvasRatio.value = `${canvas.width} / ${canvas.height}`
      fillPaper()
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      sync(true)
      resolve()
    }
    image.onerror = () => reject(new Error('图片读取失败，请换一张清晰的草图图片。'))
    image.src = dataUrl
  })
}

function undo() {
  const canvas = canvasRef.value
  const ctx = context()
  const last = undoStack.pop()
  if (!canvas || !ctx || !last) return
  redoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  canvas.width = last.width
  canvas.height = last.height
  canvasRatio.value = `${last.width} / ${last.height}`
  ctx.putImageData(last, 0, 0)
  sync(hasVisibleMarks())
}

function redo() {
  const canvas = canvasRef.value
  const ctx = context()
  const next = redoStack.pop()
  if (!canvas || !ctx || !next) return
  undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height))
  canvas.width = next.width
  canvas.height = next.height
  canvasRatio.value = `${next.width} / ${next.height}`
  ctx.putImageData(next, 0, 0)
  sync(hasVisibleMarks())
}

onMounted(() => {
  resizeObserver.observe(viewportRef.value!)
  fillPaper()
  sync(false)
})

defineExpose({ clear, undo, redo, loadImage })
</script>

<style scoped>
.sketch-canvas-wrapper { flex-direction: column; align-items: stretch; gap: 10px; }
.sketch-canvas-wrapper .canvas-scroll-frame-dark { display: block; flex: none; height: var(--creation-preview-height, 400px); min-height: 200px; width: 100%; overflow: auto; filter: none; }
.canvas-zoom-stage { min-width: 100%; min-height: 100%; display: grid; place-items: center; }
.sketch-canvas-wrapper .canvas-container-dark { max-height: none; min-height: 0; margin: 0; box-sizing: border-box; overflow: hidden; }
.sketch-canvas-wrapper .drawing-canvas { display: block; width: 100%; height: 100%; }
.canvas-zoom-controls { display: flex; align-items: center; gap: 8px; width: 100%; }
.canvas-zoom-controls input { min-width: 40px; flex: 1; accent-color: #9c814b; }
.canvas-zoom-controls output { min-width: 42px; font-size: 12px; color: #806b49; text-align: center; }
.canvas-zoom-controls button { padding: 5px 9px; border: 1px solid #d8c9aa; border-radius: 8px; background: #faf8f4; color: #675536; cursor: pointer; }
</style>
