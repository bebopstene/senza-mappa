// Modifica dopo la chiusura (R10): spostare o cancellare punti, correggere birre e voti.
import { useMemo, useState } from 'react'
import { go } from '../router'
import { useBundle } from '../components/useBundle'
import { WalkMap, markersFromPoints } from '../components/WalkMap'
import { banglaOrder } from '../components/RevealView'
import { BackLink, Btn, ScreenTitle, VoteBlocks } from '../components/ui'
import {
  addDrink,
  clearVote,
  computeWalkRoute,
  deletePointAfterClose,
  movePoint,
  removeDrinks,
  renameBangla,
  renameWalk,
  setVote,
} from '../lib/walks'
import type { PointType } from '../db/schema'

const TIPI: Record<PointType, string> = {
  partenza: 'PARTENZA',
  checkpoint: 'CHECKPOINT',
  'checkpoint-auto': 'CHECKPOINT AUTO',
  passante: 'PASSANTE',
  bagno: 'SOSTA BAGNO',
  perso: 'MI SONO PERSO',
  bangla: 'BANGLA',
  arrivo: 'ARRIVO',
}

export default function Modifica({ walkId }: { walkId: string }) {
  const bundle = useBundle(walkId)
  const [selected, setSelected] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [nome, setNome] = useState<string | null>(null)
  const markers = useMemo(() => (bundle ? markersFromPoints(bundle.points, bundle.bangla) : []), [bundle])

  if (!bundle) return <main className="min-h-screen cemento-texture" />
  const lista = banglaOrder(bundle)
  const participants = [...bundle.participants].sort((a, z) => a.ordine - z.ordine)
  const dirty = bundle.walk.stato === 'da-calcolare'

  const save = async () => {
    setSaving(true)
    if (nome !== null) await renameWalk(walkId, nome)
    try {
      await computeWalkRoute(walkId)
    } finally {
      setSaving(false)
      go(`rivela/${walkId}`)
    }
  }

  return (
    <main className="min-h-screen cemento-texture px-4 safe-top safe-bottom">
      <BackLink to={`rivela/${walkId}`} />
      <ScreenTitle kicker="SISTEMA I PUNTI">CORREZIONI</ScreenTitle>

      <label className="etichetta text-sm" htmlFor="nome-walk">NOME DEL GIRO</label>
      <input
        id="nome-walk"
        value={nome ?? bundle.walk.nome}
        onChange={(e) => setNome(e.target.value)}
        maxLength={60}
        className="bordo bg-schiuma w-full min-h-[52px] px-3 etichetta mt-2 mb-6"
      />

      <p className="text-sm mb-3">Trascina un segnaposto per spostarlo. Il percorso si ricalcola quando salvi.</p>
      <WalkMap
        markers={markers}
        route={dirty ? null : bundle.walk.percorso}
        editable
        onMove={(id, lat, lng) => void movePoint(id, lat, lng)}
        onMarkerClick={(id) => setSelected(id)}
        className="h-[50vh] min-h-[300px]"
      />

      <section className="mt-6">
        <h2 className="titolo text-3xl mb-3">PUNTI</h2>
        <ol className="grid gap-2">
          {bundle.points.map((p, i) => (
            <li
              key={p.id}
              className={`bordo p-3 flex items-center justify-between gap-3 ${selected === p.id ? 'bg-ambra' : 'bg-cemento'}`}
            >
              <div className="min-w-0">
                <div className="etichetta text-sm">
                  {i + 1}. {TIPI[p.tipo]}
                  {p.banglaId && ` · ${bundle.bangla.find((b) => b.id === p.banglaId)?.nome || ''}`}
                  {p.bagnoId && ` · ${bundle.bagni?.find((b) => b.id === p.bagnoId)?.nome || ''}`}
                </div>
                <div className="text-xs mt-1">
                  {new Date(p.createdAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })} · ±{p.accuracy} M
                  {p.accuracy > 50 && <span className="font-bold underline"> · IMPRECISO</span>}
                </div>
              </div>
              {confirmDel === p.id ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    className="bordo bg-rosso-linea text-schiuma etichetta text-xs px-2 min-h-[44px]"
                    onClick={async () => {
                      await deletePointAfterClose(p.id)
                      setConfirmDel(null)
                    }}
                    data-testid={`conferma-elimina-${i}`}
                  >
                    SÌ, VIA
                  </button>
                  <button type="button" className="bordo etichetta text-xs px-2 min-h-[44px]" onClick={() => setConfirmDel(null)}>
                    NO
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="bordo etichetta text-xs px-3 min-h-[44px] shrink-0"
                  onClick={() => setConfirmDel(p.id)}
                  aria-label={`Elimina punto ${i + 1}`}
                  data-testid={`elimina-${i}`}
                >
                  ELIMINA
                </button>
              )}
            </li>
          ))}
        </ol>
      </section>

      {lista.length > 0 && (
        <section className="mt-8">
          <h2 className="titolo text-3xl mb-3">BIRRE E VOTI</h2>
          <div className="grid gap-5">
            {lista.map((b) => (
              <div key={b.id} className="bordo shadow-pieno bg-cemento p-3">
                <label className="etichetta text-xs" htmlFor={`nome-bangla-${b.id}`}>
                  {b.n}. NOME DEL BANGLA
                </label>
                <input
                  id={`nome-bangla-${b.id}`}
                  defaultValue={bundle.bangla.find((x) => x.id === b.id)?.nome ?? ''}
                  placeholder={`BANGLA ${b.n}`}
                  maxLength={60}
                  onBlur={(e) => void renameBangla(b.id, e.target.value)}
                  className="bordo bg-schiuma w-full min-h-[48px] px-3 etichetta mt-2 mb-4"
                />
                <div className="mb-2 etichetta text-xs">VOTO</div>
                <VoteBlocks value={b.voto} onChange={(v) => void (v === b.voto ? clearVote(walkId, b.id) : setVote(walkId, b.id, v))} />
                <div className="mt-4 mb-2 etichetta text-xs">BIRRE</div>
                <ul className="grid gap-2">
                  {participants.map((p) => {
                    const rows = bundle.drinks.filter((d) => d.banglaId === b.id && d.participantId === p.id)
                    const n = rows.reduce((s, d) => s + d.quantita, 0)
                    return (
                      <li key={p.id} className="flex items-center justify-between gap-2">
                        <span className="etichetta text-sm truncate">{p.soprannome}</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            className="bordo w-11 h-11 titolo text-xl"
                            aria-label={`Una birra in meno a ${p.soprannome}`}
                            disabled={!rows.length}
                            onClick={() => void removeDrinks([rows[rows.length - 1].id])}
                          >
                            −
                          </button>
                          <span className="titolo w-8 text-center tabular-nums">{n}</span>
                          <button
                            type="button"
                            className="bordo w-11 h-11 titolo text-xl bg-ambra"
                            aria-label={`Una birra in più a ${p.soprannome}`}
                            onClick={() => void addDrink(walkId, b.id, p.id)}
                          >
                            +
                          </button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="sticky bottom-0 pt-4 pb-2 mt-8 cemento-texture">
        <Btn variant="ambra" className="w-full" onClick={save} disabled={saving} testId="salva-ricalcola">
          {saving ? 'RICALCOLO…' : dirty ? 'SALVA E RICALCOLA' : 'FATTO'}
        </Btn>
      </div>
    </main>
  )
}
