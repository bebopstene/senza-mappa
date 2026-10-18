// Export della camminata chiusa: immagine PNG in stile locandina e traccia GPX.
import type { Map as MlMap } from 'maplibre-gl'
import type { LngLat, PointType } from '../db/schema'
import { computeStats, formatDuration, formatKm, type WalkBundle } from './score'
import { isNative, nativeShareFile } from './platform'

const C = {
  cemento: '#D6D3CB',
  nero: '#111111',
  rosso: '#D3121D',
  ambra: '#F2B230',
  schiuma: '#FFFFFF',
}

const TIPO: Record<PointType, string> = {
  partenza: 'PARTENZA',
  checkpoint: 'CHECKPOINT',
  'checkpoint-auto': 'CHECKPOINT AUTO',
  passante: 'PASSANTE',
  bagno: 'BAGNO',
  ingresso: 'ENTRA',
  perso: 'MI SONO PERSO',
  bangla: 'BANGLA',
  arrivo: 'ARRIVO',
}

export function fileBase(b: WalkBundle): string {
  const day = new Date(b.walk.startedAt).toISOString().slice(0, 10)
  const slug = b.walk.nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `senza-mappa-${day}${slug ? '-' + slug : ''}`
}

/** il percorso da esportare: quello calcolato, altrimenti i punti in ordine */
export function exportLine(b: WalkBundle): LngLat[] {
  if (b.walk.percorso && b.walk.percorso.length >= 2) return b.walk.percorso
  return b.points.map((p) => [p.lng, p.lat])
}

const xml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')

const iso = (t: number) => new Date(t).toISOString()

/** traccia GPX 1.1: le tappe come waypoint con l'ora, il percorso come traccia */
export function buildGpx(b: WalkBundle): string {
  const names = new Map(b.bangla.map((x) => [x.id, x.nome]))
  const order: string[] = []
  const wpts = b.points.map((p) => {
    let name = TIPO[p.tipo]
    if (p.tipo === 'ingresso') {
      name = `ENTRA ${b.participants.find((x) => x.id === p.participantId)?.soprannome ?? 'UN GIOCATORE'}`
    }
    if (p.tipo === 'bagno') {
      const bg = b.bagni?.find((x) => x.id === p.bagnoId)
      const extra = [bg?.nome, bg?.gratis === true ? 'GRATIS' : bg?.gratis === false ? 'A PAGAMENTO' : null].filter(Boolean).join(' · ')
      name = `BAGNO${extra ? ` · ${extra}` : ''}`
    }
    if (p.tipo === 'bangla' && p.banglaId) {
      if (!order.includes(p.banglaId)) order.push(p.banglaId)
      const n = order.indexOf(p.banglaId) + 1
      const nome = names.get(p.banglaId)
      name = `BANGLA ${n}${nome ? ` · ${nome}` : ''}`
    }
    return `  <wpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">
    <time>${iso(p.createdAt)}</time>
    <name>${xml(name)}</name>
    <type>${p.tipo}</type>
  </wpt>`
  })
  // con il percorso calcolato le ore esistono solo sulle tappe; senza, la traccia sono i punti con l'ora
  const trkpts =
    b.walk.percorso && b.walk.percorso.length >= 2
      ? b.walk.percorso.map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`)
      : b.points.map((p) => `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}"><time>${iso(p.createdAt)}</time></trkpt>`)
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Senza Mappa" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${xml(b.walk.nome)}</name>
    <time>${iso(b.walk.startedAt)}</time>
  </metadata>
${wpts.join('\n')}
  <trk>
    <name>${xml(b.walk.nome)}</name>
    <trkseg>
${trkpts.join('\n')}
    </trkseg>
  </trk>
</gpx>
`
}

/** condivide il file (su iPhone finisce in Foto/File) o, se non si può, lo scarica */
export async function saveFile(blob: Blob, filename: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (isNative) return nativeShareFile(blob, filename)
  const file = new File([blob], filename, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // altrimenti proviamo a scaricarlo
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  return 'downloaded'
}

// --- immagine ---

const W = 1080
const H = 1350
const PAD = 56
const MAP = { x: PAD, y: 280, w: W - PAD * 2, h: 800 }

function waitIdle(map: MlMap, ms = 8000): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms)
    map.once('idle', () => {
      clearTimeout(t)
      resolve()
    })
  })
}

/** il buffer WebGL si legge solo dentro l'evento render */
function grabMap(map: MlMap): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    map.once('render', () => {
      const src = map.getCanvas()
      const copy = document.createElement('canvas')
      copy.width = src.width
      copy.height = src.height
      copy.getContext('2d')!.drawImage(src, 0, 0)
      resolve(copy)
    })
    map.triggerRepaint()
  })
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= maxW || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, '') + '…'
    return kept
  }
  return lines
}

function box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, shadow = 0, border = C.nero, line = 4) {
  if (shadow) {
    ctx.fillStyle = C.nero
    ctx.fillRect(x + shadow, y + shadow, w, h)
  }
  ctx.fillStyle = fill
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = border
  ctx.lineWidth = line
  ctx.strokeRect(x + line / 2, y + line / 2, w - line, h - line)
}

export async function renderPoster(map: MlMap, b: WalkBundle): Promise<Blob> {
  await document.fonts?.ready
  // per lo scatto la mappa prende le proporzioni del riquadro, così il ritaglio non taglia partenza e arrivo
  const el = map.getContainer()
  const prev = el.getAttribute('style') ?? ''
  const width = el.clientWidth
  el.style.bottom = 'auto'
  el.style.height = `${Math.round((width * MAP.h) / MAP.w)}px`
  map.resize()
  try {
    return await drawPoster(map, b)
  } finally {
    el.setAttribute('style', prev)
    map.resize()
  }
}

async function drawPoster(map: MlMap, b: WalkBundle): Promise<Blob> {
  // tutto il giro nell'inquadratura, poi aspettiamo che le tessere siano caricate
  const line = exportLine(b)
  const all: LngLat[] = [...line, ...b.points.map((p) => [p.lng, p.lat] as LngLat)]
  if (all.length >= 2) {
    const lngs = all.map((c) => c[0])
    const lats = all.map((c) => c[1])
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 40, maxZoom: 17, duration: 0 },
    )
  }
  await waitIdle(map)
  const shot = await grabMap(map)

  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!

  ctx.fillStyle = C.cemento
  ctx.fillRect(0, 0, W, H)

  // titolo
  ctx.fillStyle = C.nero
  ctx.textBaseline = 'alphabetic'
  ctx.font = "84px 'Archivo Black', sans-serif"
  const title = wrap(ctx, b.walk.nome.toUpperCase(), W - PAD * 2, 2)
  title.forEach((t, i) => ctx.fillText(t, PAD, 120 + i * 78))
  ctx.font = "700 26px 'Space Mono', monospace"
  const date = new Date(b.walk.startedAt)
    .toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase()
  ctx.fillText(date, PAD, 120 + (title.length - 1) * 78 + 52)

  // mappa ritagliata "a riempimento" nel riquadro
  const cssW = map.getCanvas().clientWidth || shot.width
  const cssH = map.getCanvas().clientHeight || shot.height
  const scale = Math.max(MAP.w / cssW, MAP.h / cssH)
  const ox = MAP.x + (MAP.w - cssW * scale) / 2
  const oy = MAP.y + (MAP.h - cssH * scale) / 2
  ctx.fillStyle = C.nero
  ctx.fillRect(MAP.x + 12, MAP.y + 12, MAP.w, MAP.h)
  ctx.save()
  ctx.beginPath()
  ctx.rect(MAP.x, MAP.y, MAP.w, MAP.h)
  ctx.clip()
  ctx.fillStyle = C.cemento
  ctx.fillRect(MAP.x, MAP.y, MAP.w, MAP.h)
  ctx.drawImage(shot, ox, oy, cssW * scale, cssH * scale)

  // segnaposto (nella mappa sono elementi HTML, qui li ridisegniamo)
  const at = (lng: number, lat: number) => {
    const p = map.project([lng, lat])
    return { x: ox + p.x * scale, y: oy + p.y * scale }
  }
  const order: string[] = []
  const last = b.points.length - 1
  const draw: { z: number; fn: () => void }[] = []
  b.points.forEach((p, i) => {
    const { x, y } = at(p.lng, p.lat)
    if (p.tipo === 'bangla' && p.banglaId) {
      if (!order.includes(p.banglaId)) order.push(p.banglaId)
      const n = String(order.indexOf(p.banglaId) + 1)
      draw.push({
        z: 3,
        fn: () => {
          box(ctx, x - 24, y - 24, 48, 48, C.ambra, 5)
          ctx.fillStyle = C.nero
          ctx.font = "28px 'Archivo Black', sans-serif"
          ctx.textAlign = 'center'
          ctx.fillText(n, x, y + 10)
          ctx.textAlign = 'left'
        },
      })
    } else if (p.tipo === 'partenza' || p.tipo === 'arrivo' || (i === last && p.tipo !== 'perso')) {
      const label = p.tipo === 'partenza' ? 'P' : 'A'
      draw.push({
        z: 4,
        fn: () => {
          box(ctx, x - 22, y - 22, 44, 44, C.nero, 0)
          ctx.fillStyle = C.cemento
          ctx.font = "24px 'Archivo Black', sans-serif"
          ctx.textAlign = 'center'
          ctx.fillText(label, x, y + 9)
          ctx.textAlign = 'left'
        },
      })
    } else if (p.tipo === 'perso') {
      draw.push({
        z: 5,
        fn: () => {
          ctx.save()
          ctx.translate(x, y)
          ctx.rotate((-9 * Math.PI) / 180)
          ctx.font = "22px 'Archivo Black', sans-serif"
          const tw = ctx.measureText('PERSI').width
          box(ctx, -tw / 2 - 10, -18, tw + 20, 36, C.cemento, 0, C.rosso)
          ctx.fillStyle = C.rosso
          ctx.fillText('PERSI', -tw / 2, 8)
          ctx.restore()
        },
      })
    } else if (p.tipo === 'ingresso') {
      const nome = b.participants.find((x) => x.id === p.participantId)?.soprannome ?? ''
      const ora = new Date(p.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
      const label = `+${nome} ${ora}`
      draw.push({
        z: 2,
        fn: () => {
          ctx.font = "18px 'Archivo Black', sans-serif"
          const tw = ctx.measureText(label).width
          box(ctx, x - tw / 2 - 10, y - 17, tw + 20, 34, C.schiuma, 4)
          ctx.fillStyle = C.nero
          ctx.fillText(label, x - tw / 2, y + 7)
        },
      })
    } else if (p.tipo === 'bagno') {
      draw.push({
        z: 2,
        fn: () => {
          box(ctx, x - 22, y - 16, 44, 32, '#2E4B2F', 0)
          ctx.fillStyle = C.schiuma
          ctx.font = "16px 'Archivo Black', sans-serif"
          ctx.textAlign = 'center'
          ctx.fillText('WC', x, y + 6)
          ctx.textAlign = 'left'
        },
      })
    } else {
      const q = p.tipo === 'passante'
      draw.push({
        z: 1,
        fn: () => {
          const s = q ? 30 : 20
          box(ctx, x - s / 2, y - s / 2, s, s, C.schiuma, 0, C.nero, 4)
          if (q) {
            ctx.fillStyle = C.nero
            ctx.font = "18px 'Archivo Black', sans-serif"
            ctx.textAlign = 'center'
            ctx.fillText('?', x, y + 7)
            ctx.textAlign = 'left'
          }
        },
      })
    }
  })
  draw.sort((a, z) => a.z - z.z).forEach((d) => d.fn())
  ctx.restore()
  ctx.strokeStyle = C.nero
  ctx.lineWidth = 6
  ctx.strokeRect(MAP.x + 3, MAP.y + 3, MAP.w - 6, MAP.h - 6)

  // attribuzione obbligatoria
  ctx.font = "16px 'Space Mono', monospace"
  const attr = '© OpenFreeMap © OpenMapTiles © OpenStreetMap'
  const aw = ctx.measureText(attr).width
  ctx.fillStyle = 'rgba(214,211,203,0.9)'
  ctx.fillRect(MAP.x + MAP.w - aw - 22, MAP.y + MAP.h - 34, aw + 16, 28)
  ctx.fillStyle = C.nero
  ctx.fillText(attr, MAP.x + MAP.w - aw - 14, MAP.y + MAP.h - 14)

  // statistiche
  const st = computeStats(b)
  const cells: [string, string][] = [
    [formatKm(st.metri), 'DISTANZA'],
    [formatDuration(st.durataMs), 'DURATA'],
    [String(st.bangla), 'BANGLA'],
  ]
  const cy = MAP.y + MAP.h + 44
  const cw = (W - PAD * 2) / 3
  cells.forEach(([v, l], i) => {
    const x = PAD + i * cw
    box(ctx, x, cy, cw + (i < 2 ? 4 : 0), 130, C.cemento, 0)
    ctx.fillStyle = C.nero
    ctx.font = "48px 'Archivo Black', sans-serif"
    ctx.fillText(v, x + 22, cy + 66, cw - 40)
    ctx.font = "700 22px 'Space Mono', monospace"
    ctx.fillText(l, x + 22, cy + 106)
  })

  // timbro in basso
  ctx.save()
  ctx.translate(W - PAD - 130, 1306)
  ctx.rotate((-7 * Math.PI) / 180)
  ctx.font = "24px 'Archivo Black', sans-serif"
  const stamp = 'SENZA MAPPA'
  const sw = ctx.measureText(stamp).width
  ctx.strokeStyle = C.rosso
  ctx.lineWidth = 5
  ctx.strokeRect(-sw / 2 - 14, -26, sw + 28, 44)
  ctx.fillStyle = C.rosso
  ctx.fillText(stamp, -sw / 2, 6)
  ctx.restore()

  return new Promise((resolve, reject) => cv.toBlob((bl) => (bl ? resolve(bl) : reject(new Error('immagine vuota'))), 'image/png'))
}
