// Portare le camminate da un posto all'altro: dal sito (Safari) all'app iOS, o da un telefono a un altro.
// Accetta tre cose: il JSON di una camminata ("ESPORTA JSON"), il backup completo ("ESPORTA TUTTO")
// oppure un link condiviso (#/v/...), che ha meno dettagli ma basta per percorso, tappe e punteggio.
import { db, uuid, type Award, type Bagno, type Bangla, type Drink, type Participant, type Point, type Review, type Walk } from '../db/schema'
import { decodeBundle } from './share'
import { loadBundle } from './walks'
import { distanceM, SAME_BANGLA_RADIUS_M } from './geo'
import type { WalkBundle } from './score'

export const BACKUP_FORMAT = 'senza-mappa-backup'

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: 1
  exportedAt: number
  walks: WalkBundle[]
  /** anche i posti salvati a mano, che non stanno in nessuna camminata */
  bangla: Bangla[]
  bagni: Bagno[]
}

export interface ImportResult {
  importate: number
  giaPresenti: number
  posti: number
}

export async function exportAll(): Promise<Backup> {
  const ids = (await db.walks.orderBy('startedAt').primaryKeys()) as string[]
  const walks: WalkBundle[] = []
  for (const id of ids) {
    const b = await loadBundle(id)
    if (b) walks.push(b)
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: Date.now(),
    walks,
    bangla: await db.bangla.toArray(),
    bagni: await db.bagni.toArray(),
  }
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const isStr = (x: unknown): x is string => typeof x === 'string'
const okPoint = (p: unknown) =>
  isObj(p) && isStr(p.id) && isStr(p.tipo) && isNum(p.lat) && isNum(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180 && isNum(p.createdAt)

/** controllo di forma: un file sbagliato non deve finire nel database */
export function looksLikeBundle(x: unknown): x is WalkBundle {
  if (!isObj(x) || !isObj(x.walk)) return false
  const w = x.walk
  return (
    isStr(w.id) &&
    isStr(w.nome) &&
    isNum(w.startedAt) &&
    Array.isArray(x.participants) &&
    x.participants.every((p) => isObj(p) && isStr(p.id) && isStr(p.soprannome)) &&
    Array.isArray(x.points) &&
    x.points.every(okPoint) &&
    Array.isArray(x.bangla) &&
    x.bangla.every((b) => isObj(b) && isStr(b.id) && isNum(b.lat) && isNum(b.lng)) &&
    (x.drinks === undefined || Array.isArray(x.drinks)) &&
    (x.reviews === undefined || Array.isArray(x.reviews)) &&
    (x.awards === undefined || Array.isArray(x.awards))
  )
}

/** una camminata importata non può risultare "in corso": la chiudiamo all'ultimo punto */
function closedWalk(w: Walk, points: Point[]): Walk {
  const last = points.reduce((m, p) => Math.max(m, p.createdAt), w.startedAt)
  const base: Walk = {
    ...w,
    modificata: !!w.modificata,
    premiazioneFatta: !!w.premiazioneFatta,
    percorso: w.percorso ?? null,
    percorsoTipo: w.percorsoTipo ?? null,
    percorsoMetri: w.percorsoMetri ?? null,
    percorsoOttimale: w.percorsoOttimale ?? null,
    ottimaleMetri: w.ottimaleMetri ?? null,
    updatedAt: Date.now(),
  }
  if (w.stato === 'attiva' || !w.endedAt) return { ...base, stato: 'da-calcolare', endedAt: w.endedAt ?? last }
  // senza percorso salvato lo ricalcoliamo
  if (!base.percorso || base.percorso.length < 2) return { ...base, stato: 'da-calcolare' }
  return base
}

/** bangla "Bangla 3" da link senza nomi: non deve sovrascrivere un nome vero */
const nomeFinto = (n: string) => /^BANGLA \d+$/i.test(n.trim())

/**
 * Importa una camminata.
 * - `keepIds` (JSON): stessi UUID, così reimportare lo stesso file non crea doppioni.
 * - senza (link): id nuovi, e i bangla si agganciano a quelli già salvati entro 40 m.
 */
export async function importBundle(b: WalkBundle, keepIds: boolean): Promise<'importata' | 'gia-presente'> {
  return db.transaction('rw', [db.walks, db.participants, db.points, db.bangla, db.bagni, db.drinks, db.reviews, db.awards], async () => {
    if (keepIds && (await db.walks.get(b.walk.id))) return 'gia-presente'
    // un link importato due volte: stessa partenza e stesso nome
    if (!keepIds && (await db.walks.where('startedAt').equals(b.walk.startedAt).filter((w) => w.nome === b.walk.nome).count())) {
      return 'gia-presente'
    }
    const t = Date.now()
    const id = (old: string, map: Map<string, string>) => {
      if (keepIds) return old
      if (!map.has(old)) map.set(old, uuid())
      return map.get(old)!
    }
    const walkIds = new Map<string, string>()
    const pIds = new Map<string, string>()
    const bIds = new Map<string, string>()
    const gIds = new Map<string, string>()
    const walkId = id(b.walk.id, walkIds)

    // bangla: si riusano quelli che ci sono già (stesso id, o entro 40 m se arrivano da un link)
    const existing = await db.bangla.toArray()
    for (const x of b.bangla) {
      if (keepIds) {
        if (!(await db.bangla.get(x.id))) await db.bangla.add({ ...x, nome: x.nome ?? '', osmId: x.osmId ?? null, updatedAt: t })
        continue
      }
      const near = existing.find((e) => distanceM(e, x) <= SAME_BANGLA_RADIUS_M)
      if (near) {
        bIds.set(x.id, near.id)
        if (!near.nome && x.nome && !nomeFinto(x.nome)) await db.bangla.update(near.id, { nome: x.nome, updatedAt: t })
      } else {
        const nuovo: Bangla = { id: id(x.id, bIds), nome: nomeFinto(x.nome) ? '' : x.nome, osmId: null, lat: x.lat, lng: x.lng, updatedAt: t }
        await db.bangla.add(nuovo)
        existing.push(nuovo)
      }
    }
    for (const g of b.bagni ?? []) {
      if (keepIds) {
        if (!(await db.bagni.get(g.id))) await db.bagni.add({ ...g, updatedAt: t })
      } else await db.bagni.add({ ...g, id: id(g.id, gIds), updatedAt: t })
    }

    const participants: Participant[] = b.participants.map((p, i) => ({
      ...p,
      id: id(p.id, pIds),
      walkId,
      ordine: isNum(p.ordine) ? p.ordine : i,
      updatedAt: t,
    }))
    const points: Point[] = b.points.map((p) => ({
      ...p,
      id: keepIds ? p.id : uuid(),
      walkId,
      accuracy: isNum(p.accuracy) ? p.accuracy : 0,
      banglaId: p.banglaId ? id(p.banglaId, bIds) : null,
      participantId: p.participantId ? id(p.participantId, pIds) : null,
      bagnoId: p.bagnoId ? id(p.bagnoId, gIds) : null,
      nota: p.nota ?? null,
      updatedAt: t,
    }))
    const drinks: Drink[] = (b.drinks ?? []).map((d) => ({
      ...d,
      id: keepIds ? d.id : uuid(),
      walkId,
      participantId: id(d.participantId, pIds),
      banglaId: id(d.banglaId, bIds),
      createdAt: isNum(d.createdAt) ? d.createdAt : b.walk.startedAt,
      updatedAt: t,
    }))
    const reviews: Review[] = (b.reviews ?? []).map((r) => ({ ...r, id: keepIds ? r.id : uuid(), walkId, banglaId: id(r.banglaId, bIds), updatedAt: t }))
    const awards: Award[] = (b.awards ?? []).map((a) => ({ ...a, id: keepIds ? a.id : uuid(), walkId, banglaId: id(a.banglaId, bIds), updatedAt: t }))

    await db.walks.add(closedWalk({ ...b.walk, id: walkId }, points))
    await db.participants.bulkPut(participants)
    await db.points.bulkPut(points)
    await db.drinks.bulkPut(drinks)
    await db.reviews.bulkPut(reviews)
    await db.awards.bulkPut(awards)
    return 'importata'
  })
}

/** riconosce cosa è stato incollato o scelto e importa tutto quello che può */
export async function importText(text: string): Promise<ImportResult> {
  const trimmed = text.trim()
  const res: ImportResult = { importate: 0, giaPresenti: 0, posti: 0 }
  const count = (r: 'importata' | 'gia-presente') => (r === 'importata' ? res.importate++ : res.giaPresenti++)

  // link condiviso
  const link = trimmed.match(/#\/v\/([A-Za-z0-9+\-_$]+)/)
  if (link && !trimmed.startsWith('{')) {
    const b = decodeBundle(link[1])
    if (!b) throw new Error('Link rotto o incompleto')
    count(await importBundle(b, false))
    return res
  }

  let data: unknown
  try {
    data = JSON.parse(trimmed)
  } catch {
    throw new Error('Non è un file di Senza Mappa né un link condiviso')
  }

  if (isObj(data) && data.format === BACKUP_FORMAT && Array.isArray(data.walks)) {
    for (const w of data.walks) if (looksLikeBundle(w)) count(await importBundle(w, true))
    // posti salvati a mano
    for (const x of Array.isArray(data.bangla) ? data.bangla : []) {
      if (isObj(x) && isStr(x.id) && isNum(x.lat) && isNum(x.lng) && x.salvato && !(await db.bangla.get(x.id))) {
        await db.bangla.add(x as unknown as Bangla)
        res.posti++
      }
    }
    for (const g of Array.isArray(data.bagni) ? data.bagni : []) {
      if (isObj(g) && isStr(g.id) && isNum(g.lat) && isNum(g.lng) && !(await db.bagni.get(g.id))) {
        await db.bagni.add(g as unknown as Bagno)
        res.posti++
      }
    }
    return res
  }

  if (looksLikeBundle(data)) {
    count(await importBundle(data, true))
    return res
  }
  throw new Error('Il file non sembra una camminata di Senza Mappa')
}
