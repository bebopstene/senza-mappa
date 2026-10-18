// Archivio: le camminate passate. Bangla e bagni stanno nella sezione I POSTI.
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { BackLink, ScreenTitle } from '../components/ui'
import { deleteWalk } from '../lib/walks'
import { formatKm } from '../lib/score'

export default function Archivio() {
  const walks = useLiveQuery(() => db.walks.orderBy('startedAt').reverse().toArray(), [], [])
  const [confirm, setConfirm] = useState<string | null>(null)

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to="" />
      <ScreenTitle kicker="TUTTE LE CAMMINATE">ARCHIVIO</ScreenTitle>

      {walks.length === 0 && <p className="mb-8">Ancora niente. La prima camminata finisce qui.</p>}
      <ul className="grid gap-5 mb-10">
        {walks.map((w) => (
          <li key={w.id} className="bordo shadow-pieno-lg bg-cemento">
            <a href={w.stato === 'attiva' ? '#/camminata' : `#/rivela/${w.id}`} className="block p-4">
              <div className="titolo text-2xl break-words">{w.nome}</div>
              <div className="etichetta text-xs mt-2">
                {new Date(w.startedAt).toLocaleDateString('it-IT')} ·{' '}
                {w.stato === 'attiva' ? 'IN CORSO' : w.stato === 'da-calcolare' ? 'DA CALCOLARE' : w.percorsoMetri != null ? formatKm(w.percorsoMetri) : 'CHIUSA'}
              </div>
            </a>
            {w.stato !== 'attiva' && (
              <div className="border-t-[3px] border-nero px-4 py-2 flex justify-end">
                {confirm === w.id ? (
                  <span className="flex gap-2 items-center">
                    <span className="etichetta text-xs">SICURO?</span>
                    <button type="button" className="bordo bg-rosso-linea text-schiuma etichetta text-xs px-3 min-h-[44px]" onClick={() => void deleteWalk(w.id).then(() => setConfirm(null))}>
                      ELIMINA
                    </button>
                    <button type="button" className="bordo etichetta text-xs px-3 min-h-[44px]" onClick={() => setConfirm(null)}>
                      NO
                    </button>
                  </span>
                ) : (
                  <button type="button" className="etichetta text-xs underline min-h-[44px]" onClick={() => setConfirm(w.id)}>
                    ELIMINA CAMMINATA
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <a href="#/posti" className="block bordo shadow-pieno-lg bg-muschio text-schiuma p-4 premuto" data-testid="archivio-posti">
        <div className="titolo text-3xl">I POSTI →</div>
        <p className="mt-2">Bangla visti e da provare, bagni gratis e no: tutti su una mappa.</p>
      </a>
    </main>
  )
}
