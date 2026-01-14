import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AdminContextState {
  organizationId: string
  setOrganizationId: (organizationId: string) => void
  clear: () => void
}

export const useAdminContextStore = create<AdminContextState>()(
  persist(
    (set) => ({
      organizationId: '',
      setOrganizationId: (organizationId) => set({ organizationId }),
      clear: () => set({ organizationId: '' }),
    }),
    { name: 'visio360-admin-context' }
  )
)

