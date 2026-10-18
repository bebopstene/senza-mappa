import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/schema'
import { addDrink, addPoint, checkInBangla, closeWalk, exportWalkJson, loadBundle, nameBangla, setVote, startWalk } from './walks'
import { exportAll, importText } from './backup'
import { encodeBundle } from './share'
import { computeScore } from './score'

const fix = (lat: number, lng = 9.19, accuracy = 10) => ({ lat, lng, accuracy, at: Date.now() })
const wipe = () => Promise.all(db.tables.map((t) => t.clear()))

async function makeWalk() {
  const w = await startWalk(['ANNA', 'BEPPE'], 'PRIMA CAMMINATA', fix(45.48))
  const { point, bangla } = await checkInBangla(w.id, fix(45.483))
  await nameBangla(point.id, 'Market Isola', 'node/1')
  const parts = await db.participants.toArray()
  await addDrink(w.id, bangla.id, parts[0].id)
  await setVote(w.id, bangla.id, 4)
  await addPoint(w.id, 'passante', fix(45.484), { participantId: parts[1].id })
  await closeWalk(w.id, fix(45.487))
  return w.id
}

beforeEach(wipe)

describe('import / export', () => {
  it('il JSON di una camminata si reimporta uguale, e una seconda volta non fa doppioni', async () => {
    const id = await makeWalk()
    const before = (await loadBundle(id))!
    const json = await exportWalkJson(id)
    await wipe()
    expect(await importText(json)).toEqual({ importate: 1, giaPresenti: 0, posti: 0 })
    const after = (await loadBundle(id))!
    expect(after.points.map((p) => p.tipo)).toEqual(before.points.map((p) => p.tipo))
    expect(after.bangla[0].nome).toBe('Market Isola')
    expect(computeScore(after).squadra).toBe(computeScore(before).squadra)
    expect(after.drinks).toHaveLength(1)
    expect(after.reviews[0].voto).toBe(4)
    expect(await importText(json)).toEqual({ importate: 0, giaPresenti: 1, posti: 0 })
  })

  it('accetta il JSON della prima versione (senza campi nuovi) e chiude una camminata rimasta attiva', async () => {
    const id = await makeWalk()
    const b = JSON.parse(await exportWalkJson(id))
    delete b.bagni
    for (const p of b.points) delete p.bagnoId
    b.walk.stato = 'attiva'
    b.walk.endedAt = null
    b.walk.percorso = null
    await wipe()
    await importText(JSON.stringify(b))
    const w = (await db.walks.get(id))!
    expect(w.stato).toBe('da-calcolare')
    expect(w.endedAt).toBeTruthy()
    expect(await db.walks.where('stato').equals('attiva').count()).toBe(0)
  })

  it('il backup completo porta camminate e posti salvati', async () => {
    const id = await makeWalk()
    const { addSavedBagno } = await import('./walks')
    await addSavedBagno({ nome: 'Parco', lat: 45.49, lng: 9.19, gratis: true })
    const backup = JSON.stringify(await exportAll())
    await wipe()
    const r = await importText(backup)
    expect(r.importate).toBe(1)
    expect(r.posti).toBe(1)
    expect(await db.walks.get(id)).toBeTruthy()
  })

  it('un link condiviso diventa una camminata, con i bangla agganciati a quelli già salvati', async () => {
    const id = await makeWalk()
    const b = (await loadBundle(id))!
    const url = `https://senza-mappa.vercel.app/#/v/${encodeBundle(b, { nomiNegozi: false })}`
    const banglaId = b.bangla[0].id
    // nel nuovo telefono c'è già quel bangla, con il suo nome vero
    await db.walks.clear()
    await db.points.clear()
    await db.participants.clear()
    const r = await importText(`guarda qui ${url}`)
    expect(r.importate).toBe(1)
    const walk = (await db.walks.toArray())[0]
    const imported = (await loadBundle(walk.id))!
    expect(imported.points.find((p) => p.tipo === 'bangla')!.banglaId).toBe(banglaId)
    expect((await db.bangla.get(banglaId))!.nome).toBe('Market Isola') // "BANGLA 1" del link non lo sovrascrive
    expect(await importText(url)).toEqual({ importate: 0, giaPresenti: 1, posti: 0 })
  })

  it('rifiuta file che non sono di Senza Mappa', async () => {
    await expect(importText('{"ciao":1}')).rejects.toThrow()
    await expect(importText('testo a caso')).rejects.toThrow()
    await expect(importText('{"walk":{"id":"x","nome":"y","startedAt":1},"participants":[],"points":[{"id":"p","tipo":"bangla","lat":999,"lng":0,"createdAt":1}],"bangla":[]}')).rejects.toThrow()
  })
})
