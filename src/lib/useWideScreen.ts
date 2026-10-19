import { useEffect, useState } from 'react'

// The desktop layout: the sidebar instead of the tab bar, typing instead of the keypad
const WIDE = '(min-width: 1024px)'

export function useWideScreen(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(WIDE).matches)
  useEffect(() => {
    const list = window.matchMedia(WIDE)
    const update = () => setWide(list.matches)
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [])
  return wide
}
