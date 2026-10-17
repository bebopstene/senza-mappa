import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { go } from '../router'
import { Btn, MugIcon } from '../components/ui'
import { formatKm } from '../lib/score'

export default function Home() {
  const walks = useLiveQuery(() => db.walks.orderBy('startedAt').reverse().limit(3).toArray(), [], [])
  const pending = walks.filter((w) => w.stato === 'da-calcolare').length

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <MugIcon size={44} />
        <a href="#/archivio" className="etichetta text-sm underline underline-offset-4 decoration-2 min-h-[44px] flex items-center">
          ARCHIVIO
        </a>
      </div>
      <h1 className="titolo text-7xl">SENZA<br />MAPPA</h1>
      <p className="etichetta text-sm mt-3 mb-8">DOVE SIAMO? NON SI SA.</p>

      <Btn variant="ambra" size="xl" className="w-full mb-8" onClick={() => go('squadra')} testId="nuova-camminata">
        NUOVA CAMMINATA
      </Btn>

      {pending > 0 && (
        <div className="bordo bg-nero text-cemento p-3 mb-6 etichetta text-sm" role="status">
          {pending === 1 ? '1 PERCORSO DA CALCOLARE' : `${pending} PERCORSI DA CALCOLARE`}: PARTE APPENA TORNA LA RETE
        </div>
      )}

      {walks.length > 0 && (
        <section>
          <h2 className="etichetta text-sm mb-3">ULTIME CAMMINATE</h2>
          <ul className="grid gap-4">
            {walks.map((w) => (
              <li key={w.id}>
                <a
                  href={`#/rivela/${w.id}`}
                  className="block bordo shadow-pieno bg-cemento p-4 premuto"
                >
                  <div className="titolo text-2xl break-words">{w.nome}</div>
                  <div className="etichetta text-xs mt-2">
                    {new Date(w.startedAt).toLocaleDateString('it-IT')} ·{' '}
                    {w.stato === 'chiusa' ? (w.percorsoMetri != null ? formatKm(w.percorsoMetri) : 'CHIUSA') : 'PERCORSO DA CALCOLARE'}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
