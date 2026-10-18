import { describe, expect, it } from 'vitest'
import { fogGrid } from './FogMap'

describe('fogGrid', () => {
  it('scopre un blocco 3×3 per punto e unisce i blocchi che si toccano', () => {
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }]).cells.size).toBe(9)
    // due punti a ~10 m: stesso quadrato, niente doppioni
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }, { lat: 45.48609, lng: 9.18901 }]).cells.size).toBeLessThanOrEqual(12)
    // due punti lontani: due blocchi separati
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }, { lat: 45.5, lng: 9.2 }]).cells.size).toBe(18)
  })
  it('senza punti è tutta nebbia', () => {
    expect(fogGrid([]).cells.size).toBe(0)
  })
})
