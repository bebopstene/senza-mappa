import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import {
  addDrink, addPoint, checkInBangla, closeWalk, deletePoint, getActiveWalk, loadBundle, nameBangla, setVote, startWalk,
} from './walks'
import { decodeBundle, encodeBundle } from './share'
import { computeScore } from './score'

const fix = (lat: number, lng = 9.19, accuracy = 10) => ({ lat, lng, accuracy, at: Date.now() })

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('ciclo completo', () => {
  it('squadra → parti → segna → chiudi', async () => {
    const w = await startWalk(['ANNA', 'BEPPE'], '', fix(45.48))
    expect((await getActiveWalk())?.id).toBe(w.id)
    await expect(startWalk(['X', 'Y'], '', fix(45.48))).rejects.toThrow()

    const { point, bangla, giaVisto } = await checkInBangla(w.id, fix(45.483))
    expect(giaVisto).toBe(false)
    await nameBangla(point.id, 'Market Isola', 'node/1')
    const parts = await db.participants.where({ walkId: w.id }).toArray()
    await addDrink(w.id, bangla.id, parts[0].id)
    await setVote(w.id, bangla.id, 4)
    await setVote(w.id, bangla.id, 5) // un solo voto per bangla per camminata
    expect(await db.reviews.count()).toBe(1)

    await addPoint(w.id, 'checkpoint', fix(45.486))
    await closeWalk(w.id, fix(45.489))
    const b = (await loadBundle(w.id))!
    expect(b.walk.stato).toBe('da-calcolare')
    expect(b.points.map((p) => p.tipo)).toEqual(['partenza', 'bangla', 'checkpoint', 'arrivo'])
    expect(b.newBanglaIds).toEqual([bangla.id])
    expect(await getActiveWalk()).toBeUndefined()
  })

  it('riconosce un bangla già visitato entro 40 m e non lo conta come nuovo', async () => {
    const w1 = await startWalk(['A', 'B'], '', fix(45.48))
    const first = await checkInBangla(w1.id, fix(45.483))
    await closeWalk(w1.id, null)
    await new Promise((r) => setTimeout(r, 5))
    const w2 = await startWalk(['A', 'B'], '', fix(45.48))
    const again = await checkInBangla(w2.id, fix(45.48320)) // ~22 m
    expect(again.giaVisto).toBe(true)
    expect(again.bangla.id).toBe(first.bangla.id)
    const b2 = (await loadBundle(w2.id))!
    expect(b2.newBanglaIds).toEqual([])
  })

  it('annullare un check-in toglie birre e voto di quel bangla', async () => {
    const w = await startWalk(['A', 'B'], '', fix(45.48))
    const { point, bangla } = await checkInBangla(w.id, fix(45.483))
    const parts = await db.participants.toArray()
    await addDrink(w.id, bangla.id, parts[0].id)
    await setVote(w.id, bangla.id, 3)
    await deletePoint(point.id)
    expect(await db.drinks.count()).toBe(0)
    expect(await db.reviews.count()).toBe(0)
    expect(await db.bangla.count()).toBe(0)
  })

  it('il link condiviso conserva i dati che servono al punteggio', async () => {
    const w = await startWalk(['ANNA', 'BEPPE'], 'GIRO', fix(45.48))
    const { point, bangla } = await checkInBangla(w.id, fix(45.483))
    await nameBangla(point.id, 'Market Isola', null)
    const parts = await db.participants.toArray()
    await addDrink(w.id, bangla.id, parts[1].id)
    await addPoint(w.id, 'passante', fix(45.484), { participantId: parts[0].id })
    await closeWalk(w.id, fix(45.489))
    const b = (await loadBundle(w.id))!
    const hidden = decodeBundle(encodeBundle(b, { nomiNegozi: false }))!
    expect(hidden.bangla[0].nome).toBe('BANGLA 1')
    const shown = decodeBundle(encodeBundle(b, { nomiNegozi: true }))!
    expect(shown.bangla[0].nome).toBe('Market Isola')
    expect(computeScore(shown).squadra).toBe(computeScore(b).squadra)
    expect(decodeBundle('spazzatura')).toBeNull()
  })
})
