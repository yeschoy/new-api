import { useQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useDebounce } from '@/hooks/use-debounce'
import { toIntlLocale } from '@/i18n/languages'
import { formatQuotaWithCurrency, getCurrencyDisplay } from '@/lib/currency'
import { formatNumber } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

import { getPayerCashbackPreview } from '../api'

type Props = {
  amount?: number
  productId?: string
}

export function PayerCashbackPreview(props: Props) {
  const { t, i18n } = useTranslation()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const { config } = getCurrencyDisplay()
  const debouncedAmount = useDebounce(props.amount, 300)
  const selectionReady = !!props.productId || props.amount === debouncedAmount
  // Checkout methods have different minimums. Let the server validate the
  // selected amount against currently enabled providers instead of assuming
  // the form's default minimum applies to every method.
  const valid = props.productId
    ? true
    : Number.isSafeInteger(props.amount) && (props.amount ?? -1) >= 0
  const query = useQuery({
    queryKey: [
      'payer-cashback-preview',
      userId,
      props.productId ?? null,
      props.amount ?? null,
    ],
    queryFn: async () => {
      if (props.productId) {
        return getPayerCashbackPreview({ productId: props.productId })
      }
      if (props.amount === undefined) {
        throw new Error('Preview selection missing')
      }
      return getPayerCashbackPreview({ amount: props.amount })
    },
    enabled:
      !!userId &&
      valid &&
      selectionReady &&
      !!(props.productId || props.amount),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { errorToast: false },
  })

  let message: string
  if (!valid || !userId) {
    message = t('Select a valid amount to preview cashback.')
  } else if (!props.productId && props.amount === 0) {
    message = t('Select an amount to preview cashback.')
  } else if (!selectionReady || query.isFetching) {
    message = t('Checking your cashback estimate…')
  } else if (
    !props.productId &&
    query.isError &&
    isAxiosError(query.error) &&
    query.error.response?.status === 400
  ) {
    message = t('Select a valid amount to preview cashback.')
  } else if (query.isError || !query.data) {
    message = t('Cashback estimate is temporarily unavailable.')
  } else {
    switch (query.data.status) {
      case 'estimated':
        message = t('Estimated cashback: {{amount}}', {
          amount: formatQuotaWithCurrency(query.data.reward_quota, {
            locale,
            minimumFractionDigits: 2,
            // A raw quota unit can be much smaller than a cent (notably for
            // Creem products); never round a positive estimate up to a fake
            // minimum currency amount.
            digitsSmall: Math.min(
              20,
              Math.max(4, Math.ceil(Math.log10(config.quotaPerUnit)) + 2)
            ),
            abbreviate: false,
          }),
        })
        break
      case 'no_campaign':
        message = t('No active cashback campaign for this top-up.')
        break
      case 'limit_reached':
        message = t('Your cashback campaign limit has been reached.')
        break
      case 'cap_exhausted':
        message = t(
          'Your cashback allowance for the past 24 hours is exhausted.'
        )
        break
      case 'below_minimum':
        message = t('This amount is below the cashback threshold.')
        break
      case 'ineligible':
        message = t('Cashback is not available for this account right now.')
        break
      case 'select_amount':
        message = t('Select an amount to preview cashback.')
        break
      default:
        message = t('Cashback is not active right now.')
    }
  }

  const preview =
    selectionReady && !query.isFetching && !query.isError && valid
      ? query.data
      : undefined
  return (
    <Alert className='min-w-0' aria-live='polite'>
      <AlertTitle>{t('Top-up cashback preview')}</AlertTitle>
      <AlertDescription className='space-y-1 break-words'>
        {preview?.strategy === 'rate' && preview.status !== 'no_campaign' && (
          <p>
            {t('Campaign rule: {{rate}}% of the selected face amount', {
              rate: formatNumber((preview.rate_bps ?? 0) / 100, locale),
            })}
          </p>
        )}
        {preview?.strategy === 'per_hundred' &&
          preview.status !== 'no_campaign' && (
            <p>
              {t('Campaign rule: {{reward}} for every 100 face units', {
                reward: formatNumber(preview.fixed_per_hundred, locale),
              })}
            </p>
          )}
        <p>{message}</p>
        <p>
          {t(
            'Estimate only. Eligibility and final cashback are determined when payment succeeds.'
          )}
        </p>
      </AlertDescription>
    </Alert>
  )
}
