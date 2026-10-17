// Link di sola lettura (R11) senza backend: i dati della camminata chiusa stanno, compressi,
// nel frammento dell'URL (#...). Il frammento non arriva mai al server e la pagina è noindex.
// Il percorso non viaggia nel link: chi lo apre lo ricalcola.

import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { AwardCategory, PointType, Walk } from '../db/schema'
import type { WalkBundle } from './score'

interface Snapshot {
  v: 1
  n: string // nome
  s: number // startedAt
  e: number | null // endedAt
  om: number | null // metri percorso ottimale
  pm: number | null // metri percorso
  pa: string[] // soprannomi
  b: [string, number, number][] // bangla: nome, lat, lng (indice = id)
  nb: number[] // indici dei bangla nuovi
  p: [PointType, number, number, number, number, number | null, number | null][] // tipo, lat, lng, acc, dt (s da inizio), bangla idx, participant idx
  d: [number, number, number][] // participant idx, bangla idx, quantita
  r: [number, number][] // bangla idx, voto
  a: [AwardCategory, number][] // categoria, bangla idx
}

const round = (x: number) => Math.round(x * 1e5) / 1e5

export function encodeBundle(b: WalkBundle, opts: { nomiNegozi: boolean }): string {
  const bIdx = new Map(b.bangla.map((x, i) => [x.id, i]))
  const pIdx = new Map([...b.participants].sort((a, z) => a.ordine - z.ordine).map((x, i) => [x.id, i]))
  const visitOrder = b.points.filter((p) => p.tipo === 'bangla' && p.banglaId).map((p) => p.banglaId!)
  const snap: Snapshot = {
    v: 1,
    n: b.walk.nome,
    s: b.walk.startedAt,
    e: b.walk.endedAt,
    om: b.walk.ottimaleMetri,
    pm: b.walk.percorsoMetri,
    pa: [...b.participants].sort((a, z) => a.ordine - z.ordine).map((p) => p.soprannome),
    b: b.bangla.map((x) => [
      opts.nomiNegozi && x.nome ? x.nome : `BANGLA ${[...new Set(visitOrder)].indexOf(x.id) + 1}`,
      round(x.lat),
      round(x.lng),
    ]),
    nb: b.newBanglaIds.map((id) => bIdx.get(id)).filter((x): x is number => x !== undefined),
    p: b.points.map((p) => [
      p.tipo,
      round(p.lat),
      round(p.lng),
      Math.round(p.accuracy),
      Math.round((p.createdAt - b.walk.startedAt) / 1000),
      p.banglaId ? (bIdx.get(p.banglaId) ?? null) : null,
      p.participantId ? (pIdx.get(p.participantId) ?? null) : null,
    ]),
    d: b.drinks
      .map((d) => [pIdx.get(d.participantId), bIdx.get(d.banglaId), d.quantita] as const)
      .filter((x): x is readonly [number, number, number] => x[0] !== undefined && x[1] !== undefined)
      .map((x) => [...x] as [number, number, number]),
    r: b.reviews
      .map((r) => [bIdx.get(r.banglaId), r.voto] as const)
      .filter((x): x is readonly [number, number] => x[0] !== undefined)
      .map((x) => [...x] as [number, number]),
    a: b.awards
      .map((a) => [a.categoria, bIdx.get(a.banglaId)] as const)
      .filter((x): x is readonly [AwardCategory, number] => x[1] !== undefined)
      .map((x) => [...x] as [AwardCategory, number]),
  }
  return compressToEncodedURIComponent(JSON.stringify(snap))
}

export function decodeBundle(data: string): WalkBundle | null {
  try {
    const json = decompressFromEncodedURIComponent(data)
    if (!json) return null
    const s = JSON.parse(json) as Snapshot
    if (s.v !== 1) return null
    const walkId = 'condivisa'
    const t = s.e ?? s.s
    const walk: Walk = {
      id: walkId,
      nome: s.n,
      startedAt: s.s,
      endedAt: s.e,
      stato: 'da-calcolare',
      percorso: null,
      percorsoTipo: null,
      percorsoMetri: s.pm,
      percorsoOttimale: null,
      ottimaleMetri: s.om,
      modificata: false,
      premiazioneFatta: true,
      updatedAt: t,
    }
    const participants = s.pa.map((nome, i) => ({ id: `p${i}`, walkId, soprannome: nome, ordine: i, updatedAt: t }))
    const bangla = s.b.map(([nome, lat, lng], i) => ({ id: `b${i}`, nome, osmId: null, lat, lng, updatedAt: t }))
    const points = s.p.map(([tipo, lat, lng, accuracy, dt, bi, pi], i) => ({
      id: `pt${i}`,
      walkId,
      tipo,
      lat,
      lng,
      accuracy,
      createdAt: s.s + dt * 1000,
      banglaId: bi === null ? null : `b${bi}`,
      participantId: pi === null ? null : `p${pi}`,
      nota: null,
      updatedAt: t,
    }))
    const drinks = s.d.map(([pi, bi, q], i) => ({
      id: `d${i}`,
      walkId,
      participantId: `p${pi}`,
      banglaId: `b${bi}`,
      quantita: q,
      createdAt: t,
      updatedAt: t,
    }))
    const reviews = s.r.map(([bi, voto], i) => ({ id: `r${i}`, banglaId: `b${bi}`, walkId, voto, updatedAt: t }))
    const awards = s.a.map(([categoria, bi], i) => ({ id: `a${i}`, walkId, categoria, banglaId: `b${bi}`, updatedAt: t }))
    return { walk, participants, points, bangla, drinks, reviews, awards, newBanglaIds: s.nb.map((i) => `b${i}`) }
  } catch {
    return null
  }
}

export function shareUrl(encoded: string): string {
  return `${location.origin}/#/v/${encoded}`
}
