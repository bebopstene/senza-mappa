// Vista di sola lettura per chi riceve il link (R11). Non tocca il database locale.
import { useEffect, useState } from 'react'
import { decodeBundle } from '../lib/share'
import { computeOptimal, computeRoute } from '../lib/route'
import { RevealView } from '../components/RevealView'
import { ScoreBoard } from '../components/ScoreBoard'
import { MugIcon, ScreenTitle } from '../components/ui'
import type { WalkBundle } from '../lib/score'
import type { LngLat } from '../db/schema'

export default function Condivisa({ data }: { data: string }) {
  const [bundle, setBundle] = useState<WalkBundle | null | undefined>(undefined)
  const [calc, setCalc] = useState<'running' | 'done' | 'failed'>('running')

  useEffect(() => {
    const b = decodeBundle(data)
    setBundle(b)
    if (!b) return
    const coords: LngLat[] = b.points.map((p) => [p.lng, p.lat])
    if (coords.length < 2) {
      setCalc('done')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const r = await computeRoute(coords)
        let opt = null
        try {
          const o = await computeOptimal(coords[0], coords[coords.length - 1])
          if (o.tipo === 'strade') opt = o
        } catch {
          /* niente ottimale */
        }
        if (!alive) return
        setBundle({
          ...b,
          walk: {
            ...b.walk,
            stato: 'chiusa',
            percorso: r.coordinates,
            percorsoTipo: r.tipo,
            percorsoMetri: b.walk.percorsoMetri ?? r.meters,
            percorsoOttimale: opt?.coordinates ?? null,
            ottimaleMetri: b.walk.ottimaleMetri ?? opt?.meters ?? null,
            updatedAt: Date.now(),
          },
        })
        setCalc('done')
      } catch {
        if (alive) setCalc('failed')
      }
    })()
    return () => {
      alive = false
    }
  }, [data])

  if (bundle === undefined) return <main className="min-h-screen cemento-texture" />
  if (bundle === null)
    return (
      <main className="min-h-screen cemento-texture px-4 safe-top">
        <ScreenTitle>LINK ROTTO</ScreenTitle>
        <p>Il link è incompleto. Chiedi a chi l’ha mandato di rimandarlo intero.</p>
      </main>
    )

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <div className="flex items-center gap-2 mb-3">
        <MugIcon size={28} />
        <span className="etichetta text-xs">SENZA MAPPA · SOLA LETTURA</span>
      </div>
      <ScreenTitle kicker={new Date(bundle.walk.startedAt).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}>
        {bundle.walk.nome}
      </ScreenTitle>
      <RevealView
        bundle={bundle}
        status={
          calc === 'running' ? (
            <p className="bordo bg-nero text-cemento p-3 mb-4 etichetta text-sm" role="status">CALCOLO IL PERCORSO…</p>
          ) : calc === 'failed' ? (
            <p className="bordo bg-nero text-cemento p-3 mb-4 etichetta text-sm" role="status">PERCORSO NON DISPONIBILE OFFLINE</p>
          ) : null
        }
      />
      <h2 className="titolo text-4xl mt-10 mb-4">PUNTEGGIO</h2>
      <ScoreBoard bundle={bundle} />
    </main>
  )
}
