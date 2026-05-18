import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type SimRole = 'guard' | 'supervisor' | 'admin'

interface DevRoleState {
  simRole: SimRole | null  // null = use real JWT role
  setSimRole: (r: SimRole | null) => void
}

export const useDevRole = create<DevRoleState>()(
  persist(
    (set) => ({
      simRole: null,
      setSimRole: (simRole) => set({ simRole }),
    }),
    { name: 'arrow-dev-role' }
  )
)
