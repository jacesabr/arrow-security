import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.secureops.guard',
  appName: 'SecureOps Guard',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorUpdater: {
      updateUrl: 'https://arrow-security-api.onrender.com/api/app-update',
      statsUrl: '',        // disable Capgo cloud telemetry
      autoUpdate: true,
      resetWhenUpdate: false,
    },
    SplashScreen: {
      launchShowDuration: 0,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Geolocation: {
      androidExtraPermissions: ['ACCESS_BACKGROUND_LOCATION'],
    },
  },
}

export default config
