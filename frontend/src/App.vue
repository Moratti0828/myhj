<template>
  <div class="app-shell">
    <div class="ink-particles" aria-hidden="true"></div>
    <header v-if="!isStandalonePage" class="app-header">
      <RouterLink class="logo" to="/">
        <img class="logo-img" :src="logoUrl" alt="墨韵画境" />
        <span>墨韵画境</span>
      </RouterLink>
      <nav class="main-nav">
        <RouterLink to="/creation">创作</RouterLink>
        <RouterLink to="/animation">AIGC动画</RouterLink>
        <RouterLink to="/heritage">非遗文化</RouterLink>
        <RouterLink to="/gallery">我的画廊</RouterLink>
        <RouterLink to="/agent">非遗书童</RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin">管理</RouterLink>
        <RouterLink v-if="!auth.user" to="/login">登录</RouterLink>
        <button v-else class="nav-button" type="button" @click="auth.logout()">{{ auth.user.username }} · 退出</button>
      </nav>
    </header>

    <main class="page-frame" :class="{ 'page-frame--standalone': isStandalonePage }">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const logoUrl = '/image/logo.png'
const standaloneRoutes = new Set(['home', 'login', 'heritage-detail'])
const isStandalonePage = computed(() => standaloneRoutes.has(String(route.name)))

onMounted(() => {
  auth.checkLogin()
})
</script>
