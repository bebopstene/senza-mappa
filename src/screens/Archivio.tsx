// Archivio: le camminate passate, eliminabili una alla volta o in blocco (es. quelle di prova).
// Bangla e bagni stanno nella sezione I POSTI.
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { BackLink, Btn, ScreenTitle, Sheet, Stamp, useStamp } from '../components/ui'
import { deleteWalks } from '../lib/walks'
import { formatKm } from '../lib/score'

export default function Archivio() {
  const walks = useLiveQuery(() => db.walks.orderBy('startedAt').reverse().toArray(), [], [])
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<string[] | null>(null)
  const [stamp, showStamp] = useStamp()

  const deletable = walks.filter((w) => w.stato !== 'attiva')
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  const stopSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  const doDelete = async (ids: string[]) => {
    await deleteWalks(ids)
    setConfirm(null)
    stopSelecting()
    showStamp(ids.length === 1 ? 'ELIMINATA' : `${ids.length} ELIMINATE`, 1100)
  }

  const names = (ids: string[]) => walks.filter((w) => ids.includes(w.id)).map((w) => w.nome)

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to="" />
      <ScreenTitle kicker="TUTTE LE CAMMINATE">ARCHIVIO</ScreenTitle>

      {deletable.length > 0 && (
        <div className="flex flex-wrap gap-3 mb-5">
          {selecting ? (
            <>
              <button
                type="button"
                className="bordo etichetta text-sm min-h-[44px] px-3"
                onClick={() => setSelected(selected.size === deletable.length ? new Set() : new Set(deletable.map((w) => w.id)))}
                data-testid="seleziona-tutte"
              >
                {selected.size === deletable.length ? 'NESSUNA' : 'TUTTE'}
              </button>
              <button type="button" className="bordo etichetta text-sm min-h-[44px] px-3" onClick={stopSelecting}>
                ANNULLA
              </button>
            </>
          ) : (
            <button type="button" className="bordo etichetta text-sm min-h-[44px] px-3" onClick={() => setSelecting(true)} data-testid="seleziona">
              SELEZIONA PER ELIMINARE
            </button>
          )}
        </div>
      )}

      {walks.length === 0 && <p className="mb-8">Ancora niente. La prima camminata finisce qui.</p>}
      <ul className="grid gap-5 mb-10">
        {walks.map((w) => {
          const attiva = w.stato === 'attiva'
          const sel = selected.has(w.id)
          const info = (
            <>
              <div className="titolo text-2xl">{w.nome}</div>
              <div className="etichetta text-xs mt-2">
                {new Date(w.startedAt).toLocaleDateString('it-IT')} ·{' '}
                {attiva ? 'IN CORSO' : w.stato === 'da-calcolare' ? 'DA CALCOLARE' : w.percorsoMetri != null ? formatKm(w.percorsoMetri) : 'CHIUSA'}
              </div>
            </>
          )
          return (
            <li key={w.id} className={`bordo shadow-pieno-lg ${sel ? 'bg-ambra' : 'bg-cemento'}`} data-testid="card-camminata">
              {selecting && !attiva ? (
                <label className="flex gap-4 items-start p-4 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggle(w.id)}
                    className="w-7 h-7 mt-1 accent-nero shrink-0"
                    aria-label={`Seleziona ${w.nome}`}
                  />
                  <div className="min-w-0">{info}</div>
                </label>
              ) : (
                <div className="flex items-stretch">
                  <a href={attiva ? '#/camminata' : `#/rivela/${w.id}`} className="block p-4 flex-1 min-w-0">
                    {info}
                  </a>
                  {!attiva && !selecting && (
                    <button
                      type="button"
                      className="border-l-[3px] border-nero etichetta text-xs px-3 min-w-[64px] hover:bg-nero hover:text-cemento"
                      onClick={() => setConfirm([w.id])}
                      aria-label={`Elimina ${w.nome}`}
                      data-testid="elimina-camminata"
                    >
                      ELIMINA
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {selecting && (
        <div className="sticky bottom-0 pb-3 pt-2">
          <Btn variant="nero" className="w-full" disabled={selected.size === 0} onClick={() => setConfirm([...selected])} testId="elimina-selezionate">
            {selected.size === 0 ? 'SCEGLI LE CAMMINATE' : selected.size === 1 ? 'ELIMINA 1 CAMMINATA' : `ELIMINA ${selected.size} CAMMINATE`}
          </Btn>
        </div>
      )}

      {!selecting && (
        <a href="#/posti" className="block bordo shadow-pieno-lg bg-muschio text-schiuma p-4 premuto" data-testid="archivio-posti">
          <div className="titolo text-3xl">I POSTI →</div>
          <p className="mt-2">Bangla visti e da provare, bagni gratis e no: tutti su una mappa.</p>
        </a>
      )}

      {confirm && (
        <ConfirmDelete names={names(confirm)} onCancel={() => setConfirm(null)} onConfirm={() => void doDelete(confirm)} />
      )}
      {stamp && <Stamp text={stamp} small />}
    </main>
  )
}

export function ConfirmDelete({ names, onCancel, onConfirm }: { names: string[]; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Sheet title={names.length === 1 ? 'ELIMINO?' : `ELIMINO ${names.length} CAMMINATE?`} onClose={onCancel}>
      <ul className="mb-4 grid gap-1">
        {names.slice(0, 6).map((n, i) => (
          <li key={i} className="etichetta text-sm">· {n}</li>
        ))}
        {names.length > 6 && <li className="etichetta text-sm">· E ALTRE {names.length - 6}</li>}
      </ul>
      <p className="mb-5">
        Spariscono punti, birre, voti e premi. Vanno via anche i bangla e i bagni segnati solo lì, a meno che non li abbiate salvati in I POSTI.
        Non si torna indietro.
      </p>
      <div className="grid gap-3 mb-3">
        <Btn variant="nero" className="w-full" onClick={onConfirm} testId="conferma-elimina">
          SÌ, ELIMINA
        </Btn>
        <button type="button" className="etichetta underline min-h-[44px]" onClick={onCancel}>
          {names.length === 1 ? 'NO, TIENILA' : 'NO, TIENILE'}
        </button>
      </div>
    </Sheet>
  )
}
