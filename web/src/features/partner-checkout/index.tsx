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
import { QRCodeSVG } from 'qrcode.react'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import { safePaymentUrl, type CashierOrder } from './api'
import { useCashier } from './hooks/use-cashier'

function OrderSummary(props: { order: CashierOrder }) {
  const { t, i18n } = useTranslation()
  const order = props.order
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  return (
    <div className='space-y-5'>
      <h2 className='text-xl font-semibold break-words'>{order.plan_title}</h2>
      {/* Display the authoritative decimal unchanged; never apply wallet exchange rates. */}
      <p className='text-3xl font-semibold tabular-nums'>
        {order.amount} <span className='text-base'>CNY</span>
      </p>
      <dl className='grid gap-3 text-sm sm:grid-cols-[auto_1fr]'>
        <dt className='text-muted-foreground'>{t('Order number')}</dt>
        <dd className='min-w-0 font-mono break-all sm:text-right'>
          {order.order_no}
        </dd>
        <dt className='text-muted-foreground'>{t('Payment Method')}</dt>
        <dd className='break-all sm:text-right'>{order.payment_method}</dd>
        <dt className='text-muted-foreground'>
          {t('Checkout access expires')}
        </dt>
        <dd className='sm:text-right'>
          {new Date(order.expires_at * 1000).toLocaleString(locale)}
        </dd>
      </dl>
    </div>
  )
}

function OrderProgress(props: { order: CashierOrder; canPay: boolean }) {
  const { t } = useTranslation()
  const order = props.order
  if (order.payment_status === 'paid') {
    return (
      <div role='status' className='space-y-2 rounded-lg border p-4'>
        <p className='font-semibold'>{t('Payment received')}</p>
        {order.fulfillment_status === 'fulfilled' ? (
          <p>{t('Subscription delivered. You can return to the merchant.')}</p>
        ) : (
          <p>
            {t(
              'Delivery is pending. Do not pay again; delivery continues even if you close this page.'
            )}
          </p>
        )}
      </div>
    )
  }
  if (order.payment_status === 'failed' || order.payment_status === 'expired') {
    return (
      <p role='status'>
        {t(
          'This payment is no longer available. Return to the merchant to check your order.'
        )}
      </p>
    )
  }
  const payUrl = safePaymentUrl(order.pay_url)
  // SVG QR encoders have a finite byte capacity; never crash on an oversized
  // gateway payload. The payload is encoded as data, not HTML or an image URL.
  const qr =
    order.qr_code && new TextEncoder().encode(order.qr_code).length <= 2000
      ? order.qr_code
      : undefined
  return (
    <div className='space-y-4'>
      <p role='status'>{t('Awaiting payment confirmation')}</p>
      {props.canPay && (
        <>
          {qr && (
            <div
              className='mx-auto w-fit max-w-full rounded-xl bg-white p-4'
              role='img'
              aria-label={t('Payment QR code')}
            >
              <QRCodeSVG
                value={qr}
                size={208}
                level='L'
                marginSize={2}
                className='h-auto max-w-full'
                aria-hidden='true'
              />
            </div>
          )}
          {payUrl && (
            <Button
              role='link'
              className='h-auto min-h-10 w-full py-2 whitespace-normal'
              render={
                <a
                  href={payUrl}
                  target='_blank'
                  rel='noopener noreferrer'
                  referrerPolicy='no-referrer'
                />
              }
            >
              {t('Open secure payment page')}
            </Button>
          )}
          {!qr && !payUrl && (
            <p>
              {t(
                'Payment details are not ready. Return to the merchant if this persists.'
              )}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function PartnerCheckoutPage(props: { orderNo: string }) {
  const { t } = useTranslation()
  const cashier = useCashier(props.orderNo)
  return (
    <main className='bg-background text-foreground flex min-h-svh items-center justify-center px-4 py-8'>
      <meta name='referrer' content='no-referrer' />
      <meta name='robots' content='noindex, nofollow' />
      <Card className='w-full max-w-lg min-w-0'>
        <CardHeader>
          <CardTitle>
            <h1 className='text-2xl'>{t('Subscription checkout')}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-6'>
          {cashier.loading && <LoadingState />}
          {cashier.order && (
            <>
              <OrderSummary order={cashier.order} />
              <OrderProgress
                order={cashier.order}
                canPay={!cashier.error && !cashier.loading}
              />
            </>
          )}
          {cashier.error === 'retry' && (
            <div role='alert' className='space-y-3'>
              <p>
                {t(
                  'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.'
                )}
              </p>
              <Button variant='outline' onClick={cashier.retry}>
                {t('Retry')}
              </Button>
            </div>
          )}
          {(cashier.error === 'invalid' || cashier.error === 'expired') && (
            <ErrorState
              title={
                cashier.error === 'expired'
                  ? t('Checkout access has expired')
                  : t('Checkout access is missing, invalid or expired')
              }
              description={t(
                'Return to the merchant to check this order. Do not pay again if you have already paid.'
              )}
            />
          )}
          <p className='text-muted-foreground text-sm'>
            {t(
              'Only verified payment activates your subscription. This page cannot confirm payment.'
            )}
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
