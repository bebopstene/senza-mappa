// Web o app iOS (Capacitor)? Qui stanno le differenze: nel resto del codice si chiamano
// queste funzioni e non i plugin direttamente, così il sito resta identico a prima.
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { LocalNotifications } from '@capacitor/local-notifications'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { StatusBar, Style } from '@capacitor/status-bar'

export const isNative = Capacitor.isNativePlatform()

/** indirizzo pubblico: nell'app la pagina gira su capacitor://localhost */
export const PUBLIC_URL = 'https://senza-mappa.vercel.app'
/** base delle API: relativa sul sito, assoluta nell'app */
export const API_BASE = isNative ? PUBLIC_URL : ''

// --- barra di stato: testo chiaro sulle schermate nere (camminata), scuro sul cemento ---

export function nativeStatusBar(dark: boolean) {
  if (!isNative) return
  void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
}

// --- vibrazione vera (Taptic Engine) ---

export function nativeTap() {
  void Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
}

/** sequenza "allarme" per i promemoria; un numero breve = tap, un array = avviso */
export function nativeVibrate(pattern: number | number[]) {
  if (Array.isArray(pattern) || pattern > 100) void Haptics.notification({ type: NotificationType.Warning }).catch(() => {})
  else nativeTap()
}

// --- schermo acceso ---

export async function nativeKeepAwake(on: boolean): Promise<boolean> {
  try {
    if (on) await KeepAwake.keepAwake()
    else await KeepAwake.allowSleep()
    return true
  } catch {
    return false
  }
}

// --- promemoria checkpoint anche a schermo spento (notifiche locali) ---

const REMINDER_IDS = [101, 102, 103, 104]

export async function askNotificationPermission(): Promise<boolean> {
  if (!isNative) return false
  try {
    const p = await LocalNotifications.checkPermissions()
    if (p.display === 'granted') return true
    return (await LocalNotifications.requestPermissions()).display === 'granted'
  } catch {
    return false
  }
}

/**
 * Programma i promemoria a partire dall'ultimo punto: dopo N, 2N, 3N, 4N minuti.
 * Si richiama a ogni punto segnato, così il conto riparte.
 */
export async function scheduleCheckpointReminders(lastAt: number, minutes: number): Promise<void> {
  if (!isNative) return
  try {
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) })
    if (!minutes) return
    const now = Date.now()
    const notifications = REMINDER_IDS.map((id, i) => {
      const at = lastAt + minutes * 60_000 * (i + 1)
      return {
        id,
        title: 'CHECKPOINT?',
        body: `${minutes * (i + 1)} minuti dall’ultimo punto. Segnate dove siete.`,
        schedule: { at: new Date(Math.max(at, now + 5_000)), allowWhileIdle: true },
      }
    }).filter((n) => n.schedule.at.getTime() > now)
    if (notifications.length) await LocalNotifications.schedule({ notifications })
  } catch {
    /* senza permesso niente notifiche: resta il promemoria a schermo */
  }
}

export async function cancelCheckpointReminders(): Promise<void> {
  if (!isNative) return
  try {
    await LocalNotifications.cancel({ notifications: REMINDER_IDS.map((id) => ({ id })) })
  } catch {
    /* niente da cancellare */
  }
}

// --- salvare e condividere file (immagine, GPX) ---

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })

/** scrive il file nella cache dell'app e apre il foglio di condivisione di iOS (Salva immagine, File, WhatsApp…) */
export async function nativeShareFile(blob: Blob, filename: string): Promise<'shared' | 'cancelled'> {
  const isText = blob.type.startsWith('text/') || blob.type.includes('xml') || blob.type.includes('json')
  const res = await Filesystem.writeFile({
    path: filename,
    directory: Directory.Cache,
    data: isText ? await blob.text() : await toBase64(blob),
    encoding: isText ? Encoding.UTF8 : undefined,
  })
  try {
    await Share.share({ title: filename, files: [res.uri] })
    return 'shared'
  } catch {
    return 'cancelled'
  }
}

export async function nativeShareUrl(url: string, title: string): Promise<boolean> {
  try {
    await Share.share({ title, url })
    return true
  } catch {
    return false
  }
}

// --- plugin locale dell'app (ios/App/App/SenzaMappaPlugin.swift): Live Activity e Siri ---

export type ShortcutAction = 'checkpoint' | 'bangla'

interface SenzaMappaPlugin {
  liveUpdate(o: LiveWalk): Promise<{ active: boolean }>
  liveEnd(): Promise<void>
  takeShortcut(): Promise<{ action?: string; at?: number }>
  addListener(event: 'shortcut', fn: () => void): Promise<PluginListenerHandle>
}

const SenzaMappa = registerPlugin<SenzaMappaPlugin>('SenzaMappa')

export interface LiveWalk {
  walkId: string
  name: string
  startedAt: number
  bangla: number
  checkpoint: number
  lastPointAt: number
}

/** Live Activity su schermata di blocco e Dynamic Island: tempo e contatori, mai la posizione (R4) */
export function liveWalkUpdate(w: LiveWalk) {
  if (!isNative) return
  void SenzaMappa.liveUpdate(w).catch(() => {})
}

export function liveWalkEnd() {
  if (!isNative) return
  void SenzaMappa.liveEnd().catch(() => {})
}

/** un comando Siri vecchio (app aperta senza camminata) non deve scattare alla prossima */
const SHORTCUT_MAX_AGE_MS = 2 * 60_000

/** Siri / Comandi / tasto Azione: chiama fn con l'azione chiesta, anche se ha aperto l'app da chiusa */
export function onShortcut(fn: (a: ShortcutAction) => void): () => void {
  if (!isNative) return () => {}
  const take = async () => {
    try {
      const r = await SenzaMappa.takeShortcut()
      if ((r.action === 'checkpoint' || r.action === 'bangla') && Date.now() - (r.at ?? 0) < SHORTCUT_MAX_AGE_MS) fn(r.action)
    } catch {
      /* app senza plugin: niente scorciatoie */
    }
  }
  void take()
  const handle = SenzaMappa.addListener('shortcut', () => void take()).catch(() => null)
  return () => void handle.then((h) => h?.remove())
}
