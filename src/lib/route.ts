// Percorso a piedi tra i punti (R5) e percorso ottimale (R28).
// Il router accetta un numero limitato di waypoint: con molti punti si calcola a tratti e si unisce.

import type { LngLat } from '../db/schema'
import { distanceM, lineLengthM } from './geo'
import { API_BASE } from './platform'

export const CHUNK_SIZE = 25

export interface RouteResult {
  coordinates: LngLat[]
  meters: number
  tipo: 'strade' | 'dritte'
}

export class OfflineError extends Error {}

/** toglie i punti consecutivi quasi uguali, che mandano in errore i router */
export function dedupe(coords: LngLat[], minM = 5): LngLat[] {
  const out: LngLat[] = []
  for (const c of coords) {
    const prev = out[out.length - 1]
    if (prev && distanceM({ lng: prev[0], lat: prev[1] }, { lng: c[0], lat: c[1] }) < minM) continue
    out.push(c)
  }
  return out
}

/** spezza i waypoint in tratti che si sovrappongono di un punto */
export function chunk(coords: LngLat[], size = CHUNK_SIZE): LngLat[][] {
  if (coords.length <= size) return [coords]
  const out: LngLat[][] = []
  for (let i = 0; i < coords.length - 1; i += size - 1) {
    out.push(coords.slice(i, Math.min(i + size, coords.length)))
  }
  return out
}

async function routeChunk(coords: LngLat[]): Promise<{ coordinates: LngLat[]; distance: number }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20_000)
  try {
    const res = await fetch(`${API_BASE}/api/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ coordinates: coords }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`route ${res.status}`)
    const data = (await res.json()) as { coordinates: LngLat[]; distance: number }
    if (!Array.isArray(data.coordinates) || data.coordinates.length < 2) throw new Error('percorso vuoto')
    return data
  } finally {
    clearTimeout(t)
  }
}

/**
 * Collega i punti in ordine con un percorso pedonale.
 * Se il servizio fallisce su un tratto, quel tratto diventa una linea dritta.
 * Se il telefono è offline lancia OfflineError: la camminata resta "da calcolare".
 */
export async function computeRoute(points: LngLat[]): Promise<RouteResult> {
  const coords = dedupe(points)
  if (coords.length < 2) {
    return { coordinates: coords.length ? [coords[0], coords[0]] : [], meters: 0, tipo: 'strade' }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError('offline')

  const parts = chunk(coords)
  const merged: LngLat[] = []
  let meters = 0
  let anyFailed = false
  for (const part of parts) {
    let seg: LngLat[]
    let segM: number
    try {
      const r = await routeChunk(part)
      seg = r.coordinates
      segM = r.distance || lineLengthM(seg)
    } catch (e) {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new OfflineError('offline')
      anyFailed = true
      seg = part
      segM = lineLengthM(part)
      console.warn('routing fallito, linee dritte per questo tratto', e)
    }
    if (merged.length) seg = seg.slice(1)
    merged.push(...seg)
    meters += segM
  }
  return { coordinates: merged, meters: Math.round(meters), tipo: anyFailed ? 'dritte' : 'strade' }
}

/** percorso più breve tra partenza e arrivo (R28) */
export async function computeOptimal(start: LngLat, end: LngLat): Promise<RouteResult> {
  return computeRoute([start, end])
}
