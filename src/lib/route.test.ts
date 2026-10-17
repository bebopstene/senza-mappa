import { describe, expect, it } from 'vitest'
import { chunk, dedupe } from './route'
import type { LngLat } from '../db/schema'

describe('chunk', () => {
  it('spezza in tratti che condividono il punto di giunzione', () => {
    const coords = Array.from({ length: 60 }, (_, i) => [9 + i * 0.001, 45] as LngLat)
    const parts = chunk(coords, 25)
    expect(parts.every((p) => p.length <= 25 && p.length >= 2)).toBe(true)
    for (let i = 1; i < parts.length; i++) expect(parts[i][0]).toEqual(parts[i - 1][parts[i - 1].length - 1])
    expect(parts[parts.length - 1].at(-1)).toEqual(coords.at(-1))
  })
  it('lascia intatti i percorsi corti', () => {
    expect(chunk([[0, 0], [1, 1]] as LngLat[])).toHaveLength(1)
  })
})

describe('dedupe', () => {
  it('toglie i punti consecutivi quasi uguali', () => {
    expect(dedupe([[9, 45], [9.00001, 45], [9.01, 45]] as LngLat[])).toHaveLength(2)
  })
})
