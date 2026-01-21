import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AdminContextState {
  organizationId: string
  setOrganizationId: (organizationId: string) => void
  clear: () => void
}

// Avoid Node's server-side WebStorage/localStorage warnings during Next build/prerender.
const noopStorage = {
  getItem: (_name: string) => null,
  setItem: (_name: string, _value: string) => {},
  removeItem: (_name: string) => {},
  clear: () => {},
  key: (_index: number) => null,
  length: 0,
} as unknown as Storage

export const useAdminContextStore = create<AdminContextState>()(
  persist(
    (set) => ({
      organizationId: '',
      setOrganizationId: (organizationId) => set({ organizationId }),
      clear: () => set({ organizationId: '' }),
    }),
    {
      name: 'visio360-admin-context',
      storage: createJSONStorage(() => (typeof window !== 'undefined' ? window.localStorage : noopStorage)),
    }
  )
)

