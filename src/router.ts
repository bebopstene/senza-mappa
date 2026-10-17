import { useEffect, useState } from 'react'

export function parseHash(hash: string): string[] {
  const h = hash.replace(/^#\/?/, '')
  return h ? h.split('/') : []
}

export function useRoute(): string[] {
  const [route, setRoute] = useState(() => parseHash(location.hash))
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  return route
}

export function go(path: string, replace = false) {
  const target = `#/${path.replace(/^\//, '')}`
  if (replace) {
    history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = target
  }
  window.scrollTo(0, 0)
}
