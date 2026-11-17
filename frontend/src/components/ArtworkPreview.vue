<template>
  <InkCard title="作品预览" subtitle="生成结果可继续精修、成影或保存">
    <div class="preview-box">
      <img v-if="creation.generatedImage" :src="creation.generatedImage" alt="生成作品" />
      <div v-else class="empty-preview">生成后的国风作品会在此展开</div>
    </div>
    <div v-if="creation.promptUsed" class="prompt-used">{{ creation.promptUsed }}</div>
    <div class="action-row">
      <InkButton :plain="!creation.generatedImage" @click="saveImage">保存图片到画廊</InkButton>
    </div>
  </InkCard>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import InkButton from '@/components/InkButton.vue'
import InkCard from '@/components/InkCard.vue'
import { useCreationStore } from '@/stores/creation'
import { useGalleryStore } from '@/stores/gallery'

const creation = useCreationStore()
const gallery = useGalleryStore()

async function saveImage() {
  if (!creation.generatedImage) {
    ElMessage.warning('请先生成一张作品')
    return
  }
  try {
    await gallery.save({
      image: creation.generatedImage,
      content: creation.content,
      style: creation.style,
      prompt: creation.promptUsed || creation.prompt,
    })
    ElMessage.success('已保存到个人画廊')
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败，请先确认已登录')
  }
}
</script>
