import { useLiveQuery } from 'dexie-react-hooks'
import { loadBundle } from '../lib/walks'
import type { WalkBundle } from '../lib/score'

/** undefined = sto caricando, null = non esiste */
export function useBundle(walkId: string | undefined): WalkBundle | null | undefined {
  return useLiveQuery(() => (walkId ? loadBundle(walkId) : null), [walkId])
}
