// Archivio: camminate passate e bangla visitati con media dei voti e premi (R13, versione locale).
import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/schema'
import { BackLink, Btn, ScreenTitle } from '../components/ui'
import { WalkMap, type MapMarker } from '../components/WalkMap'
import { CATEGORIE } from '../components/RevealView'
import { deleteWalk } from '../lib/walks'
import { formatKm } from '../lib/score'

export default function Archivio() {
  const walks = useLiveQuery(() => db.walks.orderBy('startedAt').reverse().toArray(), [], [])
  const data = useLiveQuery(async () => {
    const [bangla, points, reviews, awards] = await Promise.all([
      db.bangla.toArray(),
      db.points.where('banglaId').above('').toArray(),
      db.reviews.toArray(),
      db.awards.toArray(),
    ])
    return { bangla, points, reviews, awards }
  }, [])
  const [showMap, setShowMap] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  const rows = useMemo(() => {
    if (!data) return []
    return data.bangla
      .map((b) => {
        const votes = data.reviews.filter((r) => r.banglaId === b.id).map((r) => r.voto)
        const visite = new Set(data.points.filter((p) => p.banglaId === b.id).map((p) => p.walkId)).size
        return {
          ...b,
          media: votes.length ? votes.reduce((s, v) => s + v, 0) / votes.length : null,
          visite,
          premi: data.awards.filter((a) => a.banglaId === b.id).map((a) => CATEGORIE.find((c) => c.id === a.categoria)?.nome ?? a.categoria),
        }
      })
      .filter((b) => b.visite > 0)
      .sort((a, z) => (z.media ?? 0) - (a.media ?? 0))
  }, [data])

  const markers: MapMarker[] = rows.map((b) => ({ id: b.id, lat: b.lat, lng: b.lng, kind: 'archivio', title: b.nome || 'Bangla senza nome' }))
  const active = walks.some((w) => w.stato === 'attiva')

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

      {rows.length > 0 && (
        <section>
          <h2 className="titolo text-4xl mb-4">I BANGLA DEL GRUPPO</h2>
          {active ? (
            <p className="bordo p-3 mb-4 etichetta text-xs">MAPPA NASCOSTA: C’È UNA CAMMINATA IN CORSO</p>
          ) : showMap ? (
            <WalkMap markers={markers} className="h-[50vh] min-h-[300px] mb-6" />
          ) : (
            <Btn variant="cemento" size="md" className="w-full mb-6" onClick={() => setShowMap(true)}>
              MOSTRA LA MAPPA DEI BANGLA
            </Btn>
          )}
          <ul className="grid gap-4">
            {rows.map((b) => (
              <li key={b.id} className="bordo shadow-pieno bg-cemento flex">
                <div className="bg-muschio text-schiuma p-3 min-w-[84px] flex flex-col items-center justify-center">
                  <span className="titolo text-3xl tabular-nums">{b.media != null ? b.media.toFixed(1).replace('.', ',') : '—'}</span>
                  <span className="etichetta text-[10px]">MEDIA</span>
                </div>
                <div className="p-3 min-w-0">
                  <div className="titolo text-xl break-words">{b.nome || 'SENZA NOME'}</div>
                  <div className="etichetta text-xs mt-1">{b.visite === 1 ? '1 CAMMINATA' : `${b.visite} CAMMINATE`}</div>
                  {b.premi.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {[...new Set(b.premi)].map((p) => (
                        <span key={p} className="-rotate-3 border-[3px] border-rosso-linea text-rosso-linea titolo text-[11px] px-2">
                          {p} ×{b.premi.filter((x) => x === p).length}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
