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
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

import {
  createPurchaseOrder,
  exchangePurchase,
  getPurchaseCatalog,
  PurchaseError,
  type PurchaseCatalog,
  type PurchaseErrorKind,
} from './api'
import {
  forgetPurchaseEntry,
  freezePurchaseDraft,
  purchaseStorageUnavailable,
  purchaseEntryExpired,
  readPurchaseDraft,
  readPurchaseEntry,
  savePurchaseAccess,
  type PurchaseAccess,
  type PurchaseDraft,
} from './lib/access'

function navigateToCheckout(href: string): void {
  window.location.assign(href)
}
function errorKind(error: unknown): PurchaseErrorKind {
  return error instanceof PurchaseError ? error.kind : 'retry'
}

function PurchaseNotice({ kind }: { kind: PurchaseErrorKind }) {
  const { t } = useTranslation()
  let message: string
  switch (kind) {
    case 'invalid':
      message = t(
        'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.'
      )
      break
    case 'expired':
      message = t(
        'Purchase access has expired. Return to the merchant to check your order before starting again.'
      )
      break
    case 'conflict':
      message = t(
        'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.'
      )
      break
    case 'unavailable':
      message = t(
        'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.'
      )
      break
    case 'retry':
      message = t(
        'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.'
      )
      break
  }
  return (
    <Alert variant='destructive'>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}

export function PartnerPurchasePage({
  sessionId,
  navigate = navigateToCheckout,
}: {
  sessionId: string
  navigate?: (href: string) => void
}) {
  const { t } = useTranslation()
  const [catalog, setCatalog] = useState<PurchaseCatalog | null>(null)
  const [error, setError] = useState<PurchaseErrorKind | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [revision, setRevision] = useState(0)
  const [planId, setPlanId] = useState<number | null>(null)
  const [method, setMethod] = useState('')
  const [draft, setDraft] = useState(() => readPurchaseDraft(sessionId))
  const accessRef = useRef<PurchaseAccess | null>(null)
  const inFlight = useRef(false)
  const submitController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    let live = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const expired = purchaseEntryExpired(sessionId)
        const entry = readPurchaseEntry(sessionId)
        if (!entry) throw new PurchaseError(expired ? 'expired' : 'invalid')
        const access =
          entry.kind === 'access'
            ? entry
            : await exchangePurchase(entry, controller.signal)
        if (!live) return
        savePurchaseAccess(access)
        accessRef.current = access
        const data = await getPurchaseCatalog(access, controller.signal)
        if (live) setCatalog(data)
      } catch (cause) {
        if (!live) return
        const kind = errorKind(cause)
        if (kind === 'invalid' || kind === 'expired') {
          forgetPurchaseEntry(sessionId)
        }
        setError(kind)
      } finally {
        clearTimeout(timeout)
        if (live) setLoading(false)
      }
    }
    void load()
    return () => {
      live = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [sessionId, revision])

  useEffect(
    () => () => {
      submitController.current?.abort()
    },
    []
  )
  useEffect(() => {
    if (!catalog) return
    const timeout = setTimeout(
      () => {
        forgetPurchaseEntry(sessionId)
        submitController.current?.abort()
        setError('expired')
      },
      Math.max(0, catalog.expires_at * 1000 - Date.now())
    )
    return () => clearTimeout(timeout)
  }, [catalog, sessionId])

  const terminal = error === 'invalid' || error === 'expired'
  const selectedPlan = draft?.plan_id ?? planId
  const selectedMethod = draft?.payment_method ?? method
  const resumableOrder =
    catalog?.order?.payment_status === 'pending' &&
    catalog.order.expires_at * 1000 > Date.now()
  const orderCheckoutURL =
    catalog?.order && catalog.order.expires_at * 1000 > Date.now()
      ? catalog.order.checkout_url
      : undefined
  const locked = submitting || loading || !!draft
  const empty =
    !draft && (!catalog?.plans.length || !catalog.payment_methods.length)
  let submitLabel = t('Continue to checkout')
  if (draft) submitLabel = t('Retry original purchase')
  if (submitting) submitLabel = t('Opening checkout…')
  async function submit() {
    const order = catalog?.order
    if (
      inFlight.current ||
      loading ||
      (!order && (error === 'conflict' || error === 'unavailable')) ||
      terminal ||
      !accessRef.current ||
      (order
        ? order.payment_status !== 'pending' ||
          order.expires_at * 1000 <= Date.now()
        : !selectedPlan || !selectedMethod)
    ) {
      return
    }
    // A persisted order is authoritative, even if a stale local draft conflicts.
    // Explicitly replay pending orders to finish failed payment preparation;
    // the cashier is read-only. Mounts and status GETs never create/prepare.
    let original: PurchaseDraft
    if (order) {
      original = {
        plan_id: order.plan_id,
        payment_method: order.payment_method,
      }
    } else {
      if (!selectedPlan || !selectedMethod) return
      original = freezePurchaseDraft(sessionId, {
        plan_id: selectedPlan,
        payment_method: selectedMethod,
      })
      setDraft(original)
    }
    inFlight.current = true
    setSubmitting(true)
    setError(null)
    const controller = new AbortController()
    submitController.current = controller
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const href = await createPurchaseOrder(
        accessRef.current,
        original,
        controller.signal
      )
      if (!controller.signal.aborted) navigate(href)
    } catch (cause) {
      const kind =
        accessRef.current.expiresAt <= Date.now() ? 'expired' : errorKind(cause)
      if (kind === 'invalid' || kind === 'expired') {
        forgetPurchaseEntry(sessionId)
      }
      setError(kind)
    } finally {
      clearTimeout(timeout)
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className='bg-background text-foreground min-h-svh px-4 py-8 [overflow-wrap:anywhere]'>
      <div className='mx-auto flex w-full max-w-xl min-w-0 flex-col gap-5'>
        <header className='flex min-w-0 flex-col gap-2'>
          <p className='text-muted-foreground text-sm'>
            {catalog?.merchant_name}
          </p>
          <h1 className='text-2xl font-semibold'>
            {t('Choose your subscription')}
          </h1>
          <p className='text-muted-foreground text-sm'>
            {t(
              'One purchase per link. Final payment and delivery status are shown in the checkout.'
            )}
          </p>
        </header>
        {loading && <p role='status'>{t('Loading purchase options…')}</p>}
        {error && <PurchaseNotice kind={error} />}
        {purchaseStorageUnavailable() && (
          <Alert>
            <AlertDescription>
              {t(
                'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.'
              )}
            </AlertDescription>
          </Alert>
        )}
        {!terminal && catalog && (
          <>
            <p className='text-muted-foreground text-sm'>
              {t('Purchase access expires')}:{' '}
              <time
                dateTime={new Date(catalog.expires_at * 1000).toISOString()}
              >
                {new Date(catalog.expires_at * 1000).toLocaleString()}
              </time>
            </p>
            {catalog.order && (
              <Card>
                <CardHeader>
                  <h2 className='text-lg font-medium'>
                    {t('An order already exists for this purchase')}
                  </h2>
                  <CardDescription>{catalog.order.order_no}</CardDescription>
                </CardHeader>
                <CardContent className='flex flex-col gap-4'>
                  {catalog.order.payment_status === 'paid' ? (
                    <p role='status'>
                      {catalog.order.fulfillment_status === 'fulfilled'
                        ? t(
                            'Subscription delivered. You can return to the merchant.'
                          )
                        : t(
                            'Delivery is pending. Do not pay again; delivery continues even if you close this page.'
                          )}
                    </p>
                  ) : (
                    <p>
                      {t(
                        'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.'
                      )}
                    </p>
                  )}
                  {resumableOrder && (
                    <Button
                      type='button'
                      className='h-auto min-h-11 w-full whitespace-normal'
                      disabled={loading || submitting}
                      onClick={() => void submit()}
                    >
                      {submitting
                        ? t('Opening checkout…')
                        : t('Resume checkout / view order')}
                    </Button>
                  )}
                  {!resumableOrder &&
                    (orderCheckoutURL ? (
                      <Button
                        role='link'
                        className='h-auto min-h-11 w-full whitespace-normal'
                        nativeButton={false}
                        render={
                          <a
                            href={orderCheckoutURL}
                            referrerPolicy='no-referrer'
                            rel='noreferrer'
                          />
                        }
                      >
                        {t('Resume checkout / view order')}
                      </Button>
                    ) : (
                      <p>
                        {t('Checkout access is missing, invalid or expired')}
                      </p>
                    ))}
                  <p className='text-muted-foreground text-sm'>
                    {t(
                      'Return to the merchant to check this order. Do not pay again if you have already paid.'
                    )}
                  </p>
                </CardContent>
              </Card>
            )}
            {!catalog.order && empty && (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>
                    {t('No purchase options are available')}
                  </EmptyTitle>
                  <EmptyDescription>
                    {t(
                      'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.'
                    )}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {!catalog.order && !empty && (
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void submit()
                }}
                className='flex min-w-0 flex-col gap-5'
                aria-busy={submitting}
              >
                <FieldGroup>
                  <FieldSet disabled={locked}>
                    <FieldLegend id='purchase-plans'>
                      {t('Subscription plan')}
                    </FieldLegend>
                    <RadioGroup
                      aria-labelledby='purchase-plans'
                      value={selectedPlan === null ? '' : String(selectedPlan)}
                      onValueChange={(value) => setPlanId(Number(value))}
                      disabled={locked}
                    >
                      {catalog.plans.map((plan) => (
                        <Card key={plan.id}>
                          <CardHeader>
                            <Field
                              orientation='horizontal'
                              data-disabled={locked}
                            >
                              <RadioGroupItem
                                id={`purchase-plan-${plan.id}`}
                                value={String(plan.id)}
                              />
                              <FieldLabel
                                className='min-w-0 flex-1'
                                htmlFor={`purchase-plan-${plan.id}`}
                              >
                                {plan.title}
                              </FieldLabel>
                            </Field>
                            <CardDescription>{plan.subtitle}</CardDescription>
                          </CardHeader>
                          <CardContent className='flex flex-col gap-2'>
                            <p className='text-xl font-semibold'>
                              {plan.amount} CNY
                            </p>
                            <p>{t('One calendar month')}</p>
                            <p>
                              {plan.quota_unlimited
                                ? t('Unlimited quota')
                                : t('Internal quota units: {{amount}}', {
                                    amount: plan.total_amount,
                                  })}
                            </p>
                            {plan.requests_per_minute > 0 && (
                              <p>
                                {t('Plan rate limit: {{rpm}} requests/min', {
                                  rpm: plan.requests_per_minute,
                                })}
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </RadioGroup>
                  </FieldSet>
                  <FieldSet disabled={locked}>
                    <FieldLegend id='purchase-methods'>
                      {t('Payment method')}
                    </FieldLegend>
                    <RadioGroup
                      aria-labelledby='purchase-methods'
                      value={selectedMethod}
                      onValueChange={(value) => setMethod(String(value))}
                      disabled={locked}
                    >
                      {catalog.payment_methods.map((item) => (
                        <Field
                          key={item.id}
                          orientation='horizontal'
                          data-disabled={locked}
                          className='min-h-11'
                        >
                          <RadioGroupItem
                            id={`purchase-method-${item.id}`}
                            value={item.id}
                          />
                          <FieldLabel htmlFor={`purchase-method-${item.id}`}>
                            {item.name}
                          </FieldLabel>
                        </Field>
                      ))}
                    </RadioGroup>
                  </FieldSet>
                </FieldGroup>
                {draft && (
                  <div role='status'>
                    <p>
                      {t(
                        'Your original options are locked for safe retry. A new purchase must start from the merchant.'
                      )}
                    </p>
                    <p>
                      {t('Original plan {{plan}} · payment {{method}}', {
                        plan: draft.plan_id,
                        method: draft.payment_method,
                      })}
                    </p>
                  </div>
                )}
                <Button
                  type='submit'
                  className='h-auto min-h-11 w-full whitespace-normal'
                  disabled={
                    submitting ||
                    loading ||
                    !selectedPlan ||
                    !selectedMethod ||
                    error === 'conflict' ||
                    error === 'unavailable'
                  }
                >
                  {submitLabel}
                </Button>
              </form>
            )}
          </>
        )}
        {!terminal && !submitting && (
          <Button
            type='button'
            variant='outline'
            className='h-auto min-h-11 w-full whitespace-normal'
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            {t('Check purchase status')}
          </Button>
        )}
        <p className='text-muted-foreground text-sm'>
          {t(
            'Only verified payment activates your subscription. This page cannot confirm payment.'
          )}
        </p>
      </div>
    </main>
  )
}
