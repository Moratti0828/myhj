import { defineStore } from 'pinia'
import * as api from '@/api'
import type { User } from '@/types'

let loginCheckRequest: Promise<void> | null = null

interface AuthState {
  user: User | null
  loading: boolean
  error: string
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    loading: false,
    error: '',
  }),
  getters: {
    isAdmin: (state) => state.user?.role === 'admin',
    isLoggedIn: (state) => Boolean(state.user),
  },
  actions: {
    async checkLogin() {
      if (loginCheckRequest) return loginCheckRequest
      this.loading = true
      this.error = ''
      loginCheckRequest = (async () => {
        try {
          const res = await api.checkLogin()
          this.user = res.logged_in
            ? { username: res.username || '', role: res.role || (res.is_admin ? 'admin' : 'user') }
            : null
        } catch (error) {
          this.error = error instanceof Error ? error.message : '登录状态检查失败'
          this.user = null
        } finally {
          this.loading = false
        }
      })()
      try {
        await loginCheckRequest
      } finally {
        loginCheckRequest = null
      }
    },
    async login(username: string, password: string) {
      this.loading = true
      this.error = ''
      try {
        const res = await api.login({ username, password })
        this.user = { username: res.username || username, role: res.role || (res.is_admin ? 'admin' : 'user') }
        return res
      } catch (error) {
        this.error = error instanceof Error ? error.message : '登录失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async register(payload: { username: string; password: string; email?: string }) {
      this.loading = true
      this.error = ''
      try {
        return await api.register(payload)
      } catch (error) {
        this.error = error instanceof Error ? error.message : '注册失败'
        throw error
      } finally {
        this.loading = false
      }
    },
    async logout() {
      await api.logout()
      this.user = null
    },
  },
})
