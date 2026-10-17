// Negozi vicini da OpenStreetMap (R8). Una sola query al check-in, timeout 8 s, cache per zona.

export interface ShopSuggestion {
  osmId: string
  nome: string
  lat: number
  lng: number
  tipo: string
  distanza: number
}

import { distanceM } from './geo'

const ENDPOINT = 'https://overpass-api.de/api/interpreter'
const RADIUS_M = 60
const TIMEOUT_MS = 8_000
const CACHE_KEY = 'sm-overpass-cache'
const CACHE_TTL_MS = 7 * 24 * 3600 * 1000

type CacheEntry = { at: number; shops: Omit<ShopSuggestion, 'distanza'>[] }

// zona ≈ cella di ~30 m: abbastanza piccola perché il raggio di 60 m resti valido
const cellKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`

function readCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeCache(key: string, entry: CacheEntry) {
  try {
    const all = readCache()
    all[key] = entry
    const keys = Object.keys(all)
    if (keys.length > 200) {
      keys.sort((a, b) => all[a].at - all[b].at).slice(0, keys.length - 200).forEach((k) => delete all[k])
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(all))
  } catch {
    /* storage pieno o bloccato: pazienza */
  }
}

export function buildQuery(lat: number, lng: number): string {
  const around = `(around:${RADIUS_M},${lat},${lng})`
  return `[out:json][timeout:7];(nwr["shop"~"^(convenience|alcohol|supermarket)$"]${around};);out center tags;`
}

export async function nearbyShops(lat: number, lng: number): Promise<ShopSuggestion[]> {
  const key = cellKey(lat, lng)
  const cached = readCache()[key]
  let shops: CacheEntry['shops']
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    shops = cached.shops
  } else {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        body: new URLSearchParams({ data: buildQuery(lat, lng) }),
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Overpass ${res.status}`)
      const json = (await res.json()) as {
        elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]
      }
      shops = json.elements
        .map((el) => {
          const p = el.center ?? (el.lat !== undefined ? { lat: el.lat, lon: el.lon! } : null)
          if (!p) return null
          const tags = el.tags ?? {}
          const nome = tags.name || tags.brand || ''
          if (!nome) return null
          return { osmId: `${el.type}/${el.id}`, nome, lat: p.lat, lng: p.lon, tipo: tags.shop ?? '' }
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
      writeCache(key, { at: Date.now(), shops })
    } finally {
      clearTimeout(timer)
    }
  }
  return shops
    .map((s) => ({ ...s, distanza: Math.round(distanceM({ lat, lng }, s)) }))
    .filter((s) => s.distanza <= RADIUS_M + 15)
    .sort((a, b) => a.distanza - b.distanza)
    .slice(0, 6)
}
