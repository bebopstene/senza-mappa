// Feedback al tap e promemoria (R9, R21). iOS non supporta la vibrazione dal web:
// lì si usano flash a schermo e un suono breve. Nell'app nativa si usa il Taptic Engine.
import { isNative, nativeKeepAwake, nativeTap, nativeVibrate } from './platform'

export const canVibrate = (): boolean =>
  isNative || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && !isIOS())

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function vibrate(pattern: number | number[]): boolean {
  if (!canVibrate()) return false
  if (isNative) {
    nativeVibrate(pattern)
    return true
  }
  try {
    return navigator.vibrate(pattern)
  } catch {
    return false
  }
}

let audioCtx: AudioContext | null = null

/** va chiamato dentro un gesto dell'utente: iOS sblocca l'audio solo così */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      audioCtx = new Ctx()
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch {
    /* niente audio */
  }
}

export function beep(durationMs = 180, freq = 880) {
  try {
    if (!audioCtx) return
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'square'
    osc.frequency.value = freq
    gain.gain.value = 0.08
    osc.connect(gain).connect(audioCtx.destination)
    const t = audioCtx.currentTime
    osc.start(t)
    osc.stop(t + durationMs / 1000)
  } catch {
    /* niente audio */
  }
}

/** feedback leggero a ogni tap: vibrazione su Android, il flash lo fa il pulsante */
export function tapFeedback() {
  if (isNative) nativeTap()
  else vibrate(15)
}

// --- Schermo acceso (Screen Wake Lock API) ---

let sentinel: WakeLockSentinel | null = null
let wanted = false

export const wakeLockSupported = () => isNative || (typeof navigator !== 'undefined' && 'wakeLock' in navigator)

export async function setWakeLock(on: boolean): Promise<boolean> {
  wanted = on
  if (isNative) return nativeKeepAwake(on)
  if (!wakeLockSupported()) return false
  try {
    if (on && !sentinel) {
      sentinel = await navigator.wakeLock.request('screen')
      sentinel.addEventListener('release', () => {
        sentinel = null
      })
    } else if (!on && sentinel) {
      await sentinel.release()
      sentinel = null
    }
    return true
  } catch {
    return false
  }
}

// il blocco cade quando la pagina va in background: lo riprendiamo al ritorno
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!isNative && document.visibilityState === 'visible' && wanted && !sentinel) void setWakeLock(true)
  })
}
