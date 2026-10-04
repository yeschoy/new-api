/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getCurrencyDisplay, getCurrencyLabel } from '@/lib/currency'
import { formatQuota, parseQuotaFromDollars } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { adjustUserQuota } from '../api'
import type { QuotaAdjustMode } from '../types'

interface UserQuotaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  currentQuota: number
  onSuccess: () => void
}

// An amount is evidence only when its decimal value is exactly representable in cents.
function parseExactCnyCents(amount: string): number | undefined {
  const match = /^(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(
    amount
  )
  if (!match) return undefined

  const fraction = match[2] ?? match[3] ?? ''
  const digits = ((match[1] ?? '') + fraction).replace(/^0+/, '')
  if (!digits) return undefined

  const exponent = Number(match[4] ?? 0)
  if (!Number.isSafeInteger(exponent)) return undefined
  const scale = exponent + 2 - fraction.length
  if (!Number.isSafeInteger(scale)) return undefined

  let centsDigits: string
  if (scale < 0) {
    if (-scale >= digits.length || !/^0+$/.test(digits.slice(scale))) {
      return undefined
    }
    centsDigits = digits.slice(0, scale)
  } else {
    if (digits.length + scale > 16) return undefined
    centsDigits = digits + '0'.repeat(scale)
  }

  if (centsDigits.length > 16) return undefined
  const cents = BigInt(centsDigits)
  return cents <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(cents) : undefined
}

export function UserQuotaDialog(props: UserQuotaDialogProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<QuotaAdjustMode>('add')
  const [loading, setLoading] = useState(false)
  // Keep the displayed unit and conversion current while the dialog is open.
  useSystemConfigStore((state) => state.config?.currency)

  const { config, meta: currencyMeta } = getCurrencyDisplay()
  const [amountInput, setAmountInput] = useState(() => ({
    value: '',
    currency: config.quotaDisplayType,
  }))
  // Never render or submit an amount entered under a different display unit.
  const amount =
    amountInput.currency === config.quotaDisplayType ? amountInput.value : ''
  useEffect(() => {
    setAmountInput((previous) =>
      previous.currency === config.quotaDisplayType
        ? previous
        : { value: '', currency: config.quotaDisplayType }
    )
  }, [config.quotaDisplayType])

  const currencyLabel = getCurrencyLabel()
  const tokensOnly = currencyMeta.kind === 'tokens'

  const amountValue = Number.parseFloat(amount) || 0
  const quotaValue = parseQuotaFromDollars(Math.abs(amountValue))
  const cnyAdd = mode === 'add' && config.quotaDisplayType === 'CNY'
  const cnyCents = cnyAdd ? parseExactCnyCents(amount) : undefined

  const getPreviewText = () => {
    const current = props.currentQuota
    const val = quotaValue
    switch (mode) {
      case 'add':
        return `${t('Current quota')}: ${formatQuota(current)}  +${formatQuota(val)} = ${formatQuota(current + val)}`
      case 'subtract':
        return `${t('Current quota')}: ${formatQuota(current)}  -${formatQuota(val)} = ${formatQuota(current - val)}`
      case 'override': {
        const overrideQuota = parseQuotaFromDollars(amountValue)
        return `${t('Current quota')}: ${formatQuota(current)} → ${formatQuota(overrideQuota)}`
      }
      default:
        return ''
    }
  }

  const handleConfirm = async () => {
    if (!amount && mode !== 'override') return
    if (quotaValue <= 0 && mode !== 'override') return

    setLoading(true)
    try {
      const value =
        mode === 'override' ? parseQuotaFromDollars(amountValue) : quotaValue
      const result = await adjustUserQuota({
        id: props.userId,
        action: 'add_quota',
        mode,
        value: mode === 'override' ? value : Math.abs(value),
        ...(cnyAdd && cnyCents !== undefined ? { cny_cents: cnyCents } : {}),
      })
      if (result.success) {
        toast.success(t('Quota adjusted successfully'))
        setAmountInput({ value: '', currency: config.quotaDisplayType })
        setMode('add')
        props.onOpenChange(false)
        props.onSuccess()
      } else {
        handleServerError(result, t('Failed to adjust quota'))
      }
    } catch (e: unknown) {
      handleServerError(e, t('Failed to adjust quota'))
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    setAmountInput({ value: '', currency: config.quotaDisplayType })
    setMode('add')
    props.onOpenChange(false)
  }

  const placeholder = tokensOnly
    ? t('Enter amount in tokens')
    : t('Enter amount in {{currency}}', { currency: currencyLabel })

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('Adjust Quota')}
      description={t('Select an operation mode and enter the amount')}
      contentHeight='auto'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={loading}>
            {loading ? t('Processing...') : t('Confirm')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        <div className='text-muted-foreground text-sm'>{getPreviewText()}</div>

        <div className='space-y-2'>
          <Label>{t('Mode')}</Label>
          <div className='flex gap-1'>
            {(['add', 'subtract', 'override'] as const).map((m) => (
              <Button
                key={m}
                type='button'
                variant='outline'
                size='sm'
                className={cn(
                  mode === m &&
                    'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                )}
                onClick={() => {
                  setMode(m)
                  setAmountInput({
                    value: '',
                    currency: config.quotaDisplayType,
                  })
                }}
              >
                {m === 'add' && t('Add')}
                {!(m === 'add') && m === 'subtract' && t('Subtract')}
                {!(m === 'add') && !(m === 'subtract') && t('Override')}
              </Button>
            ))}
          </div>
        </div>

        <div className='space-y-2'>
          <Label htmlFor='user-quota-amount'>
            {t('Amount')} ({currencyLabel})
          </Label>
          <Input
            id='user-quota-amount'
            type='number'
            step={tokensOnly ? 1 : 0.000001}
            min={mode === 'override' ? undefined : 0}
            placeholder={placeholder}
            value={amount}
            onChange={(e) =>
              setAmountInput({
                value: e.target.value,
                currency: config.quotaDisplayType,
              })
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleConfirm()
            }}
          />
        </div>
      </div>
    </Dialog>
  )
}
