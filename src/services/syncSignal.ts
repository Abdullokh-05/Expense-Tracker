// Lets the database layer say "something changed, sync soon" without importing the sync
// service (which imports the database layer itself)
let listener: (() => void) | null = null

export function onQueued(next: () => void): void {
  listener = next
}

export function notifyQueued(): void {
  listener?.()
}
