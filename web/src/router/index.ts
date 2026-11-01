import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import ChatView from '../views/ChatView.vue'
import { useAuthStore } from '../stores/auth'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: LoginView
  },
  {
    path: '/chat',
    name: 'Chat',
    component: ChatView
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.name === 'Chat' && !auth.isAuthenticated) return { name: 'Login' }
  if (to.name === 'Login' && auth.isAuthenticated) return { name: 'Chat' }
})

export default router