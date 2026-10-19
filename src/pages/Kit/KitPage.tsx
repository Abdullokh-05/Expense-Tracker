import React, { useState } from 'react'
import { ArrowLeftRight, Bell, Filter, Lock, Plus, Search, Sigma, Star, Trash2, X } from 'lucide-react'
import { useAppStore } from '@/store/appStore'
import { applyTheme } from '@/lib/theme'
import type { AppLanguage, AppTheme } from '@/types'
import { PageHeader, GlassIconButton } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Switch } from '@/components/ui/Switch'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PopUp } from '@/components/ui/PopUp'
import { Row, RowGroup } from '@/components/ui/Row'
import { BottomSheet, ConfirmDialog } from '@/components/ui/BottomSheet'
import { toast } from '@/components/ui/Toast'

// Development-only sheet of the shared components (the redesign's "Components and states"
// frame), to check them in both themes and all languages while screens are converted.
const KitPage: React.FC = () => {
  const { settings, setTheme, setLanguage } = useAppStore()
  const [typeFilter, setTypeFilter] = useState('all')
  const [kind, setKind] = useState<'outcome' | 'income'>('outcome')
  const [switchOn, setSwitchOn] = useState(true)
  const [rowSwitch, setRowSwitch] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [popOpen, setPopOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sort, setSort] = useState('newest')

  const changeTheme = (theme: AppTheme) => {
    setTheme(theme)
    applyTheme(theme)
  }

  return (
    <div className="flex flex-col gap-8 max-w-[640px]">
      <PageHeader
        title="Components"
        back={{ label: 'Home', to: '/' }}
        action={<GlassIconButton label="New account" onClick={() => toast.success('Glass + pressed')}><Plus size={22} /></GlassIconButton>}
      >
        <p className="t-sub">Shared pieces of the redesign. Development builds only.</p>
      </PageHeader>

      <RowGroup title="Theme and language">
        <div className="prow prow-col">
          <SegmentedControl
            label="Theme"
            value={settings.theme}
            onChange={changeTheme}
            options={[
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
              { value: 'system', label: 'Auto' },
            ]}
          />
          <SegmentedControl<AppLanguage>
            label="Language"
            value={settings.language}
            onChange={setLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'ru', label: 'Русский' },
              { value: 'uz', label: "O'zbekcha" },
            ]}
          />
        </div>
      </RowGroup>

      <section className="flex flex-col gap-3">
        <h2 className="t-over px-1">Button · variants, sizes, states</h2>
        <div className="flex flex-wrap gap-2">
          <Button>Save expense</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="tinted">Add your first entry</Button>
          <Button variant="ghost">Reset</Button>
          <Button variant="danger">Delete</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small 36</Button>
          <Button>Medium 44</Button>
          <Button size="lg">Large 52</Button>
          <Button disabled>Disabled</Button>
          <Button loading>Saving</Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="t-over px-1">Icon buttons · always 44 × 44</h2>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="iconbtn" aria-label="Close"><X size={20} /></button>
          <button type="button" className="iconbtn filled" aria-label="Notifications"><Bell size={20} /></button>
          <button type="button" className="iconbtn filled" aria-label="Search"><Search size={20} /></button>
          <button type="button" className="iconbtn danger" aria-label="Delete"><Trash2 size={20} /></button>
          <button type="button" className="sqbtn" aria-label="Filters"><Filter size={20} /></button>
          <button type="button" className="sqbtn on" aria-label="Filters, 2 on"><Filter size={20} /><span className="count">2</span></button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="t-over px-1">Chips, pills, segmented</h2>
        <div className="flex items-center gap-2">
          <div className="chips one flex-1 min-w-0" role="radiogroup" aria-label="Type">
            {['all', 'outcome', 'income', 'transfers'].map((key) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={typeFilter === key}
                className={`chip${typeFilter === key ? ' on' : ''}`}
                onClick={() => setTypeFilter(key)}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
          <button type="button" className="sqbtn" aria-label="Filters"><Filter size={20} /></button>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="pill danger">Over by 96 000</span>
          <span className="pill ok">Enough saved</span>
          <span className="pill neutral">Automatic</span>
        </div>
        <SegmentedControl
          label="Outcome or income"
          value={kind}
          onChange={setKind}
          options={[{ value: 'outcome', label: 'Outcome' }, { value: 'income', label: 'Income' }]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="t-over px-1">Inputs and switch</h2>
        <label className="input">
          <Search size={18} className="text-ink-2" aria-hidden="true" />
          <input placeholder="Search notes and categories" />
        </label>
        <div className="field">
          <span className="field-label">Name</span>
          <div className="input err"><input aria-invalid="true" placeholder="" /></div>
          <span className="help err">Give the account a name</span>
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={switchOn} onChange={setSwitchOn} label="Example switch" />
          <span className="t-sub">{switchOn ? 'On' : 'Off'}</span>
        </div>
      </section>

      <RowGroup title="Rows · grouped" caption="Grey line under a group explains it.">
        <Row icon={<ArrowLeftRight size={18} />} title="Row that opens something" value="4" chevron onClick={() => toast.info('Opened')} />
        <Row icon="🎵" title="Music subscription" subtitle="18 Oct · Humo card" value="−85 000" />
        <Row
          icon={<Sigma size={18} />}
          title="Row with a switch"
          end={<Switch checked={rowSwitch} onChange={setRowSwitch} label="Row with a switch" />}
        />
        <Row icon={<Star size={18} />} iconTone="#3A7BD5" title="Coloured icon" subtitle="Accounts use their own colour" chevron onClick={() => setExpanded(!expanded)} />
        <Row icon={<Trash2 size={18} />} title="Destructive row" danger chevron onClick={() => setConfirmOpen(true)} />
      </RowGroup>

      <section className="flex flex-col gap-3">
        <h2 className="t-over px-1">Overlays and toasts</h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setPopOpen(true)}>Open pop-up</Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Open confirm</Button>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>Open bottom sheet</Button>
          <Button variant="secondary" onClick={() => toast.success('Saved · −45 000 so‘m · Transport')}>Toast</Button>
          <Button variant="secondary" onClick={() => toast.error('Choose a category to save')}>Error toast</Button>
        </div>
      </section>

      <div className="card">
        <div className="empty">
          <span className="empty-ico"><Lock size={24} /></span>
          <p className="t-head">Nothing here yet</p>
          <p className="t-sub">Type an amount, then tap a category.</p>
          <Button variant="tinted">Add your first entry</Button>
        </div>
      </div>

      <PopUp
        isOpen={popOpen}
        onClose={() => setPopOpen(false)}
        title="Filter & sort"
        subtitle="Narrow History down. One filter is on: October 2026."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSort('newest')}>Reset</Button>
            <Button fullWidth onClick={() => setPopOpen(false)}>Show 48 entries</Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <span className="t-strong">Sort</span>
          <div className="chips">
            {['newest', 'oldest', 'largest', 'smallest'].map((key) => (
              <button key={key} type="button" className={`chip${sort === key ? ' on' : ''}`} onClick={() => setSort(key)}>
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="plist">
          <Row icon={<ArrowLeftRight size={18} />} title="Row that opens something" chevron onClick={() => undefined} />
          <Row icon="🎵" title="Music subscription" subtitle="18 Oct · Humo card" value="−85 000" unread />
          <Row icon={<Trash2 size={18} />} title="Destructive row" danger chevron onClick={() => undefined} />
        </div>
      </PopUp>

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toast.success('Deleted')}
        title="Delete this entry?"
        description="This can't be undone."
        confirmLabel="Delete"
        danger
      />

      <BottomSheet isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title="Bottom sheet">
        <p className="t-body">The add-entry sheet stays a full-width sheet from the bottom edge.</p>
      </BottomSheet>
    </div>
  )
}

export default KitPage
