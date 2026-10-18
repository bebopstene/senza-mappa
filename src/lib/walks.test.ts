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

  it('un negozio diverso entro 40 m da uno già visto diventa un bangla nuovo', async () => {
    const w = await startWalk(['A', 'B'], '', fix(45.48))
    const a = await checkInBangla(w.id, fix(45.483))
    await nameBangla(a.point.id, 'PRIMO', null)
    await setVote(w.id, a.bangla.id, 5)
    const b = await checkInBangla(w.id, fix(45.48325)) // ~28 m
    expect(b.giaVisto).toBe(true)
    await nameBangla(b.point.id, 'SECONDO', null)
    const after = await db.points.get(b.point.id)
    expect(after!.banglaId).not.toBe(a.bangla.id)
    expect((await db.bangla.get(a.bangla.id))!.nome).toBe('PRIMO')
    await setVote(w.id, after!.banglaId!, 1)
    expect((await db.reviews.where({ banglaId: a.bangla.id }).first())!.voto).toBe(5)
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

describe('export GPX', () => {
  it('produce un GPX valido con tappe e traccia', async () => {
    const { buildGpx } = await import('./export')
    const w = await startWalk(['A', 'B'], 'Giro <&> prova', fix(45.48))
    const { point } = await checkInBangla(w.id, fix(45.483))
    await nameBangla(point.id, 'Market "Isola"', null)
    await closeWalk(w.id, fix(45.486))
    const gpx = buildGpx((await loadBundle(w.id))!)
    expect(gpx).toContain('<gpx version="1.1"')
    expect(gpx).toContain('Giro &lt;&amp;&gt; prova')
    expect(gpx).toContain('BANGLA 1 · Market &quot;Isola&quot;')
    expect((gpx.match(/<wpt /g) ?? []).length).toBe(3)
    expect((gpx.match(/<trkpt /g) ?? []).length).toBe(3)
  })
})

describe('soste bagno e posti salvati', () => {
  it('una sosta bagno crea il posto, lo riconosce entro 40 m e l’annulla lo toglie', async () => {
    const { checkInBagno, updateBagno } = await import('./walks')
    const w = await startWalk(['A', 'B'], '', fix(45.48))
    const first = await checkInBagno(w.id, fix(45.483))
    expect(first.giaVisto).toBe(false)
    await updateBagno(first.bagno.id, { gratis: true, nome: 'Parco' })
    const again = await checkInBagno(w.id, fix(45.48320))
    expect(again.giaVisto).toBe(true)
    expect(again.bagno.id).toBe(first.bagno.id)
    await deletePoint(again.point.id)
    expect(await db.bagni.count()).toBe(1) // c'è ancora la prima sosta
    await deletePoint(first.point.id)
    expect(await db.bagni.count()).toBe(0)
    const b = (await loadBundle(w.id))!
    expect(b.points.every((p) => p.tipo !== 'bagno')).toBe(true)
  })

  it('un bangla da provare resta in lista anche se il check-in viene annullato', async () => {
    const { addSavedBangla, removeSavedPlace } = await import('./walks')
    const saved = await addSavedBangla({ nome: 'Da provare', lat: 45.483, lng: 9.19, daProvare: true })
    const w = await startWalk(['A', 'B'], '', fix(45.48))
    const c = await checkInBangla(w.id, fix(45.4831))
    expect(c.bangla.id).toBe(saved.id)
    await deletePoint(c.point.id)
    expect(await db.bangla.get(saved.id)).toBeTruthy()
    // un nome diverso a un check-in vicino non rinomina quello in lista
    const c2 = await checkInBangla(w.id, fix(45.4831))
    await nameBangla(c2.point.id, 'Altro negozio', null)
    expect((await db.bangla.get(saved.id))!.nome).toBe('Da provare')
    await removeSavedPlace('bangla', saved.id)
    expect(await db.bangla.get(saved.id)).toBeUndefined()
  })
})

describe('eliminare camminate', () => {
  it('elimina in blocco, salta quella in corso e pulisce i posti non salvati', async () => {
    const { deleteWalks, checkInBagno, addSavedBagno } = await import('./walks')
    const w1 = await startWalk(['A', 'B'], 'PROVA 1', fix(45.48))
    await checkInBangla(w1.id, fix(45.483))
    await checkInBagno(w1.id, fix(45.485))
    const salvato = await addSavedBagno({ nome: 'Tenuto', lat: 45.49, lng: 9.19, gratis: true })
    await checkInBagno(w1.id, fix(45.49))
    await closeWalk(w1.id, null)
    const w2 = await startWalk(['A', 'B'], 'IN CORSO', fix(45.48))
    await deleteWalks([w1.id, w2.id])
    expect(await db.walks.get(w1.id)).toBeUndefined()
    expect(await db.walks.get(w2.id)).toBeTruthy() // la camminata in corso non si cancella
    expect(await db.bangla.count()).toBe(0)
    expect((await db.bagni.toArray()).map((b) => b.id)).toEqual([salvato.id])
  })
})
