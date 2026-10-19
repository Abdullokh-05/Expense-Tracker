import React from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

interface BackButtonProps {
  label: string
  // Where to go; without it the button goes back in history
  to?: string
}

// Glass pill: ‹ Home
export const BackButton: React.FC<BackButtonProps> = ({ label, to }) => {
  const navigate = useNavigate()
  return (
    <button type="button" className="backbtn" onClick={() => (to ? navigate(to) : navigate(-1))}>
      <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}

interface GlassIconButtonProps {
  label: string
  onClick: () => void
  children: React.ReactNode
  id?: string
}

// Round glass button for a page's main action, e.g. + for a new account
export const GlassIconButton: React.FC<GlassIconButtonProps> = ({ label, onClick, children, id }) => (
  <button id={id} type="button" className="addbtn" onClick={onClick} aria-label={label} title={label}>
    {children}
  </button>
)

interface PageHeaderProps {
  title: string
  back?: BackButtonProps
  // Shown on the right of the top row, usually a GlassIconButton
  action?: React.ReactNode
  // Under the title: a summary line, a total …
  children?: React.ReactNode
}

// Large page title with an optional back pill and action above it
export const PageHeader: React.FC<PageHeaderProps> = ({ title, back, action, children }) => (
  <header className="flex flex-col gap-2">
    {(back || action) && (
      <div className="ptop">
        {back ? <BackButton {...back} /> : <span />}
        {action}
      </div>
    )}
    <h1 className="t-large text-ink">{title}</h1>
    {children}
  </header>
)
