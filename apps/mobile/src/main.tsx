import React from 'react'
import { createRoot } from 'react-dom/client'
import { CapacitorUpdater } from '@capgo/capacitor-updater'
import App from './App'

// Tell the updater the current bundle loaded successfully — prevents auto-rollback.
// Must be called before the app becomes interactive.
CapacitorUpdater.notifyAppReady()

/* Ionic CSS */
import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'

import 'mapbox-gl/dist/mapbox-gl.css'
import './theme/variables.css'

const container = document.getElementById('root')!
const root = createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
