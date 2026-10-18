import { describe, expect, it } from 'vitest'
import { fogGrid } from './FogMap'

describe('fogGrid', () => {
  it('scopre solo il quadrato da 50 m del punto', () => {
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }]).cells.size).toBe(1)
    // due punti a pochi metri: al massimo due quadrati, niente doppioni
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }, { lat: 45.48602, lng: 9.18901 }]).cells.size).toBeLessThanOrEqual(2)
    // due punti lontani: due quadrati separati
    expect(fogGrid([{ lat: 45.486, lng: 9.189 }, { lat: 45.5, lng: 9.2 }]).cells.size).toBe(2)
  })
  it('senza punti è tutta nebbia', () => {
    expect(fogGrid([]).cells.size).toBe(0)
  })
})
