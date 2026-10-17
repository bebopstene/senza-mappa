import { describe, expect, it } from 'vitest'
import { computeScore, computeStats, scoringCheckpoints, type WalkBundle } from './score'
import type { Point, PointType } from '../db/schema'

// ~0.0018° di latitudine ≈ 200 m
const P = (tipo: PointType, lat: number, t: number, extra: Partial<Point> = {}): Point => ({
  id: `${tipo}-${t}`,
  walkId: 'w',
  tipo,
  lat,
  lng: 9.19,
  accuracy: 10,
  createdAt: t,
  banglaId: null,
  participantId: null,
  nota: null,
  updatedAt: t,
  ...extra,
})

const bundle = (points: Point[], extra: Partial<WalkBundle> = {}): WalkBundle => ({
  walk: {
    id: 'w', nome: 'T', startedAt: 0, endedAt: 3_600_000, stato: 'chiusa',
    percorso: null, percorsoTipo: null, percorsoMetri: 2000, percorsoOttimale: null, ottimaleMetri: 1600,
    modificata: false, premiazioneFatta: true, updatedAt: 0,
  },
  participants: [
    { id: 'a', walkId: 'w', soprannome: 'ANNA', ordine: 0, updatedAt: 0 },
    { id: 'b', walkId: 'w', soprannome: 'BEPPE', ordine: 1, updatedAt: 0 },
  ],
  points,
  bangla: [],
  drinks: [],
  reviews: [],
  awards: [],
  newBanglaIds: [],
  ...extra,
})

describe('scoringCheckpoints', () => {
  it('conta solo i checkpoint ad almeno 200 m dal punto precedente', () => {
    const pts = [
      P('partenza', 45.0, 0),
      P('checkpoint', 45.0005, 1), // ~55 m: non vale
      P('checkpoint', 45.0030, 2), // ~280 m dal precedente: vale
      P('checkpoint-auto', 45.0060, 3), // vale anche l'automatico
    ]
    expect(scoringCheckpoints(pts).map((p) => p.createdAt)).toEqual([2, 3])
  })
})

describe('computeScore', () => {
  it('applica la tabella dei pesi e le birre valgono zero', () => {
    const pts = [
      P('partenza', 45.0, 0),
      P('bangla', 45.0030, 10, { banglaId: 'x' }),
      P('passante', 45.0031, 20, { participantId: 'b' }),
      P('bangla', 45.0060, 30, { banglaId: 'y' }),
      P('bangla', 45.0061, 31, { banglaId: 'y' }), // stesso bangla, conta una volta
      P('checkpoint', 45.0090, 40),
      P('perso', 45.0091, 50),
    ]
    const s = computeScore(
      bundle(pts, {
        newBanglaIds: ['x'],
        drinks: [
          { id: 'd1', walkId: 'w', participantId: 'a', banglaId: 'x', quantita: 1, createdAt: 0, updatedAt: 0 },
          { id: 'd2', walkId: 'w', participantId: 'a', banglaId: 'y', quantita: 1, createdAt: 0, updatedAt: 0 },
        ],
      }),
    )
    // 2 bangla ×10 + 1 nuovo ×5 + 1 passante ×5 + 1 checkpoint ×2 + 2 km ×3 − 15
    expect(s.squadra).toBe(20 + 5 + 5 + 2 + 6 - 15)
    const beppe = s.persone.find((p) => p.soprannome === 'BEPPE')!
    expect(beppe.punti).toBe(5)
    expect(beppe.titoli).toContain('NAVIGATORE')
    const anna = s.persone.find((p) => p.soprannome === 'ANNA')!
    expect(anna.birre).toBe(2)
    expect(anna.punti).toBe(0)
    expect(s.righe.find((r) => r.voce === 'Birre bevute')!.punti).toBe(0)
  })

  it('senza domande ai passanti nessuno è Navigatore', () => {
    const s = computeScore(bundle([P('partenza', 45, 0)]))
    expect(s.persone.every((p) => p.titoli.length === 0)).toBe(true)
  })
})

describe('computeStats', () => {
  it('calcola deviazione e tempo medio tra tappe', () => {
    const pts = [P('partenza', 45, 0), P('bangla', 45.003, 600_000, { banglaId: 'x' }), P('arrivo', 45.006, 1_200_000)]
    const st = computeStats(bundle(pts))
    expect(st.deviazione).toEqual({ metri: 400, percento: 25 })
    expect(st.mediaTraTappeMs).toBe(600_000)
    expect(st.bangla).toBe(1)
  })
})
