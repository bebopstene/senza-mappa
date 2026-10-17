// Funzione Vercel: proxy verso un router pedonale.
// Con ORS_API_KEY usa OpenRouteService (foot-walking), così la chiave resta sul server.
// Senza chiave ripiega sul router pedonale pubblico di routing.openstreetmap.de (OSRM).

type LngLat = [number, number]

const MAX_WAYPOINTS = 50
const UPSTREAM_TIMEOUT_MS = 15_000

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
  })
}

function validCoords(input: unknown): LngLat[] | null {
  if (!Array.isArray(input) || input.length < 2 || input.length > MAX_WAYPOINTS) return null
  const out: LngLat[] = []
  for (const c of input) {
    if (!Array.isArray(c) || c.length !== 2) return null
    const [lng, lat] = c
    if (typeof lng !== 'number' || typeof lat !== 'number') return null
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
    if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
    out.push([lng, lat])
  }
  return out
}

async function withTimeout(url: string, init: RequestInit = {}): Promise<globalThis.Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function viaOrs(coords: LngLat[], key: string) {
  const res = await withTimeout('https://api.openrouteservice.org/v2/directions/foot-walking/geojson', {
    method: 'POST',
    headers: { Authorization: key, 'content-type': 'application/json', accept: 'application/geo+json' },
    body: JSON.stringify({ coordinates: coords, radiuses: coords.map(() => 350) }),
  })
  if (!res.ok) throw new Error(`ORS ${res.status}`)
  const data = (await res.json()) as {
    features: { geometry: { coordinates: LngLat[] }; properties: { summary: { distance?: number } } }[]
  }
  const f = data.features?.[0]
  if (!f) throw new Error('ORS: nessun percorso')
  return { coordinates: f.geometry.coordinates, distance: f.properties.summary.distance ?? 0, provider: 'ors' }
}

async function viaOsrm(coords: LngLat[]) {
  const path = coords.map(([lng, lat]) => `${lng.toFixed(6)},${lat.toFixed(6)}`).join(';')
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${path}?overview=full&geometries=geojson&continue_straight=false`
  const res = await withTimeout(url, { headers: { 'user-agent': 'senza-mappa (vercel function)' } })
  if (!res.ok) throw new Error(`OSRM ${res.status}`)
  const data = (await res.json()) as {
    code: string
    routes?: { geometry: { coordinates: LngLat[] }; distance: number }[]
  }
  const r = data.routes?.[0]
  if (data.code !== 'Ok' || !r) throw new Error(`OSRM ${data.code}`)
  return { coordinates: r.geometry.coordinates, distance: r.distance, provider: 'osrm' }
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON non valido' }, 400)
  }
  const coords = validCoords((body as { coordinates?: unknown })?.coordinates)
  if (!coords) return json({ error: `servono da 2 a ${MAX_WAYPOINTS} coordinate [lng, lat]` }, 400)

  const key = process.env.ORS_API_KEY
  const errors: string[] = []
  if (key) {
    try {
      return json(await viaOrs(coords, key))
    } catch (e) {
      errors.push(String(e instanceof Error ? e.message : e))
    }
  }
  try {
    return json(await viaOsrm(coords))
  } catch (e) {
    errors.push(String(e instanceof Error ? e.message : e))
  }
  return json({ error: 'router non disponibile', details: errors }, 502)
}

export function GET(): Response {
  return json({ ok: true, provider: process.env.ORS_API_KEY ? 'ors' : 'osrm', maxWaypoints: MAX_WAYPOINTS })
}
