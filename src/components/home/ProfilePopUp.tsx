import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { PopUp } from '@/components/ui/PopUp'
import { Button } from '@/components/ui/Button'

interface ProfilePopUpProps {
  isOpen: boolean
  onClose: () => void
}

// The avatar on Home: the name the app greets you by. Signing in comes with sync, later.
export const ProfilePopUp: React.FC<ProfilePopUpProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation()
  const displayName = useAppStore((s) => s.settings.displayName ?? '')
  const setSettings = useAppStore((s) => s.setSettings)
  const [name, setName] = useState(displayName)

  useEffect(() => {
    if (isOpen) setName(displayName)
  }, [isOpen, displayName])

  const save = () => {
    setSettings({ displayName: name.trim() })
    onClose()
  }

  return (
    <PopUp
      isOpen={isOpen}
      onClose={onClose}
      title={t('profile.title')}
      subtitle={t('profile.guestHint')}
      footer={
        <Button size="lg" fullWidth onClick={save}>
          {t('common.save')}
        </Button>
      }
    >
      <form
        className="field"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <label className="field-label" htmlFor="profile-name">
          {t('profile.name')}
        </label>
        <span className="input">
          <input
            id="profile-name"
            value={name}
            maxLength={40}
            autoComplete="given-name"
            enterKeyHint="done"
            placeholder={t('profile.namePlaceholder')}
            onChange={(e) => setName(e.target.value)}
          />
        </span>
      </form>
    </PopUp>
  )
}
