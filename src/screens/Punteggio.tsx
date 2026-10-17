import { go } from '../router'
import { useBundle } from '../components/useBundle'
import { ScoreBoard } from '../components/ScoreBoard'
import { BackLink, Btn, ScreenTitle } from '../components/ui'

export default function Punteggio({ walkId }: { walkId: string }) {
  const bundle = useBundle(walkId)
  if (!bundle) return <main className="min-h-screen cemento-texture" />
  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to={`rivela/${walkId}`} label="← PERCORSO" />
      <ScreenTitle kicker={bundle.walk.nome}>PARTENZE</ScreenTitle>
      <ScoreBoard bundle={bundle} />
      <div className="grid gap-4 mt-8">
        <Btn variant="cemento" onClick={() => go(`rivela/${walkId}`)}>TORNA AL PERCORSO</Btn>
        {bundle.walk.premiazioneFatta && bundle.points.some((p) => p.tipo === 'bangla') && (
          <button type="button" className="etichetta underline min-h-[44px]" onClick={() => go(`premiazione/${walkId}`)}>
            RIFAI LA PREMIAZIONE
          </button>
        )}
        <Btn variant="nero" onClick={() => go('')}>HOME</Btn>
      </div>
    </main>
  )
}
