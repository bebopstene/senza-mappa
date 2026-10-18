// Funzione Vercel: proxy verso un router pedonale.
// Con ORS_API_KEY usa OpenRouteService (foot-walking), così la chiave resta sul server.
// Senza chiave ripiega sul router pedonale pubblico di routing.openstreetmap.de (OSRM).

type LngLat = [number, number]

const MAX_WAYPOINTS = 50
// una camminata urbana: nessun tratto oltre 8 km, nessun percorso oltre 40 km in tutto
const MAX_SEGMENT_M = 8_000
const MAX_TOTAL_M = 40_000
// limite grezzo per istanza: basta a non fare da proxy gratuito al router pubblico
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 30
const hits = new Map<string, number[]>()
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

function haversine(a: LngLat, b: LngLat): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLng = toRad(b[0] - a[0])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)))
}

function tooFar(coords: LngLat[]): boolean {
  let total = 0
  for (let i = 1; i < coords.length; i++) {
    const d = haversine(coords[i - 1], coords[i])
    if (d > MAX_SEGMENT_M) return true
    total += d
  }
  return total > MAX_TOTAL_M
}

function allowedOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // stessa origine: alcuni browser non mandano Origin sulle POST same-origin
  try {
    const host = new URL(origin).hostname
    const self = new URL(request.url).hostname
    return (
      host === self ||
      host === 'localhost' || // anche capacitor://localhost, l'app iOS
      host === '127.0.0.1' ||
      host === 'senza-mappa.vercel.app' ||
      /^senza-mappa-[a-z0-9-]+\.vercel\.app$/.test(host)
    )
  } catch {
    return false
  }
}

function rateLimited(request: Request): boolean {
  const ip = (request.headers.get('x-forwarded-for') ?? 'anon').split(',')[0].trim()
  const now = Date.now()
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) hits.clear()
  return recent.length > RATE_MAX
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

/** l'app iOS chiama da capacitor://localhost: serve il permesso CORS esplicito */
function withCors(request: Request, res: Response): Response {
  const origin = request.headers.get('origin')
  if (!origin || !allowedOrigin(request)) return res
  try {
    if (new URL(origin).hostname === new URL(request.url).hostname) return res
  } catch {
    return res
  }
  res.headers.set('access-control-allow-origin', origin)
  res.headers.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  res.headers.set('access-control-allow-headers', 'content-type')
  res.headers.set('access-control-max-age', '86400')
  res.headers.append('vary', 'Origin')
  return res
}

export function OPTIONS(request: Request): Response {
  return withCors(request, new Response(null, { status: allowedOrigin(request) ? 204 : 403 }))
}

export async function POST(request: Request): Promise<Response> {
  return withCors(request, await handlePost(request))
}

async function handlePost(request: Request): Promise<Response> {
  if (!allowedOrigin(request)) return json({ error: 'origine non ammessa' }, 403)
  if (!(request.headers.get('content-type') ?? '').includes('application/json')) return json({ error: 'serve application/json' }, 415)
  if (rateLimited(request)) return json({ error: 'troppe richieste, riprova tra un minuto' }, 429)
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'JSON non valido' }, 400)
  }
  const coords = validCoords((body as { coordinates?: unknown })?.coordinates)
  if (!coords) return json({ error: `servono da 2 a ${MAX_WAYPOINTS} coordinate [lng, lat]` }, 400)
  if (tooFar(coords)) return json({ error: 'troppo lontano per una camminata' }, 422)

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
  console.warn('routing fallito', errors)
  return json({ error: 'router non disponibile' }, 502)
}

export function GET(): Response {
  return json({ ok: true, provider: process.env.ORS_API_KEY ? 'ors' : 'osrm', maxWaypoints: MAX_WAYPOINTS })
}
