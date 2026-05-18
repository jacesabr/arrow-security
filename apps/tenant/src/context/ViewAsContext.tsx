'use client'
import React, { createContext, useContext, useState } from 'react'

export type ViewAsRole = 'owner' | 'supervisor' | 'guard'

interface ViewAsContextType {
  viewAs: ViewAsRole
  setViewAs: (role: ViewAsRole) => void
  isSimulating: boolean
}

const ViewAsContext = createContext<ViewAsContextType>({
  viewAs: 'owner',
  setViewAs: () => {},
  isSimulating: false,
})

export function ViewAsProvider({ children }: { children: React.ReactNode }) {
  const [viewAs, setViewAs] = useState<ViewAsRole>('owner')
  return (
    <ViewAsContext.Provider value={{ viewAs, setViewAs, isSimulating: viewAs !== 'owner' }}>
      {children}
    </ViewAsContext.Provider>
  )
}

export function useViewAs() {
  return useContext(ViewAsContext)
}
