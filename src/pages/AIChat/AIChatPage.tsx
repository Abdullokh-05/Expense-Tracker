import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { formatAmount, formatPeriodLabel, getDateRange } from '@/lib/utils'
import { confirmedInRange, getCategorySpending, sumByType } from '@/lib/analytics'
import { Send, Bot, User, BrainCircuit } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const AIChatPage: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { settings } = useAppStore()
  const transactions = useTransactionStore((s) => s.transactions)
  const categories = useCategoryStore((s) => s.categories)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isThinking, setIsThinking] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Initial helper message
    setMessages([
      {
        id: 'welcome-msg',
        role: 'assistant',
        content: t('aiChat.welcome'),
      },
    ])
  }, [t])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isThinking])

  // No AI model is connected yet. Until one is, answers are worked out locally from this
  // month's transactions, and the reply says so when a question is outside what it knows.
  const buildAnswer = (question: string): string => {
    const lower = question.toLowerCase()
    const range = getDateRange('month')
    const monthTransactions = confirmedInRange(transactions, range)
    const breakdown = getCategorySpending(monthTransactions, categories, t)
    const period = formatPeriodLabel('month', range, i18n.language)

    if (/расход|трат|потрат|spend|spent|expense|xarajat|sarf/.test(lower)) {
      if (breakdown.length === 0) return t('aiChat.answerNoData', { period })
      return t('aiChat.answerSpending', {
        period,
        total: formatAmount(sumByType(monthTransactions, 'expense'), settings.baseCurrency),
        top: breakdown
          .slice(0, 3)
          .map((item) => `${item.categoryIcon} ${item.categoryName} — ${item.percentage}%`)
          .join(', '),
      })
    }
    if (/категори|categor|kategoriya|turlar/.test(lower)) {
      if (breakdown.length === 0) return t('aiChat.answerNoData', { period })
      return t('aiChat.answerCategories', {
        period,
        list: breakdown
          .map((item) => `${item.categoryIcon} ${item.categoryName}: ${formatAmount(item.amount, settings.baseCurrency)}`)
          .join('; '),
      })
    }
    if (/привет|здравств|hello|hi\b|salom/.test(lower)) return t('aiChat.answerHello')
    return t('aiChat.answerFallback')
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isThinking) return

    const userText = input.trim()
    setInput('')

    // Append user message
    const userMsg: Message = {
      id: Math.random().toString(36).substring(7),
      role: 'user',
      content: userText,
    }
    setMessages((prev) => [...prev, userMsg])
    setIsThinking(true)

    setTimeout(() => {
      const botMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: buildAnswer(userText),
      }

      setMessages((prev) => [...prev, botMsg])
      setIsThinking(false)
    }, 500)
  }

  const isAIDisabled = !settings.aiEnabled

  return (
    <div
      className="card flex flex-col h-[calc(100dvh-13rem)] lg:h-[calc(100dvh-5rem)]"
      style={{ background: 'var(--color-surface)' }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <BrainCircuit style={{ color: 'var(--color-text-primary)' }} size={20} />
          <h1 className="text-base font-bold" style={{ color: 'var(--color-text-primary)' }}>{t('aiChat.title')}</h1>
        </div>
        <span className="text-[10px] px-2 py-1 rounded-full font-semibold bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
          {t('aiChat.demoBadge')}
        </span>
      </div>

      {isAIDisabled ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BrainCircuit size={48} className="mb-4" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--color-text-secondary)' }}>{t('aiChat.disabled')}</p>
        </div>
      ) : (
        <>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 hide-scrollbar" style={{ background: 'var(--color-bg)' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                {/* Icon */}
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={
                    msg.role === 'user'
                      ? { background: 'var(--color-surface-2)', color: 'var(--color-text-secondary)' }
                      : { background: 'var(--color-accent)', color: 'var(--color-bg)' }
                  }
                >
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Message Balloon */}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user' ? 'rounded-tr-none' : 'rounded-tl-none'
                  }`}
                  style={
                    msg.role === 'user'
                      ? { background: 'var(--color-accent)', color: 'var(--color-bg)' }
                      : {
                          background: 'var(--color-surface)',
                          color: 'var(--color-text-primary)',
                          border: '1px solid var(--color-border)',
                        }
                  }
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 max-w-[85%]">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
                >
                  <Bot size={14} />
                </div>
                <div
                  className="rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1"
                  style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: 'var(--color-text-muted)' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.2s]" style={{ background: 'var(--color-text-muted)' }} />
                  <span className="w-1.5 h-1.5 rounded-full animate-bounce [animation-delay:0.4s]" style={{ background: 'var(--color-text-muted)' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer text */}
          <div className="px-5 text-center py-1.5 text-[10px] border-t border-[var(--color-border)] select-none" style={{ color: 'var(--color-text-muted)' }}>
            {t('aiChat.demoNote')}
          </div>

          {/* Form input */}
          <form
            onSubmit={handleSend}
            className="p-3 border-t border-[var(--color-border)] flex gap-2 items-center shrink-0"
          >
            <div className="flex-1">
              <Input
                id="ai-message-input"
                placeholder={t('aiChat.placeholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
            </div>
            <button
              id="send-ai-message-btn"
              type="submit"
              disabled={!input.trim() || isThinking}
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-opacity bg-[var(--color-accent)] text-[var(--color-bg)] disabled:opacity-30"
              aria-label={t('aiChat.send')}
            >
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
