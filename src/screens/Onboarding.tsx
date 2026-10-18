import { useState } from 'react'
import { setSetting } from '../db/schema'
import { getBestFix } from '../lib/geo'
import { unlockAudio } from '../lib/feedback'
import { Btn, MugIcon } from '../components/ui'

const REGOLE = [
  { n: '1', t: 'NIENTE NAVIGATORE', d: 'Durante il giro l’app non mostra mappe, coordinate o direzioni.' },
  { n: '2', t: 'CHIEDI A UN UMANO', d: 'Se non sapete dove andare, chiedete a un passante. Mai al telefono.' },
  { n: '3', t: 'BIRRA A OGNI TAPPA', d: 'Ogni bangla si segna appena entrati. Il percorso lo vedete solo alla fine.' },
]

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [asking, setAsking] = useState(false)

  const start = async () => {
    unlockAudio()
    setAsking(true)
    // chiediamo il permesso ora, dopo aver spiegato perché. Se lo negano lo gestiamo al primo tap.
    try {
      await getBestFix({ maxMs: 4000, goodEnoughM: 1000 })
    } catch {
      /* gestito più avanti */
    }
    await setSetting('onboarded', true)
    onDone()
  }

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <MugIcon size={48} />
        <span className="etichetta text-sm">CAMMINATE + BANGLA</span>
      </div>
      <h1 className="titolo text-7xl mb-2">SENZA<br />MAPPA</h1>
      <div className="inline-block self-start border-[5px] border-rosso-linea text-rosso-linea titolo text-2xl px-3 py-1 -rotate-6 my-4">
        VIETATO GOOGLE MAPS
      </div>
      <ol className="grid gap-4 mb-6">
        {REGOLE.map((r) => (
          <li key={r.n} className="bordo shadow-pieno bg-cemento p-4 flex gap-4">
            <span className="titolo text-5xl">{r.n}</span>
            <div>
              <div className="titolo text-2xl">{r.t}</div>
              <p className="mt-1">{r.d}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="bordo bg-muschio text-schiuma p-4 mb-6">
        <h2 className="etichetta text-sm mb-2">PERCHÉ SERVE LA POSIZIONE</h2>
        <p>
          La leggiamo solo quando toccate un pulsante (o quando riaprite l’app), mai in continuo. Resta sul telefono. Alla fine
          serve per disegnare il percorso.
        </p>
      </section>
      <div className="mt-auto">
        <Btn variant="nero" size="xl" className="w-full" onClick={start} disabled={asking} testId="onboarding-ok">
          {asking ? 'UN ATTIMO…' : 'HO CAPITO'}
        </Btn>
      </div>
    </main>
  )
}
