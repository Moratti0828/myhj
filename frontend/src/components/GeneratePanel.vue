<template>
  <InkCard title="意境描述" subtitle="写下画面、光影、情绪和纹样">
    <el-input v-model="creation.prompt" type="textarea" :rows="5" resize="none" placeholder="例如：雨后江南小桥，金粉云纹，水墨晕染..." />
    <el-input v-model="creation.negative" class="mt" placeholder="负向提示词" />
    <div class="action-row">
      <InkButton plain @click="creation.captionSketch()">草图识别</InkButton>
      <InkButton @click="creation.run('generate')">AI 丹青生图</InkButton>
      <InkButton plain @click="creation.run('enhance')">智能补全 / 精修</InkButton>
    </div>
    <p v-if="creation.error" class="error-text">{{ creation.error }}</p>
    <ProgressStream :items="creation.progress" />
  </InkCard>
</template>

<script setup lang="ts">
import { ElInput } from 'element-plus'
import 'element-plus/es/components/input/style/css'
import InkButton from '@/components/InkButton.vue'
import InkCard from '@/components/InkCard.vue'
import ProgressStream from '@/components/ProgressStream.vue'
import { useCreationStore } from '@/stores/creation'

const creation = useCreationStore()
</script>
