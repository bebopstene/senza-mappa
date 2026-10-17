// Mappa (MapLibre + OpenFreeMap). Si carica solo dopo la chiusura, o per i 30 s di "Mi sono perso".
import { useEffect, useRef, useState } from 'react'
import type { Map as MlMap, Marker, LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Bangla, LngLat, Point } from '../db/schema'

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  kind: 'partenza' | 'arrivo' | 'checkpoint' | 'passante' | 'perso' | 'bangla' | 'qui' | 'archivio'
  label?: string
  title?: string
}

export function markersFromPoints(points: Point[], bangla: Bangla[]): MapMarker[] {
  const order: string[] = []
  const names = new Map(bangla.map((b) => [b.id, b.nome]))
  const out: MapMarker[] = []
  points.forEach((p, i) => {
    const last = i === points.length - 1
    if (p.tipo === 'bangla' && p.banglaId) {
      if (!order.includes(p.banglaId)) order.push(p.banglaId)
      const n = order.indexOf(p.banglaId) + 1
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'bangla', label: String(n), title: names.get(p.banglaId) || `Bangla ${n}` })
    } else if (p.tipo === 'partenza') {
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'partenza', label: 'P', title: 'Partenza' })
    } else if (p.tipo === 'arrivo' || (last && (p.tipo === 'checkpoint' || p.tipo === 'checkpoint-auto'))) {
      // senza punto di arrivo esplicito, l'ultimo punto fa da arrivo
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'arrivo', label: 'A', title: 'Arrivo' })
    } else if (p.tipo === 'passante') {
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'passante', label: '?', title: 'Passante' })
    } else if (p.tipo === 'perso') {
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'perso', label: 'PERSI', title: 'Mi sono perso' })
    } else {
      out.push({ id: p.id, lat: p.lat, lng: p.lng, kind: 'checkpoint', title: p.tipo === 'checkpoint-auto' ? 'Checkpoint automatico' : 'Checkpoint' })
    }
  })
  return out
}

const MUG_SVG = `<svg width="30" height="30" viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="20" width="32" height="38" fill="#F2B230" stroke="#111" stroke-width="5"/><path d="M42 28h7a5 5 0 0 1 5 5v12a5 5 0 0 1-5 5h-7" fill="none" stroke="#111" stroke-width="5"/><path d="M10 20c0-7 4-10 9-10 3-5 11-5 14-1 5-1 9 2 9 7v4z" fill="#fff" stroke="#111" stroke-width="5" stroke-linejoin="round"/></svg>`

function markerEl(m: MapMarker, editable: boolean): HTMLElement {
  const el = document.createElement('div')
  el.title = m.title ?? ''
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', m.title ?? m.kind)
  el.style.cursor = editable ? 'grab' : 'default'
  const base = 'font-family:"Archivo Black",sans-serif;display:flex;align-items:center;justify-content:center;border:3px solid #111;'
  switch (m.kind) {
    case 'bangla':
      el.innerHTML = `<div style="position:relative;width:40px;height:40px;${base}background:#D6D3CB;box-shadow:3px 3px 0 #111">${MUG_SVG}<span style="position:absolute;top:-12px;right:-12px;background:#111;color:#F2B230;min-width:22px;height:22px;font-size:13px;display:flex;align-items:center;justify-content:center;padding:0 3px">${m.label}</span></div>`
      break
    case 'partenza':
    case 'arrivo':
      el.innerHTML = `<div style="width:28px;height:28px;${base}background:#111;color:#D6D3CB;font-size:14px">${m.label}</div>`
      break
    case 'passante':
      el.innerHTML = `<div style="width:20px;height:20px;${base}background:#fff;color:#111;font-size:12px">?</div>`
      break
    case 'perso':
      el.innerHTML = `<div style="transform:rotate(-9deg);border:3px solid #D3121D;color:#D3121D;background:rgba(214,211,203,.9);font-family:'Archivo Black',sans-serif;font-size:13px;padding:1px 5px">PERSI</div>`
      break
    case 'qui':
      el.innerHTML = `<div style="width:26px;height:26px;${base}background:#D3121D;box-shadow:0 0 0 6px rgba(211,18,29,.25)"></div>`
      break
    case 'archivio':
      el.innerHTML = `<div style="width:38px;height:38px;${base}background:#2E4B2F;box-shadow:3px 3px 0 #111">${MUG_SVG}</div>`
      break
    default:
      el.innerHTML = `<div style="width:14px;height:14px;border:3px solid #111;background:#fff"></div>`
  }
  return el
}

export function WalkMap({
  route,
  optimal,
  markers,
  editable = false,
  onMove,
  onMarkerClick,
  className = 'h-[60vh]',
  interactive = true,
  zoom,
}: {
  route?: LngLat[] | null
  optimal?: LngLat[] | null
  markers: MapMarker[]
  editable?: boolean
  onMove?: (id: string, lat: number, lng: number) => void
  onMarkerClick?: (id: string) => void
  className?: string
  interactive?: boolean
  zoom?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const markerRefs = useRef<Marker[]>([])
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const libRef = useRef<typeof import('maplibre-gl') | null>(null)
  const fittedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    let map: MlMap | null = null
    import('maplibre-gl')
      .then((lib) => {
        if (cancelled || !container.current) return
        libRef.current = lib
        const first = markers[0]
        map = new lib.Map({
          container: container.current,
          style: STYLE_URL,
          center: first ? [first.lng, first.lat] : [9.19, 45.4642],
          zoom: zoom ?? 15,
          attributionControl: { compact: false },
          interactive,
          dragRotate: false,
          pitchWithRotate: false,
        })
        map.touchZoomRotate?.disableRotation()
        map.on('load', () => {
          if (!cancelled) setReady(true)
        })
        map.on('error', (e) => console.warn('mappa', e?.error?.message))
        mapRef.current = map
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      markerRefs.current.forEach((m) => m.remove())
      markerRefs.current = []
      map?.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // linee: ottimale nera tratteggiata sotto, percorso come linea metro rossa sopra
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const setLine = (id: string, coords: LngLat[] | null | undefined) => {
      const data = {
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: coords && coords.length >= 2 ? coords : [] },
      }
      const src = map.getSource(id) as { setData?: (d: unknown) => void } | undefined
      if (src?.setData) src.setData(data)
      else map.addSource(id, { type: 'geojson', data })
    }
    setLine('ottimale', optimal)
    setLine('percorso', route)
    if (!map.getLayer('ottimale')) {
      map.addLayer({
        id: 'ottimale',
        type: 'line',
        source: 'ottimale',
        layout: { 'line-cap': 'butt', 'line-join': 'miter' },
        paint: { 'line-color': '#111111', 'line-width': 4, 'line-dasharray': [2, 1.5] },
      })
      map.addLayer({
        id: 'percorso-bordo',
        type: 'line',
        source: 'percorso',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#111111', 'line-width': 13 },
      })
      map.addLayer({
        id: 'percorso',
        type: 'line',
        source: 'percorso',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#D3121D', 'line-width': 8 },
      })
    }
  }, [ready, route, optimal])

  // segnaposto
  useEffect(() => {
    const map = mapRef.current
    const lib = libRef.current
    if (!map || !ready || !lib) return
    markerRefs.current.forEach((m) => m.remove())
    markerRefs.current = markers.map((m) => {
      const el = markerEl(m, editable)
      if (onMarkerClick) el.addEventListener('click', () => onMarkerClick(m.id))
      const mk = new lib.Marker({ element: el, draggable: editable && m.kind !== 'qui' && m.kind !== 'archivio' })
        .setLngLat([m.lng, m.lat])
        .addTo(map)
      if (editable) {
        mk.on('dragend', () => {
          const ll = mk.getLngLat()
          onMove?.(m.id, ll.lat, ll.lng)
        })
      }
      return mk
    })
    if (!fittedRef.current) {
      fittedRef.current = true
      const all: LngLat[] = [...markers.map((m) => [m.lng, m.lat] as LngLat), ...(route ?? []), ...(optimal ?? [])]
      if (all.length >= 2) {
        const lngs = all.map((c) => c[0])
        const lats = all.map((c) => c[1])
        const bounds: LngLatBoundsLike = [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ]
        map.fitBounds(bounds, { padding: 48, maxZoom: 17, duration: 0 })
      } else if (all.length === 1) {
        map.jumpTo({ center: all[0], zoom: zoom ?? 16 })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, markers, editable])

  return (
    <div className={`relative bordo shadow-pieno mappa-grigia bg-cemento ${className}`}>
      <div ref={container} className="absolute inset-0" />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center etichetta text-sm pointer-events-none">
          {failed ? 'MAPPA NON DISPONIBILE OFFLINE' : 'CARICO LA MAPPA…'}
        </div>
      )}
    </div>
  )
}
