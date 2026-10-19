import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

interface RowProps {
  id?: string
  // A Lucide icon or an emoji, shown in a rounded tile
  icon?: React.ReactNode
  // Fills the icon tile with this colour (accounts use their own colour)
  iconTone?: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  value?: React.ReactNode
  // Anything after the value, such as a switch
  end?: React.ReactNode
  // A chevron for rows that open something; 'open' turns it down for a row expanded in place
  chevron?: boolean | 'open'
  unread?: boolean
  danger?: boolean
  onClick?: () => void
  to?: string
  className?: string
}

// One row of a list: bordered inside pop-ups, flat inside a RowGroup
export const Row: React.FC<RowProps> = ({
  id,
  icon,
  iconTone,
  title,
  subtitle,
  value,
  end,
  chevron,
  unread,
  danger,
  onClick,
  to,
  className = '',
}) => {
  const classes = `prow${danger ? ' danger' : ''} ${className}`
  const content = (
    <>
      {icon !== undefined && (
        <span
          className={`prow-ico${iconTone ? ' tone' : ''}`}
          style={iconTone ? ({ '--c': iconTone } as React.CSSProperties) : undefined}
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      <span className="prow-main">
        <span className="prow-title"><span>{title}</span></span>
        {subtitle && <span className="prow-sub">{subtitle}</span>}
      </span>
      {(value !== undefined || unread || end || chevron) && (
        <span className="prow-end">
          {value !== undefined && <span className="val">{value}</span>}
          {unread && <span className="udot" aria-hidden="true" />}
          {end}
          {chevron && (
            <span className={`prow-go${chevron === 'open' ? ' open' : ''}`} aria-hidden="true">
              <ChevronRight size={14} strokeWidth={2.25} />
            </span>
          )}
        </span>
      )}
    </>
  )

  if (to) {
    return <Link id={id} to={to} className={classes}>{content}</Link>
  }
  if (onClick) {
    return <button id={id} type="button" onClick={onClick} className={classes}>{content}</button>
  }
  return <div id={id} className={classes}>{content}</div>
}

interface RowGroupProps {
  // Small uppercase heading above the group
  title?: string
  // Grey explanation under the group
  caption?: React.ReactNode
  // 'group' joins rows into one rounded block (Settings); 'list' keeps them as separate bordered rows (pop-ups)
  variant?: 'group' | 'list'
  children: React.ReactNode
  className?: string
}

export const RowGroup: React.FC<RowGroupProps> = ({ title, caption, variant = 'group', children, className = '' }) => (
  <section className={`flex flex-col gap-2 ${className}`}>
    {title && <h2 className="t-over px-1">{title}</h2>}
    <div className={variant === 'group' ? 'sgroup' : 'plist'}>{children}</div>
    {caption && <p className="sgroup-cap">{caption}</p>}
  </section>
)
