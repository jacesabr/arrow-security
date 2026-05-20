'use client'
import React from 'react'
import { TourProvider } from './AppTour'

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider>
      {children}
    </TourProvider>
  )
}
