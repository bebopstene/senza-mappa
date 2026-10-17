// Punteggio come tabellone delle partenze della metro.
import { useMemo } from 'react'
import { computeScore, type WalkBundle } from '../lib/score'

export function ScoreBoard({ bundle }: { bundle: WalkBundle }) {
  const score = useMemo(() => computeScore(bundle), [bundle])
  return (
    <div>
      <div className="bordo shadow-pieno-lg bg-nero text-ambra p-4 mb-6">
        <div className="etichetta text-xs text-cemento">PUNTEGGIO DI SQUADRA</div>
        <div className="titolo text-[clamp(64px,24vw,120px)] tabular-nums" data-testid="punteggio-squadra">
          {score.squadra}
        </div>
      </div>

      <section className="bordo bg-nero text-ambra mb-6" aria-label="Persone">
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-3 py-2 border-b-[3px] border-cemento etichetta text-xs text-cemento">
          <span>NOME</span>
          <span className="text-right">BIRRE</span>
          <span className="text-right">PUNTI</span>
        </div>
        <ul>
          {score.persone.map((p) => (
            <li key={p.participantId} className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-center px-3 py-3 border-b border-cemento/30">
              <div className="min-w-0">
                <span className="titolo text-2xl break-all">{p.soprannome}</span>
                {p.titoli.map((t) => (
                  <span
                    key={t}
                    className="ml-2 inline-block -rotate-6 border-[3px] border-rosso-linea text-rosso-linea bg-cemento titolo text-xs px-2 py-0.5 align-middle"
                  >
                    {t}
                  </span>
                ))}
                {p.domande > 0 && <div className="etichetta text-xs text-cemento mt-1">{p.domande} DOMANDE AI PASSANTI</div>}
              </div>
              <span className="titolo text-xl text-cemento tabular-nums text-right">{p.birre}</span>
              <span className="titolo text-3xl tabular-nums text-right">{p.punti}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Dettaglio punti">
        <h2 className="etichetta text-sm mb-2">COME SI ARRIVA AL TOTALE</h2>
        <ul className="bordo bg-cemento divide-y-[3px] divide-nero">
          {score.righe.map((r) => (
            <li key={r.voce} className="flex justify-between gap-3 px-3 py-2">
              <span className="etichetta text-sm">
                {r.voce} <span className="opacity-70">× {String(r.quantita).replace('.', ',')}</span>
              </span>
              <span className="titolo tabular-nums">{r.punti > 0 ? `+${r.punti}` : r.punti}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm mt-3">Le birre si contano ma valgono zero punti. I pesi si tarano dopo la prima camminata.</p>
      </section>
    </div>
  )
}
