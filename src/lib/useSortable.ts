import { useRef, useState } from 'react'
import type React from 'react'
import type { Category } from '@/types'

// ── Drag to reorder one list: hold the handle and drag, or focus it and use the arrow keys ──
// Items are the list's children marked data-sortable; they can differ in height (a category
// with its subcategories open is taller), so places are worked out from where each one sits.
export function useSortable(count: number, onMove: (from: number, to: number) => void) {
  const listRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ index: number; startY: number; rects: DOMRect[]; target: number } | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const items = () => [...(listRef.current?.children ?? [])].filter((el) => (el as HTMLElement).dataset.sortable !== undefined) as HTMLElement[]

  const targetAt = (clientY: number) => {
    const d = drag.current!
    const own = d.rects[d.index]
    // The dragged item's middle, where the finger has taken it
    const middle = own.top + own.height / 2 + (clientY - d.startY)
    let target = d.index
    d.rects.forEach((rect, i) => {
      const itsMiddle = rect.top + rect.height / 2
      if (i > d.index && middle > itsMiddle) target = Math.max(target, i)
      if (i < d.index && middle < itsMiddle) target = Math.min(target, i)
    })
    return target
  }

  const start = (e: React.PointerEvent<HTMLButtonElement>, index: number) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rects = items().map((el) => el.getBoundingClientRect())
    if (!rects[index]) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { index, startY: e.clientY, rects, target: index }
    setDragIndex(index)
  }

  const moveTo = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.startY
    const target = targetAt(e.clientY)
    d.target = target
    // The dragged item follows the finger; the ones it passes step aside by its height
    const step = d.rects[d.index].height
    items().forEach((el, i) => {
      if (i === d.index) el.style.transform = `translateY(${dy}px)`
      else if (i > d.index && i <= target) el.style.transform = `translateY(${-step}px)`
      else if (i < d.index && i >= target) el.style.transform = `translateY(${step}px)`
      else el.style.transform = ''
    })
  }

  // Where the finger lifts decides the place, even if no move came in between
  const end = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const target = e.type === 'pointerup' ? targetAt(e.clientY) : d.index
    drag.current = null
    setDragIndex(null)
    items().forEach((el) => (el.style.transform = ''))
    if (target !== d.index) onMove(d.index, target)
  }

  const handleProps = (index: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => start(e, index),
    onPointerMove: moveTo,
    onPointerUp: end,
    onPointerCancel: end,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      e.preventDefault()
      const to = index + (e.key === 'ArrowUp' ? -1 : 1)
      if (to >= 0 && to < count) onMove(index, to)
    },
  })

  return { listRef, dragIndex, handleProps }
}

export const reordered = (list: Category[], from: number, to: number) => {
  const ids = list.map((c) => c.id)
  const [moved] = ids.splice(from, 1)
  ids.splice(to, 0, moved)
  return ids
}
