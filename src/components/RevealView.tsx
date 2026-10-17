import { useMemo, useState, type ReactNode } from 'react'
import { WalkMap, markersFromPoints } from './WalkMap'
import { computeStats, formatDuration, formatKm, type WalkBundle } from '../lib/score'
import { MugIcon } from './ui'

export const CATEGORIE = [
  { id: 'preferito', nome: 'BANGLA PREFERITO', desc: 'Il migliore in assoluto della serata' },
  { id: 'fresca', nome: 'BIRRA PIÙ FRESCA', desc: 'Il frigo più freddo' },
  { id: 'varieta', nome: 'PIÙ VARIETÀ', desc: 'Dalle industriali alle artigianali' },
  { id: 'gentili', nome: 'PIÙ GENTILI', desc: 'L’accoglienza migliore al banco' },
  { id: 'location', nome: 'LOCATION MIGLIORE', desc: 'Posizione, spazio fuori, atmosfera della via' },
] as const

export function banglaOrder(b: WalkBundle) {
  const ids: string[] = []
  for (const p of b.points) if (p.tipo === 'bangla' && p.banglaId && !ids.includes(p.banglaId)) ids.push(p.banglaId)
  return ids.map((id, i) => {
    const bangla = b.bangla.find((x) => x.id === id)
    return {
      id,
      n: i + 1,
      nome: bangla?.nome || `BANGLA ${i + 1}`,
      voto: b.reviews.find((r) => r.banglaId === id)?.voto ?? null,
      birre: b.drinks.filter((d) => d.banglaId === id).reduce((s, d) => s + d.quantita, 0),
      premi: b.awards.filter((a) => a.banglaId === id).map((a) => CATEGORIE.find((c) => c.id === a.categoria)?.nome ?? a.categoria),
    }
  })
}

function Stat({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  return (
    <div className={`bordo bg-cemento p-3 ${wide ? 'col-span-2' : ''}`}>
      <div className="titolo text-3xl tabular-nums break-words">{value}</div>
      <div className="etichetta text-xs mt-1">{label}</div>
    </div>
  )
}

export function RevealView({ bundle, status }: { bundle: WalkBundle; status?: ReactNode }) {
  const stats = useMemo(() => computeStats(bundle), [bundle])
  const markers = useMemo(() => markersFromPoints(bundle.points, bundle.bangla), [bundle.points, bundle.bangla])
  const lista = useMemo(() => banglaOrder(bundle), [bundle])
  const [legend, setLegend] = useState(false)
  const route = bundle.walk.percorso

  return (
    <div>
      {status}
      <WalkMap
        key={`${bundle.walk.id}-${bundle.walk.updatedAt}`}
        route={route}
        optimal={bundle.walk.percorsoOttimale}
        markers={markers}
        className="h-[58vh] min-h-[320px]"
      />
      <button type="button" className="etichetta text-xs underline mt-3 min-h-[44px]" onClick={() => setLegend(!legend)} aria-expanded={legend}>
        {legend ? 'NASCONDI LEGENDA' : 'LEGENDA'}
      </button>
      {legend && (
        <ul className="grid gap-2 text-sm mb-3">
          <li className="flex items-center gap-3"><span className="inline-block w-10 h-[8px] bg-rosso-linea outline-[3px] outline outline-nero" /> IL VOSTRO PERCORSO</li>
          <li className="flex items-center gap-3"><span className="inline-block w-10 border-t-4 border-dashed border-nero" /> IL PERCORSO PIÙ BREVE</li>
          <li className="flex items-center gap-3"><MugIcon size={22} /> BANGLA, IN ORDINE</li>
          <li className="flex items-center gap-3"><span className="inline-block w-3 h-3 border-[3px] border-nero bg-schiuma" /> CHECKPOINT</li>
          <li className="flex items-center gap-3"><span className="inline-block w-5 h-5 bg-nero" /> PARTENZA E ARRIVO</li>
        </ul>
      )}
      {bundle.walk.percorsoTipo === 'dritte' && (
        <p className="etichetta text-xs mt-2 text-rosso-linea">IL ROUTER NON HA RISPOSTO SU QUALCHE TRATTO: LINEE DRITTE</p>
      )}

      <section className="mt-6" aria-label="Statistiche">
        <div className="grid grid-cols-2 gap-0 [&>*]:-mt-[3px] [&>*]:-ml-[3px] pl-[3px] pt-[3px]">
          <Stat label="DISTANZA" value={formatKm(stats.metri)} />
          <Stat label="DURATA" value={formatDuration(stats.durataMs)} />
          <Stat label="BANGLA" value={stats.bangla} />
          <Stat label="PASSANTI" value={stats.passanti} />
          <Stat label="CHECKPOINT" value={stats.checkpoint} />
          <Stat label="TRA UNA TAPPA E L’ALTRA" value={stats.mediaTraTappeMs != null ? formatDuration(stats.mediaTraTappeMs) : '—'} />
          {stats.deviazione && (
            <Stat
              wide
              label="DEVIAZIONE DAL PERCORSO PIÙ BREVE"
              value={`${stats.deviazione.metri >= 0 ? '+' : ''}${(stats.deviazione.metri / 1000).toFixed(1).replace('.', ',')} KM · ${
                stats.deviazione.percento >= 0 ? '+' : ''
              }${stats.deviazione.percento}%`}
            />
          )}
        </div>
      </section>

      {lista.length > 0 && (
        <section className="mt-8">
          <h2 className="titolo text-3xl mb-3">I BANGLA</h2>
          <ol className="grid gap-3">
            {lista.map((b) => (
              <li key={b.id} className="bordo shadow-pieno bg-cemento p-3 flex gap-3 items-start">
                <span className="titolo text-3xl bg-nero text-ambra min-w-[44px] text-center py-1">{b.n}</span>
                <div className="min-w-0 flex-1">
                  <div className="titolo text-xl break-words">{b.nome}</div>
                  <div className="flex gap-1 mt-2" aria-label={b.voto ? `Voto ${b.voto} su 5` : 'Nessun voto'}>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <span key={v} className={`w-5 h-5 border-[3px] border-nero ${b.voto && v <= b.voto ? 'bg-ambra' : ''}`} />
                    ))}
                  </div>
                  <div className="etichetta text-xs mt-2">{b.birre} BIRRE</div>
                  {b.premi.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {b.premi.map((p) => (
                        <span key={p} className="-rotate-3 border-[3px] border-rosso-linea text-rosso-linea titolo text-xs px-2 py-0.5">
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="mt-8">
        <h2 className="etichetta text-sm mb-2">BIRRE PER PERSONA · SOLO RIEPILOGO</h2>
        <ul className="bordo bg-cemento divide-y-[3px] divide-nero">
          {stats.birrePerPersona.map((p) => (
            <li key={p.soprannome} className="flex justify-between px-3 py-2">
              <span className="etichetta">{p.soprannome}</span>
              <span className="titolo tabular-nums">{p.birre}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
