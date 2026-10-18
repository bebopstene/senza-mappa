// Operazioni sui dati. Ogni scrittura va su IndexedDB prima di qualsiasi conferma a schermo (R6).

import {
  db,
  uuid,
  setSetting,
  getSetting,
  type AwardCategory,
  type Bagno,
  type Bangla,
  type LngLat,
  type Point,
  type PointType,
  type Walk,
} from '../db/schema'
import { distanceM, SAME_BANGLA_RADIUS_M, type Fix } from './geo'
import { computeOptimal, computeRoute, OfflineError } from './route'
import { sortedPoints, type WalkBundle } from './score'

const now = () => Date.now()

export async function getActiveWalk(): Promise<Walk | undefined> {
  return db.walks.where('stato').equals('attiva').first()
}

export async function getLastTeam(): Promise<string[]> {
  return getSetting<string[]>('lastTeam', [])
}

export async function startWalk(soprannomi: string[], nome: string, fix: Fix): Promise<Walk> {
  const t = now()
  const walk: Walk = {
    id: uuid(),
    nome: nome.trim() || defaultWalkName(t),
    startedAt: t,
    endedAt: null,
    stato: 'attiva',
    percorso: null,
    percorsoTipo: null,
    percorsoMetri: null,
    percorsoOttimale: null,
    ottimaleMetri: null,
    modificata: false,
    premiazioneFatta: false,
    updatedAt: t,
  }
  await db.transaction('rw', [db.walks, db.participants, db.points, db.settings], async () => {
    const existing = await db.walks.where('stato').equals('attiva').count()
    if (existing > 0) throw new Error('C’è già una camminata in corso')
    await db.walks.add(walk)
    await db.participants.bulkAdd(
      soprannomi.map((s, i) => ({ id: uuid(), walkId: walk.id, soprannome: s, ordine: i, updatedAt: t })),
    )
    await db.points.add(makePoint(walk.id, 'partenza', fix, t))
    await setSetting('lastTeam', soprannomi)
  })
  return walk
}

export function defaultWalkName(t: number): string {
  const d = new Date(t)
  return `GIRO DEL ${d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' }).toUpperCase()}`
}

function makePoint(walkId: string, tipo: PointType, fix: Fix, t = now(), extra: Partial<Point> = {}): Point {
  return {
    id: uuid(),
    walkId,
    tipo,
    lat: fix.lat,
    lng: fix.lng,
    accuracy: fix.accuracy,
    createdAt: t,
    banglaId: null,
    participantId: null,
    nota: null,
    updatedAt: t,
    ...extra,
  }
}

export async function addPoint(walkId: string, tipo: PointType, fix: Fix, extra: Partial<Point> = {}): Promise<Point> {
  const p = makePoint(walkId, tipo, fix, now(), extra)
  await db.points.add(p)
  return p
}

export async function lastPoint(walkId: string): Promise<Point | undefined> {
  return db.points.where('[walkId+createdAt]').between([walkId, -Infinity], [walkId, Infinity]).last()
}

/** bangla salvato più vicino entro ~40 m, se esiste */
export async function findNearbyBangla(fix: { lat: number; lng: number }): Promise<Bangla | undefined> {
  const all = await db.bangla.toArray()
  let best: Bangla | undefined
  let bestD = Infinity
  for (const b of all) {
    const d = distanceM(fix, b)
    if (d <= SAME_BANGLA_RADIUS_M && d < bestD) {
      best = b
      bestD = d
    }
  }
  return best
}

/** check-in: salva subito il punto e il bangla (nuovo o riconosciuto). Il nome arriva dopo. */
export async function checkInBangla(walkId: string, fix: Fix): Promise<{ point: Point; bangla: Bangla; giaVisto: boolean }> {
  return db.transaction('rw', [db.bangla, db.points], async () => {
    const t = now()
    let bangla = await findNearbyBangla(fix)
    const giaVisto = !!bangla
    if (!bangla) {
      bangla = { id: uuid(), nome: '', osmId: null, lat: fix.lat, lng: fix.lng, updatedAt: t }
      await db.bangla.add(bangla)
    }
    const point = makePoint(walkId, 'bangla', fix, t, { banglaId: bangla.id })
    await db.points.add(point)
    return { point, bangla, giaVisto }
  })
}

/** assegna un nome al bangla del punto; se il negozio OSM è già in archivio, ricollega il punto a quello */
export async function nameBangla(pointId: string, nome: string, osmId: string | null, pos?: { lat: number; lng: number }) {
  await db.transaction('rw', [db.bangla, db.points, db.drinks, db.reviews], async () => {
    const point = await db.points.get(pointId)
    if (!point?.banglaId) return
    const t = now()
    if (osmId) {
      const existing = await db.bangla.where('osmId').equals(osmId).first()
      if (existing && existing.id !== point.banglaId) {
        const oldId = point.banglaId
        await db.points.update(pointId, { banglaId: existing.id, updatedAt: t })
        await db.drinks.where({ walkId: point.walkId, banglaId: oldId }).modify({ banglaId: existing.id, updatedAt: t })
        await db.reviews.where({ walkId: point.walkId, banglaId: oldId }).modify({ banglaId: existing.id, updatedAt: t })
        await removeBanglaIfOrphan(oldId)
        return
      }
    }
    const current = await db.bangla.get(point.banglaId)
    if (!current) return
    // bangla riconosciuto entro 40 m ma con nome o negozio OSM diverso: è un altro posto.
    // Non rinominiamo quello in archivio, ne creiamo uno nuovo e ci spostiamo il punto.
    const clean = nome.trim().slice(0, 60)
    const altroNome = !!current.nome && clean.toLocaleUpperCase('it') !== current.nome.toLocaleUpperCase('it')
    const altroOsm = !!osmId && !!current.osmId && osmId !== current.osmId
    // un bangla salvato in lista (es. "da provare") conta come già esistente anche senza altri check-in
    const usatoAltrove = !!current.salvato || (await db.points.where('banglaId').equals(current.id).count()) > 1
    if (usatoAltrove && (altroNome || altroOsm)) {
      const nuovo: Bangla = { id: uuid(), nome: clean, osmId, lat: pos?.lat ?? point.lat, lng: pos?.lng ?? point.lng, updatedAt: t }
      await db.bangla.add(nuovo)
      await db.points.update(pointId, { banglaId: nuovo.id, updatedAt: t })
      const altriQui = await db.points.where({ walkId: point.walkId }).filter((x) => x.banglaId === current.id).count()
      if (altriQui === 0) {
        await db.drinks.where({ walkId: point.walkId, banglaId: current.id }).modify({ banglaId: nuovo.id, updatedAt: t })
        await db.reviews.where({ walkId: point.walkId, banglaId: current.id }).modify({ banglaId: nuovo.id, updatedAt: t })
      }
      return
    }
    const patch: Partial<Bangla> = { nome: clean, updatedAt: t }
    if (osmId) patch.osmId = osmId
    if (pos && !current.nome) Object.assign(patch, { lat: pos.lat, lng: pos.lng })
    await db.bangla.update(current.id, patch)
  })
}

async function removeBanglaIfOrphan(banglaId: string) {
  const b = await db.bangla.get(banglaId)
  if (!b || b.salvato) return
  const used = await db.points.where('banglaId').equals(banglaId).count()
  if (used === 0) await db.bangla.delete(banglaId)
}

async function removeBagnoIfOrphan(bagnoId: string) {
  const b = await db.bagni.get(bagnoId)
  if (!b || b.salvato) return
  const used = await db.points.where('bagnoId').equals(bagnoId).count()
  if (used === 0) await db.bagni.delete(bagnoId)
}

/** elimina un punto; per un bangla toglie anche birre e voto di questa camminata se non ci sono altri check-in lì */
export async function deletePoint(pointId: string): Promise<void> {
  await db.transaction('rw', [db.points, db.bangla, db.bagni, db.drinks, db.reviews, db.awards], async () => {
    const p = await db.points.get(pointId)
    if (!p) return
    await db.points.delete(pointId)
    if (p.bagnoId) await removeBagnoIfOrphan(p.bagnoId)
    if (p.banglaId) {
      const sameWalk = await db.points.where({ walkId: p.walkId }).filter((x) => x.banglaId === p.banglaId).count()
      if (sameWalk === 0) {
        await db.drinks.where({ walkId: p.walkId, banglaId: p.banglaId }).delete()
        await db.reviews.where({ walkId: p.walkId, banglaId: p.banglaId }).delete()
        await db.awards.where({ walkId: p.walkId }).filter((a) => a.banglaId === p.banglaId).delete()
      }
      await removeBanglaIfOrphan(p.banglaId)
    }
  })
}

/** bagno salvato più vicino entro ~40 m, se esiste */
export async function findNearbyBagno(fix: { lat: number; lng: number }): Promise<Bagno | undefined> {
  let best: Bagno | undefined
  let bestD = Infinity
  for (const b of await db.bagni.toArray()) {
    const d = distanceM(fix, b)
    if (d <= SAME_BANGLA_RADIUS_M && d < bestD) {
      best = b
      bestD = d
    }
  }
  return best
}

/** sosta bagno: salva il punto e il posto (nuovo o riconosciuto entro 40 m) */
export async function checkInBagno(walkId: string, fix: Fix): Promise<{ point: Point; bagno: Bagno; giaVisto: boolean }> {
  return db.transaction('rw', [db.bagni, db.points], async () => {
    const t = now()
    let bagno = await findNearbyBagno(fix)
    const giaVisto = !!bagno
    if (!bagno) {
      bagno = { id: uuid(), nome: '', lat: fix.lat, lng: fix.lng, gratis: null, nota: null, updatedAt: t }
      await db.bagni.add(bagno)
    }
    const point = makePoint(walkId, 'bagno', fix, t, { bagnoId: bagno.id })
    await db.points.add(point)
    return { point, bagno, giaVisto }
  })
}

export async function updateBagno(id: string, patch: Partial<Pick<Bagno, 'nome' | 'gratis' | 'nota' | 'lat' | 'lng'>>) {
  const clean = { ...patch }
  if (clean.nome !== undefined) clean.nome = clean.nome.trim().slice(0, 60)
  if (clean.nota !== undefined && clean.nota !== null) clean.nota = clean.nota.trim().slice(0, 140) || null
  await db.bagni.update(id, { ...clean, updatedAt: now() })
}

// --- Posti salvati senza camminata ---

export async function addSavedBangla(p: { nome: string; lat: number; lng: number; daProvare: boolean }): Promise<Bangla> {
  const b: Bangla = {
    id: uuid(),
    nome: p.nome.trim().slice(0, 60),
    osmId: null,
    lat: p.lat,
    lng: p.lng,
    salvato: true,
    daProvare: p.daProvare,
    updatedAt: now(),
  }
  await db.bangla.add(b)
  return b
}

export async function addSavedBagno(p: { nome: string; lat: number; lng: number; gratis: boolean | null }): Promise<Bagno> {
  const b: Bagno = { id: uuid(), nome: p.nome.trim().slice(0, 60), lat: p.lat, lng: p.lng, gratis: p.gratis, nota: null, salvato: true, updatedAt: now() }
  await db.bagni.add(b)
  return b
}

export async function updateBangla(id: string, patch: Partial<Pick<Bangla, 'nome' | 'daProvare' | 'lat' | 'lng'>>) {
  const clean = { ...patch }
  if (clean.nome !== undefined) clean.nome = clean.nome.trim().slice(0, 60)
  await db.bangla.update(id, { ...clean, salvato: true, updatedAt: now() })
}

/** toglie un posto dalla lista. Un bangla con check-in resta (fa parte delle camminate), solo senza "da provare". */
export async function removeSavedPlace(kind: 'bangla' | 'bagno', id: string) {
  await db.transaction('rw', [db.bangla, db.bagni, db.points], async () => {
    if (kind === 'bangla') {
      const visits = await db.points.where('banglaId').equals(id).count()
      if (visits > 0) await db.bangla.update(id, { salvato: false, daProvare: false, updatedAt: now() })
      else await db.bangla.delete(id)
    } else {
      // le soste nelle camminate restano, senza il posto collegato
      await db.points.where('bagnoId').equals(id).modify({ bagnoId: null, updatedAt: now() })
      await db.bagni.delete(id)
    }
  })
}

export async function setPassanteAsker(pointId: string, participantId: string | null) {
  await db.points.update(pointId, { participantId, updatedAt: now() })
}

export async function addDrink(walkId: string, banglaId: string, participantId: string) {
  const t = now()
  const id = uuid()
  await db.drinks.add({ id, walkId, banglaId, participantId, quantita: 1, createdAt: t, updatedAt: t })
  return id
}

export async function removeDrinks(ids: string[]) {
  await db.drinks.bulkDelete(ids)
}

export async function setVote(walkId: string, banglaId: string, voto: number) {
  const t = now()
  const v = Math.max(1, Math.min(5, Math.round(voto)))
  const existing = await db.reviews.where('[walkId+banglaId]').equals([walkId, banglaId]).first()
  if (existing) await db.reviews.update(existing.id, { voto: v, updatedAt: t })
  else await db.reviews.add({ id: uuid(), walkId, banglaId, voto: v, updatedAt: t })
}

export async function clearVote(walkId: string, banglaId: string) {
  await db.reviews.where('[walkId+banglaId]').equals([walkId, banglaId]).delete()
}

export async function setAward(walkId: string, categoria: AwardCategory, banglaId: string | null) {
  const t = now()
  await db.transaction('rw', db.awards, async () => {
    await db.awards.where('[walkId+categoria]').equals([walkId, categoria]).delete()
    if (banglaId) await db.awards.add({ id: uuid(), walkId, categoria, banglaId, updatedAt: t })
  })
}

export async function finishAwards(walkId: string) {
  await db.walks.update(walkId, { premiazioneFatta: true, updatedAt: now() })
}

/** chiusura: l'ultimo punto (o la posizione attuale) diventa l'arrivo */
export async function closeWalk(walkId: string, fix: Fix | null): Promise<void> {
  await db.transaction('rw', [db.walks, db.points], async () => {
    const t = now()
    if (fix) {
      await db.points.add(makePoint(walkId, 'arrivo', fix, t))
    }
    await db.walks.update(walkId, { stato: 'da-calcolare', endedAt: t, updatedAt: t })
  })
}

/** calcola percorso e percorso ottimale; se offline la camminata resta "da calcolare" */
const inFlight = new Map<string, Promise<'ok' | 'offline'>>()

/** una sola richiesta per camminata alla volta, anche se la chiedono in tre */
export function computeWalkRoute(walkId: string): Promise<'ok' | 'offline'> {
  const running = inFlight.get(walkId)
  if (running) return running
  const p = doComputeWalkRoute(walkId).finally(() => inFlight.delete(walkId))
  inFlight.set(walkId, p)
  return p
}

async function doComputeWalkRoute(walkId: string): Promise<'ok' | 'offline'> {
  const pts = sortedPoints(await db.points.where({ walkId }).toArray())
  const coords: LngLat[] = pts.map((p) => [p.lng, p.lat])
  try {
    const route = await computeRoute(coords)
    let optimal: { coordinates: LngLat[]; meters: number } | null = null
    if (coords.length >= 2) {
      try {
        const o = await computeOptimal(coords[0], coords[coords.length - 1])
        optimal = o.tipo === 'strade' ? o : null
      } catch (e) {
        if (e instanceof OfflineError) throw e
      }
    }
    await db.walks.update(walkId, {
      stato: 'chiusa',
      percorso: route.coordinates,
      percorsoTipo: route.tipo,
      percorsoMetri: route.meters,
      percorsoOttimale: optimal?.coordinates ?? null,
      ottimaleMetri: optimal?.meters ?? null,
      updatedAt: now(),
    })
    return 'ok'
  } catch (e) {
    if (e instanceof OfflineError) return 'offline'
    throw e
  }
}

let computing = false
/** riprova il calcolo per tutte le camminate "da calcolare" (all'avvio e quando torna la rete) */
export async function computePendingRoutes(): Promise<void> {
  if (computing) return
  computing = true
  try {
    const pending = await db.walks.where('stato').equals('da-calcolare').toArray()
    for (const w of pending) {
      const r = await computeWalkRoute(w.id)
      if (r === 'offline') break
    }
  } finally {
    computing = false
  }
}

/** modifica dopo la chiusura (R10): sposta un punto, poi il percorso va ricalcolato */
export async function movePoint(pointId: string, lat: number, lng: number) {
  const p = await db.points.get(pointId)
  if (!p) return
  await db.transaction('rw', [db.points, db.walks, db.bangla, db.bagni], async () => {
    await db.points.update(pointId, { lat, lng, updatedAt: now() })
    // se è l'unico check-in di quel bangla, spostiamo anche il bangla in archivio
    if (p.banglaId && (await db.points.where('banglaId').equals(p.banglaId).count()) === 1) {
      await db.bangla.update(p.banglaId, { lat, lng, updatedAt: now() })
    }
    if (p.bagnoId && (await db.points.where('bagnoId').equals(p.bagnoId).count()) === 1) {
      await db.bagni.update(p.bagnoId, { lat, lng, updatedAt: now() })
    }
    await markEdited(p.walkId)
  })
}

export async function deletePointAfterClose(pointId: string) {
  const p = await db.points.get(pointId)
  if (!p) return
  await deletePoint(pointId)
  await markEdited(p.walkId)
}

async function markEdited(walkId: string) {
  await db.walks.update(walkId, { modificata: true, stato: 'da-calcolare', updatedAt: now() })
}

export async function renameBangla(banglaId: string, nome: string) {
  await db.bangla.update(banglaId, { nome: nome.trim().slice(0, 60), updatedAt: now() })
}

export async function renameWalk(walkId: string, nome: string) {
  await db.walks.update(walkId, { nome: nome.trim().slice(0, 60) || 'CAMMINATA', updatedAt: now() })
}

export async function deleteWalk(walkId: string) {
  await db.transaction('rw', [db.walks, db.participants, db.points, db.bangla, db.drinks, db.reviews, db.awards], async () => {
    const banglaIds = (await db.points.where({ walkId }).toArray()).map((p) => p.banglaId).filter((x): x is string => !!x)
    await db.points.where({ walkId }).delete()
    await db.participants.where({ walkId }).delete()
    await db.drinks.where({ walkId }).delete()
    await db.reviews.where({ walkId }).delete()
    await db.awards.where({ walkId }).delete()
    await db.walks.delete(walkId)
    for (const id of new Set(banglaIds)) await removeBanglaIfOrphan(id)
  })
}

export async function loadBundle(walkId: string): Promise<WalkBundle | null> {
  const walk = await db.walks.get(walkId)
  if (!walk) return null
  const [participants, points, drinks, reviews, awards] = await Promise.all([
    db.participants.where({ walkId }).toArray(),
    db.points.where({ walkId }).toArray(),
    db.drinks.where({ walkId }).toArray(),
    db.reviews.where({ walkId }).toArray(),
    db.awards.where({ walkId }).toArray(),
  ])
  const banglaIds = [...new Set(points.map((p) => p.banglaId).filter((x): x is string => !!x))]
  const bangla = (await db.bangla.bulkGet(banglaIds)).filter((b): b is Bangla => !!b)
  const bagnoIds = [...new Set(points.map((p) => p.bagnoId).filter((x): x is string => !!x))]
  const bagni = (await db.bagni.bulkGet(bagnoIds)).filter((b): b is Bagno => !!b)

  // "mai visitato prima": nessun check-in in camminate iniziate prima di questa
  const earlierWalkIds = new Set(
    (await db.walks.where('startedAt').below(walk.startedAt).primaryKeys()) as string[],
  )
  const newBanglaIds: string[] = []
  for (const id of banglaIds) {
    const visits = await db.points.where('banglaId').equals(id).toArray()
    if (!visits.some((v) => earlierWalkIds.has(v.walkId))) newBanglaIds.push(id)
  }
  return { walk, participants, points: sortedPoints(points), bangla, bagni, drinks, reviews, awards, newBanglaIds }
}

/** export JSON per le metriche della v0 */
export async function exportWalkJson(walkId: string): Promise<string> {
  const b = await loadBundle(walkId)
  return JSON.stringify(b, null, 2)
}
