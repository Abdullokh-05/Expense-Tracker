import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/store/appStore'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { formatAmount } from '@/lib/utils'
import { Send, Bot, User, BrainCircuit, WifiOff } from 'lucide-react'
import { Input } from '@/components/ui/Input'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export const AIChatPage: React.FC = () => {
  const { t } = useTranslation()
  const { settings, isOnline } = useAppStore()
  const { transactions } = useTransactionStore()
  const { categories } = useCategoryStore()

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

    // Simulate AI response after 1.5s
    setTimeout(() => {
      let responseText = ''
      const lower = userText.toLowerCase()

      // Local mock analyzer to feel premium and interactive offline
      if (lower.includes('расход') || lower.includes('трат') || lower.includes('spend') || lower.includes('xarajat')) {
        const total = transactions
          .filter((t) => t.type === 'expense')
          .reduce((sum, t) => sum + t.amountInBaseCurrency, 0)
        
        responseText = `Ваши общие подтвержденные расходы составляют ${formatAmount(
          total,
          settings.baseCurrency
        )}. Вы можете посмотреть детальную аналитику во вкладке "Отчеты".`
      } else if (lower.includes('категори') || lower.includes('category') || lower.includes('turlar')) {
        const activeCats = categories.filter((c) => !c.isArchived)
        responseText = `У вас настроено ${activeCats.length} активных категорий. Самые частые: ${activeCats
          .slice(0, 3)
          .map((c) => `${c.icon} ${c.name}`)
          .join(', ')}.`
      } else if (lower.includes('привет') || lower.includes('hello') || lower.includes('salom')) {
        responseText = `Привет! Я готов проанализировать ваши финансы. Например, спросите меня: "Какие у меня расходы?"`
      } else {
        responseText = `Интересный вопрос! Сейчас я работаю в гостевом демонстрационном режиме. В финальной версии (Этап 5) здесь будет полноценный ИИ-анализ на базе Anthropic Claude Haiku.`
      }

      const botMsg: Message = {
        id: Math.random().toString(36).substring(7),
        role: 'assistant',
        content: responseText,
      }
      
      setMessages((prev) => [...prev, botMsg])
      setIsThinking(false)
    }, 1500)
  }

  const isAIDisabled = !settings.aiEnabled

  return (
    <div className="flex flex-col h-[calc(100dvh-56px)] bg-gray-50">
      {/* Header */}
      <div
        className="bg-white px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <BrainCircuit className="text-gray-900" size={20} />
          <h1 className="text-base font-bold text-gray-900">{t('aiChat.title')}</h1>
        </div>
        <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-1 rounded-full font-semibold">
          Haiku 4.5
        </span>
      </div>

      {/* Disclaimers & Offline Indicators */}
      {isAIDisabled ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <BrainCircuit size={48} className="text-gray-300 mb-4" />
          <p className="text-sm font-semibold text-gray-600">{t('aiChat.disabled')}</p>
        </div>
      ) : (
        <>
          {!isOnline && (
            <div className="flex items-center gap-2 bg-amber-50 border-b border-amber-100 text-amber-800 text-xs px-5 py-2">
              <WifiOff size={14} />
              <span>{t('aiChat.offline')}</span>
            </div>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 hide-scrollbar">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    msg.role === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-gray-900 text-white'
                  }`}
                >
                  {msg.role === 'user' ? <User size={14} /> : <Bot size={14} />}
                </div>

                {/* Message Balloon */}
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-gray-900 text-white rounded-tr-none'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0">
                  <Bot size={14} />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Disclaimer text */}
          <div className="px-5 text-center py-1.5 text-[9px] text-gray-400 bg-gray-50 border-t border-gray-100 select-none">
            {t('aiChat.disclaimer')}
          </div>

          {/* Form input */}
          <form
            onSubmit={handleSend}
            className="p-3 bg-white border-t border-gray-100 flex gap-2 items-center"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
          >
            <div className="flex-1">
              <Input
                id="ai-message-input"
                placeholder={t('aiChat.placeholder')}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!isOnline}
                className="bg-gray-50"
              />
            </div>
            <button
              id="send-ai-message-btn"
              type="submit"
              disabled={!input.trim() || !isOnline || isThinking}
              className="w-11 h-11 rounded-xl bg-gray-900 text-white flex items-center justify-center disabled:bg-gray-100 disabled:text-gray-400 transition-colors"
            >
              <Send size={16} />
            </button>
          </form>
        </>
      )}
    </div>
  )
}
