import Dexie, { type EntityTable } from 'dexie'

export type WalkStatus = 'attiva' | 'da-calcolare' | 'chiusa'

export type PointType =
  | 'partenza'
  | 'checkpoint'
  | 'checkpoint-auto'
  | 'passante'
  | 'perso'
  | 'bangla'
  | 'arrivo'

export type LngLat = [number, number]

export interface Walk {
  id: string
  nome: string
  startedAt: number
  endedAt: number | null
  stato: WalkStatus
  /** percorso fatto, GeoJSON LineString coordinates */
  percorso: LngLat[] | null
  /** 'strade' se calcolato dal router, 'dritte' se fallback */
  percorsoTipo: 'strade' | 'dritte' | null
  percorsoMetri: number | null
  percorsoOttimale: LngLat[] | null
  ottimaleMetri: number | null
  /** true se i punti sono stati modificati dopo la chiusura */
  modificata: boolean
  /** premiazione completata o saltata */
  premiazioneFatta: boolean
  updatedAt: number
}

export interface Participant {
  id: string
  walkId: string
  soprannome: string
  ordine: number
  updatedAt: number
}

export interface Point {
  id: string
  walkId: string
  tipo: PointType
  lat: number
  lng: number
  accuracy: number
  createdAt: number
  banglaId: string | null
  /** chi ha chiesto al passante */
  participantId: string | null
  nota: string | null
  updatedAt: number
}

export interface Bangla {
  id: string
  nome: string
  osmId: string | null
  lat: number
  lng: number
  updatedAt: number
}

export interface Drink {
  id: string
  walkId: string
  participantId: string
  banglaId: string
  quantita: number
  createdAt: number
  updatedAt: number
}

export interface Review {
  id: string
  banglaId: string
  walkId: string
  voto: number
  updatedAt: number
}

export type AwardCategory = 'preferito' | 'fresca' | 'varieta' | 'gentili' | 'location'

export interface Award {
  id: string
  walkId: string
  categoria: AwardCategory
  banglaId: string
  updatedAt: number
}

export interface Setting {
  key: string
  value: unknown
}

export class SenzaMappaDB extends Dexie {
  walks!: EntityTable<Walk, 'id'>
  participants!: EntityTable<Participant, 'id'>
  points!: EntityTable<Point, 'id'>
  bangla!: EntityTable<Bangla, 'id'>
  drinks!: EntityTable<Drink, 'id'>
  reviews!: EntityTable<Review, 'id'>
  awards!: EntityTable<Award, 'id'>
  settings!: EntityTable<Setting, 'key'>

  constructor(name = 'senza-mappa') {
    super(name)
    this.version(1).stores({
      walks: 'id, stato, startedAt',
      participants: 'id, walkId',
      points: 'id, walkId, createdAt, banglaId, [walkId+createdAt]',
      bangla: 'id, osmId',
      drinks: 'id, walkId, banglaId, participantId',
      reviews: 'id, banglaId, walkId, [walkId+banglaId]',
      awards: 'id, walkId, [walkId+categoria]',
      settings: 'key',
    })
  }
}

export const db = new SenzaMappaDB()

export const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
      })

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key)
  return row ? (row.value as T) : fallback
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value })
}
