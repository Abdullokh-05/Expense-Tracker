import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useTransactionStore } from '@/store/transactionStore'
import { useCategoryStore } from '@/store/categoryStore'
import { useAppStore } from '@/store/appStore'
import { formatAmount, getDateRange } from '@/lib/utils'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts'
import { Brain, TrendingUp } from 'lucide-react'

type ReportPeriod = 'week' | 'month' | 'year'

interface CategoryData {
  name: string
  value: number
  color: string
}

interface ChartDataPoint {
  name: string
  amount: number
}

export const ReportsPage: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { settings } = useAppStore()
  const { transactions, loadTransactions } = useTransactionStore()
  const { categories, loadCategories } = useCategoryStore()

  const [period, setPeriod] = useState<ReportPeriod>('month')
  const [catData, setCatData] = useState<CategoryData[]>([])
  const [trendData, setTrendData] = useState<ChartDataPoint[]>([])

  const loadData = useCallback(async () => {
    const { from, to } = getDateRange(period)
    await loadTransactions({ from, to, status: 'confirmed' })
    await loadCategories()
  }, [period, loadTransactions, loadCategories])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    // 1. Calculate categories distribution
    const categoryTotals: Record<string, number> = {}
    transactions
      .filter((txn) => txn.type === 'expense')
      .forEach((txn) => {
        if (txn.categoryId) {
          categoryTotals[txn.categoryId] = (categoryTotals[txn.categoryId] ?? 0) + txn.amountInBaseCurrency
        }
      })

    const distribution: CategoryData[] = Object.entries(categoryTotals).map(([catId, total]) => {
      const cat = categories.find((c) => c.id === catId)
      return {
        name: cat?.name || t('categories.other'),
        value: total,
        color: cat?.color || 'var(--color-text-muted)',
      }
    })
    setCatData(distribution.sort((a, b) => b.value - a.value))

    // 2. Calculate dynamic trend values (e.g. by date)
    const dailyTotals: Record<string, number> = {}
    transactions.forEach((txn) => {
      if (txn.type === 'expense') {
        const shortDate = txn.date.substring(5) // MM-DD format for label
        dailyTotals[shortDate] = (dailyTotals[shortDate] ?? 0) + txn.amountInBaseCurrency
      }
    })

    const trend: ChartDataPoint[] = Object.entries(dailyTotals)
      .map(([date, total]) => ({
        name: date,
        amount: total,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(-7) // Limit to last 7 points to avoid cramming
    setTrendData(trend)
  }, [transactions, categories, period, t])

  const totalSpent = transactions
    .filter((txn) => txn.type === 'expense')
    .reduce((sum, txn) => sum + txn.amountInBaseCurrency, 0)

  return (
    <div className="space-y-6">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold serif-heading" style={{ color: 'var(--color-text-primary)' }}>
            {t('reports.title')}
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Аналитика и инсайты ваших расходов
          </p>
        </div>

        {/* Period Selection */}
        <div className="flex p-0.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-2)] shrink-0 sm:w-auto">
          {(['week', 'month', 'year'] as ReportPeriod[]).map((p) => (
            <button
              key={p}
              id={`report-period-${p}`}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                period === p ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {t(`reports.${p}`)}
            </button>
          ))}
        </div>
      </div>

      {/* ── GRID LAYOUT: CHARTS & AI INSIGHTS SIDE BY SIDE ON DESKTOP ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Columns (Charts) */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Total stats card */}
          <div className="card p-5 flex items-center justify-between" style={{ background: 'var(--color-surface)' }}>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-secondary)' }}>
                {t('dashboard.totalExpenses')}
              </span>
              <span className="text-3xl font-bold mt-1 block amount-display" style={{ color: 'var(--color-expense)' }}>
                {formatAmount(totalSpent, settings.baseCurrency)}
              </span>
            </div>
            <button
              id="go-to-budgets-btn"
              onClick={() => navigate('/budgets')}
              className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all"
              style={{ background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border)', color: 'var(--color-text-primary)' }}
            >
              <TrendingUp size={14} className="text-[var(--color-income)]" />
              {t('budgets.title')}
            </button>
          </div>

          {/* Categories Pie Chart Card */}
          {catData.length > 0 ? (
            <div className="card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.byCategory')}
              </h3>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {catData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: unknown) => [
                        formatAmount(typeof value === 'number' ? value : 0, settings.baseCurrency),
                        '',
                      ]}
                      contentStyle={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : (
            <div className="card p-10 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.noData')}
              </p>
            </div>
          )}

          {/* Dynamic spend trend bar chart */}
          {trendData.length > 0 && (
            <div className="card p-5 space-y-4" style={{ background: 'var(--color-surface)' }}>
              <h3 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>
                {t('reports.byTime')}
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <XAxis dataKey="name" stroke="var(--color-text-muted)" fontSize={10} tickLine={false} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={10} tickLine={false} width={40} />
                    <Tooltip
                      formatter={(value: unknown) => [
                        formatAmount(typeof value === 'number' ? value : 0, settings.baseCurrency),
                        '',
                      ]}
                      contentStyle={{ background: 'var(--color-surface)', border: '1.5px solid var(--color-border)', borderRadius: '12px' }}
                    />
                    <Bar dataKey="amount" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

        </div>

        {/* Right Column (AI Insight & Legends List) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* AI Insight Card */}
          {settings.aiEnabled && (
            <div className="card p-5 space-y-3 relative overflow-hidden"
                 style={{ 
                   background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)', 
                   borderColor: 'rgba(255,255,255,0.1)', 
                   boxShadow: 'var(--shadow-md)' 
                 }}>
              <div className="flex items-center gap-2">
                <Brain size={16} className="text-indigo-200" />
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">
                  {t('reports.aiInsight')}
                </span>
              </div>
              <p className="text-xs text-white/90 leading-relaxed font-medium">
                «В этом периоде ваши расходы стабильны. Основная доля трат приходится на категорию «Еда». Рекомендую установить лимиты бюджетов в меню настроек для лучшего контроля.»
              </p>
            </div>
          )}

          {/* Legends list */}
          {catData.length > 0 && (
            <div className="card p-5 space-y-3" style={{ background: 'var(--color-surface)' }}>
              <h4 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Распределение трат
              </h4>
              <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                {catData.map((item, idx) => {
                  const percentage = totalSpent > 0 ? Math.round((item.value / totalSpent) * 100) : 0
                  return (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-[var(--color-border)]/50 last:border-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span style={{ color: 'var(--color-text-muted)' }}>{percentage}%</span>
                        <span className="font-bold amount-display" style={{ color: 'var(--color-text-primary)' }}>
                          {formatAmount(item.value, settings.baseCurrency)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>

      </div>

    </div>
  )
}
