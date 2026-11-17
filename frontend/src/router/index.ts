import { createRouter, createWebHistory } from 'vue-router'
const HomeView = () => import('@/views/HomeView.vue')
const LoginView = () => import('@/views/LoginView.vue')
const CreationView = () => import('@/views/CreationView.vue')
const GalleryView = () => import('@/views/GalleryView.vue')
const HeritageView = () => import('@/views/HeritageView.vue')
const HeritageDetailView = () => import('@/views/HeritageDetailView.vue')
const AgentView = () => import('@/views/AgentView.vue')
const AnimationView = () => import('@/views/AnimationView.vue')
const AdminView = () => import('@/views/AdminView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/login', name: 'login', component: LoginView },
    { path: '/creation', name: 'creation', component: CreationView },
    { path: '/gallery', name: 'gallery', component: GalleryView },
    { path: '/heritage', name: 'heritage', component: HeritageView },
    { path: '/heritage/:type', name: 'heritage-detail', component: HeritageDetailView },
    { path: '/agent', name: 'agent', component: AgentView },
    { path: '/animation', name: 'animation', component: AnimationView },
    { path: '/admin', name: 'admin', component: AdminView },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
