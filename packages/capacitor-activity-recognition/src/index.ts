import { registerPlugin } from '@capacitor/core'
import type { ActivityRecognitionPlugin } from './definitions'

const ActivityRecognition = registerPlugin<ActivityRecognitionPlugin>('ActivityRecognition', {
  web: () => import('./web').then((m) => new m.ActivityRecognitionWeb()),
})

export * from './definitions'
export { ActivityRecognition }
