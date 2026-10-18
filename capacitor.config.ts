import type { CapacitorConfig } from '@capacitor/cli'

// App iOS privata: la stessa web app dentro una shell nativa (vedi docs/IOS.md)
const config: CapacitorConfig = {
  appId: 'it.senzamappa.app',
  appName: 'Senza Mappa',
  webDir: 'dist',
  backgroundColor: '#111111',
  ios: {
    contentInset: 'never',
    backgroundColor: '#111111',
    // niente zoom e rimbalzi da sito: deve sembrare un'app
    scrollEnabled: true,
  },
  plugins: {
    LocalNotifications: {
      iconColor: '#F2B230',
    },
  },
}

export default config
