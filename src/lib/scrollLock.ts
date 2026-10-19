// Stops the page behind an overlay from scrolling. Counted, so a dialog opened on top of a
// sheet doesn't unlock the page when only the dialog closes.
let locks = 0

export function lockScroll(): () => void {
  locks += 1
  document.body.style.overflow = 'hidden'
  let released = false
  return () => {
    if (released) return
    released = true
    locks -= 1
    if (locks === 0) document.body.style.overflow = ''
  }
}
