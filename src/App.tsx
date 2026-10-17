import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting } from './db/schema'
import { go, useRoute } from './router'
import { computePendingRoutes } from './lib/walks'
import Onboarding from './screens/Onboarding'
import Home from './screens/Home'
import Squadra from './screens/Squadra'
import Camminata from './screens/Camminata'
import Rivela from './screens/Rivela'
import Premiazione from './screens/Premiazione'
import Punteggio from './screens/Punteggio'
import Modifica from './screens/Modifica'
import Archivio from './screens/Archivio'
import Condivisa from './screens/Condivisa'

export default function App() {
  const route = useRoute()
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const active = useLiveQuery(() => db.walks.where('stato').equals('attiva').first(), [], null)
  const shared = route[0] === 'v'

  useEffect(() => {
    getSetting('onboarded', false).then(setOnboarded).catch(() => setOnboarded(false))
  }, [])

  // percorso da calcolare: all'avvio e appena torna la rete (R5)
  useEffect(() => {
    if (shared) return
    const run = () => void computePendingRoutes().catch((e) => console.warn(e))
    run()
    window.addEventListener('online', run)
    return () => window.removeEventListener('online', run)
  }, [shared])

  // ripresa camminata (R17): con una camminata attiva si torna sempre lì
  useEffect(() => {
    if (shared || active === null) return
    if (active && route[0] !== 'camminata') go('camminata', true)
    if (!active && route[0] === 'camminata') go('', true)
  }, [active, route, shared])

  if (shared) return <Condivisa data={route.slice(1).join('/')} />
  if (onboarded === null || active === null) return <div className="min-h-screen cemento-texture" />
  if (!onboarded) return <Onboarding onDone={() => setOnboarded(true)} />

  const id = route[1]
  switch (route[0]) {
    case 'squadra':
      return <Squadra />
    case 'camminata':
      return active ? <Camminata walk={active} /> : null
    case 'rivela':
      return <Rivela walkId={id} />
    case 'premiazione':
      return <Premiazione walkId={id} />
    case 'punteggio':
      return <Punteggio walkId={id} />
    case 'modifica':
      return <Modifica walkId={id} />
    case 'archivio':
      return <Archivio />
    default:
      return <Home />
  }
}
