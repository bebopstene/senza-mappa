// Punteggio finale (R26) e statistiche (R12). Non si salva mai: si ricalcola dai dati.
// Le birre contano solo nel riepilogo: valgono zero punti.

import type { Award, Bangla, Drink, Participant, Point, Review, Walk } from '../db/schema'
import { distanceM, lineLengthM, MIN_SCORING_DISTANCE_M } from './geo'

export const WEIGHTS = {
  bangla: 10,
  banglaNuovo: 5,
  passante: 5,
  passantePersonale: 5,
  checkpoint: 2,
  perKm: 3,
  perso: -15,
} as const

export interface WalkBundle {
  walk: Walk
  participants: Participant[]
  points: Point[]
  bangla: Bangla[]
  drinks: Drink[]
  reviews: Review[]
  awards: Award[]
  /** bangla di questa camminata mai visitati prima dal gruppo */
  newBanglaIds: string[]
}

export interface ScoreLine {
  voce: string
  quantita: number
  punti: number
}

export interface PersonScore {
  participantId: string
  soprannome: string
  punti: number
  domande: number
  birre: number
  titoli: string[]
}

export interface Score {
  squadra: number
  righe: ScoreLine[]
  persone: PersonScore[]
}

export const sortedPoints = (points: Point[]) => [...points].sort((a, b) => a.createdAt - b.createdAt)

const isCheckpoint = (p: Point) => p.tipo === 'checkpoint' || p.tipo === 'checkpoint-auto'

/** checkpoint che valgono punti: almeno 200 m dal punto precedente */
export function scoringCheckpoints(points: Point[]): Point[] {
  const ordered = sortedPoints(points)
  return ordered.filter((p, i) => i > 0 && isCheckpoint(p) && distanceM(ordered[i - 1], p) >= MIN_SCORING_DISTANCE_M)
}

export function visitedBanglaIds(points: Point[]): string[] {
  const ids: string[] = []
  for (const p of sortedPoints(points)) {
    if (p.tipo === 'bangla' && p.banglaId && !ids.includes(p.banglaId)) ids.push(p.banglaId)
  }
  return ids
}

/** metri percorsi: percorso calcolato se c'è, altrimenti linee dritte tra i punti */
export function walkedMeters(b: Pick<WalkBundle, 'walk' | 'points'>): number {
  if (b.walk.percorsoMetri != null) return b.walk.percorsoMetri
  return Math.round(lineLengthM(sortedPoints(b.points).map((p) => [p.lng, p.lat])))
}

export function computeScore(b: WalkBundle): Score {
  const visited = visitedBanglaIds(b.points)
  const nuovi = visited.filter((id) => b.newBanglaIds.includes(id))
  const passanti = b.points.filter((p) => p.tipo === 'passante')
  const persi = b.points.filter((p) => p.tipo === 'perso')
  const checkpoints = scoringCheckpoints(b.points)
  const km = walkedMeters(b) / 1000

  const righe: ScoreLine[] = [
    { voce: 'Bangla visitati', quantita: visited.length, punti: visited.length * WEIGHTS.bangla },
    { voce: 'Bangla nuovi', quantita: nuovi.length, punti: nuovi.length * WEIGHTS.banglaNuovo },
    { voce: 'Passanti consultati', quantita: passanti.length, punti: passanti.length * WEIGHTS.passante },
    { voce: 'Checkpoint validi', quantita: checkpoints.length, punti: checkpoints.length * WEIGHTS.checkpoint },
    { voce: 'Km percorsi', quantita: Math.round(km * 10) / 10, punti: Math.round(km * WEIGHTS.perKm) },
    { voce: 'Mi sono perso', quantita: persi.length, punti: persi.length * WEIGHTS.perso },
    { voce: 'Birre bevute', quantita: b.drinks.reduce((s, d) => s + d.quantita, 0), punti: 0 },
  ]
  const squadra = righe.reduce((s, r) => s + r.punti, 0)

  const persone: PersonScore[] = [...b.participants]
    .sort((a, z) => a.ordine - z.ordine)
    .map((p) => {
      const domande = passanti.filter((x) => x.participantId === p.id).length
      return {
        participantId: p.id,
        soprannome: p.soprannome,
        domande,
        punti: domande * WEIGHTS.passantePersonale,
        birre: b.drinks.filter((d) => d.participantId === p.id).reduce((s, d) => s + d.quantita, 0),
        titoli: [],
      }
    })

  const maxDomande = Math.max(0, ...persone.map((p) => p.domande))
  if (maxDomande > 0) {
    for (const p of persone) if (p.domande === maxDomande) p.titoli.push('NAVIGATORE')
  }
  persone.sort((a, z) => z.punti - a.punti)

  return { squadra, righe, persone }
}

export interface Stats {
  metri: number
  durataMs: number
  bangla: number
  passanti: number
  checkpoint: number
  /** tempo medio tra una tappa e l'altra (partenza, bangla, arrivo) */
  mediaTraTappeMs: number | null
  birrePerPersona: { soprannome: string; birre: number }[]
  deviazione: { metri: number; percento: number } | null
}

export function computeStats(b: WalkBundle): Stats {
  const pts = sortedPoints(b.points)
  const start = b.walk.startedAt
  const end = b.walk.endedAt ?? pts[pts.length - 1]?.createdAt ?? start
  const tappe = pts.filter((p) => p.tipo === 'partenza' || p.tipo === 'bangla' || p.tipo === 'arrivo')
  let mediaTraTappeMs: number | null = null
  if (tappe.length >= 2) {
    mediaTraTappeMs = (tappe[tappe.length - 1].createdAt - tappe[0].createdAt) / (tappe.length - 1)
  }
  const metri = walkedMeters(b)
  let deviazione: Stats['deviazione'] = null
  if (b.walk.ottimaleMetri && b.walk.ottimaleMetri > 0) {
    const extra = metri - b.walk.ottimaleMetri
    deviazione = { metri: Math.round(extra), percento: Math.round((extra / b.walk.ottimaleMetri) * 100) }
  }
  return {
    metri,
    durataMs: Math.max(0, end - start),
    bangla: visitedBanglaIds(b.points).length,
    passanti: pts.filter((p) => p.tipo === 'passante').length,
    checkpoint: pts.filter(isCheckpoint).length,
    mediaTraTappeMs,
    birrePerPersona: [...b.participants]
      .sort((a, z) => a.ordine - z.ordine)
      .map((p) => ({
        soprannome: p.soprannome,
        birre: b.drinks.filter((d) => d.participantId === p.id).reduce((s, d) => s + d.quantita, 0),
      })),
    deviazione,
  }
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}H ${String(m).padStart(2, '0')}M` : `${m} MIN`
}

export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1).replace('.', ',')} KM`
}
