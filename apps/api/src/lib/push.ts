import 'firebase-admin/app'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

let initialized = false

function getApp() {
  if (!initialized && process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
      if (!getApps().length) initializeApp({ credential: cert(sa) })
      initialized = true
    } catch { /* misconfigured — skip */ }
  }
}

export async function sendPush(tokens: string[], title: string, body: string, data?: Record<string, string>): Promise<void> {
  if (!tokens.length) return
  getApp()
  if (!initialized) return
  try {
    await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data })
  } catch { /* never break caller */ }
}
