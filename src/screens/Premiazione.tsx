import { useEffect, useState } from 'react'
import { go } from '../router'
import { useBundle } from '../components/useBundle'
import { CATEGORIE, banglaOrder } from '../components/RevealView'
import { BackLink, Btn, ScreenTitle, Stamp, useStamp } from '../components/ui'
import { finishAwards, setAward } from '../lib/walks'

export default function Premiazione({ walkId }: { walkId: string }) {
  const bundle = useBundle(walkId)
  const [i, setI] = useState(0)
  const [stamp, showStamp] = useStamp()
  const lista = bundle ? banglaOrder(bundle) : []

  // con un solo bangla: vince tutto d'ufficio e la premiazione si salta
  useEffect(() => {
    if (!bundle || lista.length !== 1) return
    void (async () => {
      for (const c of CATEGORIE) await setAward(walkId, c.id, lista[0].id)
      await finishAwards(walkId)
      go(`punteggio/${walkId}`, true)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.walk.id, lista.length])

  if (!bundle) return <main className="min-h-screen cemento-texture" />
  if (lista.length === 0) {
    return (
      <main className="min-h-screen cemento-texture px-4 safe-top">
        <BackLink to={`rivela/${walkId}`} />
        <ScreenTitle>NESSUN BANGLA DA PREMIARE</ScreenTitle>
        <Btn variant="ambra" className="w-full" onClick={() => go(`punteggio/${walkId}`)}>PUNTEGGIO FINALE</Btn>
      </main>
    )
  }
  if (lista.length === 1) return <main className="min-h-screen cemento-texture" />

  const cat = CATEGORIE[i]
  const current = bundle.awards.find((a) => a.categoria === cat.id)?.banglaId

  const advance = async () => {
    if (i < CATEGORIE.length - 1) setI(i + 1)
    else {
      await finishAwards(walkId)
      go(`punteggio/${walkId}`, true)
    }
  }

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom flex flex-col">
      <BackLink to={`rivela/${walkId}`} />
      <div className="etichetta text-sm mb-2">PREMIAZIONE · {i + 1}/{CATEGORIE.length}</div>
      <section className="bordo shadow-pieno-lg bg-muschio text-schiuma p-4 mb-6">
        <h1 className="titolo text-5xl">{cat.nome}</h1>
        <p className="mt-2">{cat.desc}</p>
      </section>
      <div className="grid gap-4 mb-6">
        {lista.map((b) => (
          <Btn
            key={b.id}
            variant={current === b.id ? 'ambra' : 'cemento'}
            className="w-full justify-start"
            testId={`premio-${b.n}`}
            onClick={async () => {
              await setAward(walkId, cat.id, b.id)
              showStamp('PREMIATO', 700)
              setTimeout(() => void advance(), 650)
            }}
          >
            <span className="bg-nero text-ambra px-2">{b.n}</span>
            <span className="text-left break-words">{b.nome}</span>
          </Btn>
        ))}
      </div>
      <div className="mt-auto grid gap-3">
        <Btn variant="nero" onClick={advance} testId="salta">SALTA</Btn>
        <button
          type="button"
          className="etichetta underline min-h-[44px]"
          onClick={async () => {
            await finishAwards(walkId)
            go(`punteggio/${walkId}`, true)
          }}
        >
          SALTA TUTTA LA PREMIAZIONE
        </button>
      </div>
      {stamp && <Stamp text={stamp} small />}
    </main>
  )
}
