// Posizione e controllo precisione (R7, R27). Nessun tracciamento continuo:
// la posizione si legge solo al tap o quando l'app torna in primo piano.

export interface Fix {
  lat: number
  lng: number
  accuracy: number
  at: number
}

export const ACCURACY_LIMIT_M = 50
export const MIN_SCORING_DISTANCE_M = 200
export const SAME_BANGLA_RADIUS_M = 40

export class GeoError extends Error {
  code: 'denied' | 'unavailable' | 'timeout' | 'unsupported'
  constructor(code: GeoError['code'], message: string) {
    super(message)
    this.code = code
  }
}

/**
 * Legge la posizione per al massimo `maxMs` e restituisce la lettura più precisa.
 * Si ferma prima se arriva una lettura entro `goodEnoughM`.
 */
export function getBestFix(
  opts: { maxMs?: number; goodEnoughM?: number; onProgress?: (best: Fix | null) => void } = {},
): Promise<Fix> {
  const maxMs = opts.maxMs ?? 10_000
  const goodEnough = opts.goodEnoughM ?? 15
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new GeoError('unsupported', 'Questo browser non dà la posizione'))
      return
    }
    let best: Fix | null = null
    let done = false
    let watchId: number | null = null

    const finish = (err?: GeoError) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (best) resolve(best)
      else reject(err ?? new GeoError('timeout', 'Il GPS non risponde'))
    }

    const timer = setTimeout(() => finish(), maxMs)

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const fix: Fix = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          at: Date.now(),
        }
        if (!best || fix.accuracy < best.accuracy) {
          best = fix
          opts.onProgress?.(best)
        }
        if (fix.accuracy <= goodEnough) finish()
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) finish(new GeoError('denied', 'Permesso posizione negato'))
        else if (err.code === err.TIMEOUT) {
          // watchPosition può dare timeout parziali: continuiamo fino a maxMs
        } else if (!best) {
          // POSITION_UNAVAILABLE: aspettiamo, magari si riaggancia entro maxMs
        }
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs },
    )
  })
}

const R = 6_371_000
const toRad = (d: number) => (d * Math.PI) / 180

/** distanza in metri tra due punti (haversine) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** lunghezza di una linea [lng, lat][] in metri */
export function lineLengthM(coords: [number, number][]): number {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    total += distanceM(
      { lng: coords[i - 1][0], lat: coords[i - 1][1] },
      { lng: coords[i][0], lat: coords[i][1] },
    )
  }
  return total
}

export async function permissionState(): Promise<PermissionState | 'unknown'> {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return p.state
  } catch {
    return 'unknown'
  }
}
