<template>
  <section class="login-original-page">
    <div class="login-original-shell">
      <aside class="login-original-art">
        <span class="login-original-badge">国风创作平台</span>
        <h1>墨韵画境</h1>
        <p>在宣纸般的创作空间里，以几笔草图开启一幅 AI 国风画卷。</p>
        <ul class="login-original-bullets">
          <li>草图上手快，创作门槛低</li>
          <li>水墨、敦煌、青花等风格融合</li>
          <li>作品可沉淀到个人画廊</li>
        </ul>
        <div class="login-original-seal">印</div>
      </aside>

      <div class="login-original-form-panel">
        <img class="login-original-logo" :src="'/image/logo.png'" alt="墨韵画境" />
        <h2>账号中心</h2>
        <p>登录后继续你的国风创作</p>

        <div class="login-original-tabs">
          <button :class="{ active: mode === 'login' }" type="button" @click="mode = 'login'">登录</button>
          <button :class="{ active: mode === 'register' }" type="button" @click="mode = 'register'">注册</button>
        </div>

        <form class="login-original-form" @submit.prevent="submit">
          <label>
            <span>用户名</span>
            <input v-model.trim="form.username" autocomplete="username" placeholder="请输入用户名" required />
          </label>
          <label v-if="mode === 'register'">
            <span>邮箱</span>
            <input v-model.trim="form.email" autocomplete="email" placeholder="用于找回与通知，可选" />
          </label>
          <label>
            <span>密码</span>
            <input v-model="form.password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
          </label>
          <button class="login-original-submit" type="submit" :disabled="auth.loading">
            {{ auth.loading ? '请稍候...' : mode === 'login' ? '登录' : '注册' }}
          </button>
        </form>

        <p v-if="auth.error" class="login-original-error">{{ auth.error }}</p>
        <RouterLink class="login-original-back" to="/">返回首页</RouterLink>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const form = reactive({ username: '', password: '', email: '' })

async function submit() {
  if (mode.value === 'register') {
    await auth.register(form)
    ElMessage.success('注册成功，请登录')
    mode.value = 'login'
    return
  }
  await auth.login(form.username, form.password)
  ElMessage.success('登录成功')
  router.push('/creation')
}
</script>
