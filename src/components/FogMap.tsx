// Mappa nella nebbia: durante la camminata la città è coperta e si scopre a quadrati
// solo attorno ai punti già segnati. Niente percorso, niente segnaposto, niente GPS dal vivo.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MlMap } from 'maplibre-gl'
import type { Point } from '../db/schema'
import { WalkMap } from './WalkMap'

/** lato di un quadrato di nebbia, in metri */
export const CELL_M = 120
/** quanti quadrati attorno a ogni punto si scoprono (1 = blocco 3×3) */
export const REVEAL_RADIUS = 1

const M_PER_DEG_LAT = 111_320

export interface FogGrid {
  /** passo in gradi */
  dLat: number
  dLng: number
  /** chiavi "x:y" dei quadrati scoperti */
  cells: Set<string>
}

/** griglia in gradi, con il passo in longitudine calcolato sulla latitudine del primo punto */
export function fogGrid(points: Pick<Point, 'lat' | 'lng'>[]): FogGrid {
  const lat0 = points[0]?.lat ?? 45.46
  const dLat = CELL_M / M_PER_DEG_LAT
  const dLng = CELL_M / (M_PER_DEG_LAT * Math.cos((lat0 * Math.PI) / 180))
  const cells = new Set<string>()
  for (const p of points) {
    const x = Math.floor(p.lng / dLng)
    const y = Math.floor(p.lat / dLat)
    for (let i = -REVEAL_RADIUS; i <= REVEAL_RADIUS; i++) {
      for (let j = -REVEAL_RADIUS; j <= REVEAL_RADIUS; j++) cells.add(`${x + i}:${y + j}`)
    }
  }
  return { dLat, dLng, cells }
}

export function FogMap({ points, onClose }: { points: Point[]; onClose: () => void }) {
  const grid = useMemo(() => fogGrid(points), [points])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [map, setMap] = useState<MlMap | null>(null)

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv || !map) return
    const w = cv.clientWidth
    const h = cv.clientHeight
    const dpr = window.devicePixelRatio || 1
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
    }
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'source-over'
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#111111'
    ctx.fillRect(0, 0, w, h)

    // la griglia si intravede nella nebbia: fa capire che si scopre a quadrati
    const nw = map.unproject([0, 0])
    const se = map.unproject([w, h])
    const x0 = Math.floor(nw.lng / grid.dLng)
    const x1 = Math.ceil(se.lng / grid.dLng)
    const y0 = Math.floor(se.lat / grid.dLat)
    const y1 = Math.ceil(nw.lat / grid.dLat)
    if ((x1 - x0) * (y1 - y0) < 20_000) {
      ctx.strokeStyle = 'rgba(214, 211, 203, 0.09)'
      ctx.lineWidth = 1
      ctx.beginPath()
      for (let x = x0; x <= x1; x++) {
        const px = map.project([x * grid.dLng, nw.lat]).x
        ctx.moveTo(px, 0)
        ctx.lineTo(px, h)
      }
      for (let y = y0; y <= y1; y++) {
        const py = map.project([nw.lng, y * grid.dLat]).y
        ctx.moveTo(0, py)
        ctx.lineTo(w, py)
      }
      ctx.stroke()
    }

    // buchi nella nebbia
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = '#000'
    for (const key of grid.cells) {
      const [x, y] = key.split(':').map(Number)
      const a = map.project([x * grid.dLng, (y + 1) * grid.dLat])
      const b = map.project([(x + 1) * grid.dLng, y * grid.dLat])
      // +1 px per non lasciare fessure tra quadrati vicini
      ctx.fillRect(Math.floor(a.x), Math.floor(a.y), Math.ceil(b.x - a.x) + 1, Math.ceil(b.y - a.y) + 1)
    }
    ctx.globalCompositeOperation = 'source-over'
  }, [map, grid])

  // inquadra la zona scoperta
  useEffect(() => {
    if (!map || grid.cells.size === 0) return
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const key of grid.cells) {
      const [x, y] = key.split(':').map(Number)
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x + 1)
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y + 1)
    }
    map.fitBounds(
      [
        [minX * grid.dLng, minY * grid.dLat],
        [maxX * grid.dLng, maxY * grid.dLat],
      ],
      { padding: 40, maxZoom: 16.5, duration: 0 },
    )
    map.setMinZoom(12)
    map.setMaxZoom(18)
  }, [map, grid])

  useEffect(() => {
    if (!map) return
    draw()
    map.on('move', draw)
    map.on('resize', draw)
    return () => {
      map.off('move', draw)
      map.off('resize', draw)
    }
  }, [map, draw])

  const km2 = (grid.cells.size * CELL_M * CELL_M) / 1_000_000

  return (
    <div className="fixed inset-0 z-30 bg-nero text-cemento flex flex-col safe-top safe-bottom px-4" role="dialog" aria-label="Mappa nella nebbia">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="titolo text-4xl">LA NEBBIA</div>
          <div className="etichetta text-sm mt-1" data-testid="nebbia-scoperto">
            {grid.cells.size} QUADRATI SCOPERTI · {km2.toFixed(2).replace('.', ',')} KM²
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="bordo border-cemento etichetta text-sm min-h-[48px] px-3 shrink-0"
          data-testid="nebbia-chiudi"
        >
          CHIUDI
        </button>
      </div>
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0">
          <WalkMap markers={[]} className="h-full border-cemento shadow-none" onReady={setMap} zoom={15} />
        </div>
        {/* z-[1]: sopra la mappa ma sotto i controlli MapLibre (z-index 2), così l'attribuzione resta leggibile */}
        <canvas ref={canvasRef} className="absolute inset-[3px] z-[1] w-[calc(100%-6px)] h-[calc(100%-6px)] pointer-events-none" aria-hidden />
        {points.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center etichetta text-sm text-center px-6 pointer-events-none">
            ANCORA TUTTO NEBBIA: SEGNATE QUALCHE PUNTO
          </p>
        )}
      </div>
      <p className="text-sm mt-3">Si scopre solo dove avete già segnato un punto. Niente percorso, niente posizione dal vivo.</p>
    </div>
  )
}
