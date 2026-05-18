'use client'
import React from 'react'
import { ViewAsProvider, useViewAs } from '../context/ViewAsContext'
import { TourProvider, TourTrigger } from './AppTour'

function SimulationBanner() {
  const { viewAs, setViewAs, isSimulating } = useViewAs()
  if (!isSimulating) return null
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: '#c96442',
      color: 'white',
      padding: '6px 16px',
      textAlign: 'center',
      fontSize: 13,
      fontWeight: 600,
    }}>
      Simulation mode — viewing as {viewAs} ·{' '}
      <button
        onClick={() => setViewAs('owner')}
        style={{
          background: 'none',
          border: 'none',
          color: 'white',
          cursor: 'pointer',
          textDecoration: 'underline',
          fontSize: 13,
          fontWeight: 600,
          padding: 0,
        }}
      >
        Exit
      </button>
    </div>
  )
}

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <TourProvider>
      <ViewAsProvider>
        <SimulationBanner />
        {children}
      </ViewAsProvider>
      <TourTrigger />
    </TourProvider>
  )
}
