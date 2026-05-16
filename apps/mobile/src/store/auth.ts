import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@secureops/shared'

interface AuthState {
  token: string | null
  user: User | null
  tenantSlug: string | null
  setAuth: (token: string, user: User, tenantSlug?: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      tenantSlug: null,
      setAuth: (token, user, tenantSlug) => set({ token, user, tenantSlug: tenantSlug ?? null }),
      logout: () => set({ token: null, user: null, tenantSlug: null }),
    }),
    { name: 'auth-storage' }
  )
)
