import type { RecurringFrequency } from '@/types'

// A planned payment as a repeating all-day event for the phone's calendar (.ics). The calendar
// then reminds of it on time even while the app is closed, which the app itself can't do
// without a server.
export interface CalendarPayment {
  id: string
  title: string
  // What the reminder shows, e.g. "−120 000 soʻm · Humo card"
  details: string
  // The first day it falls on, YYYY-MM-DD
  date: string
  frequency: RecurringFrequency
  // Days before to alert (0: that morning); null: no alert
  remindDaysBefore: number | null
}

const RRULE: Record<RecurringFrequency, string> = {
  daily: 'FREQ=DAILY',
  weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY',
  yearly: 'FREQ=YEARLY',
}

// Commas, semicolons and backslashes are special in .ics text, and lines end in CRLF
const escape = (text: string) => text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export function calendarFile(payment: CalendarPayment): string {
  const day = payment.date.replace(/-/g, '')
  const next = new Date(`${payment.date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  // An all-day event's alert counts from midnight: 9:00 that day, or 9:00 N days before
  const alarm =
    payment.remindDaysBefore === null
      ? []
      : [
          'BEGIN:VALARM',
          'ACTION:DISPLAY',
          `DESCRIPTION:${escape(payment.title)}`,
          `TRIGGER:${payment.remindDaysBefore === 0 ? 'PT9H' : `-P${payment.remindDaysBefore - 1}DT15H`}`,
          'END:VALARM',
        ]
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Xarajat//Planned payments//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${payment.id}@xarajat`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
    `RRULE:${RRULE[payment.frequency]}`,
    `SUMMARY:${escape(payment.title)}`,
    `DESCRIPTION:${escape(payment.details)}`,
    'TRANSP:TRANSPARENT',
    ...alarm,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

// Opens the event for the calendar. An iPhone or iPad shows its "Add to Calendar" sheet when it
// opens the file itself (a download would only save it to Files); elsewhere the file is saved.
export function addToCalendar(payment: CalendarPayment): void {
  const ics = calendarFile(payment)
  if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))) {
    window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`
    return
  }
  const name = payment.title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'payment'
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${name}.ics`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
