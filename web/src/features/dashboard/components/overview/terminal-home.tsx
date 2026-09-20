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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { Copy, KeyRound, Rocket, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { TerminalPage } from '@/components/layout/components/terminal-page'
import { useGuideAddress } from '@/features/guide/use-guide-address'
import { getApiKeys } from '@/features/keys/api'
import { useUsageSummary } from '@/features/usage-logs/hooks/use-usage-summary'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { formatConsoleMoney } from '@/lib/console-money'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function TerminalHome() {
  const { t } = useTranslation()
  const user = useAuthStore((state) => state.auth.user)
  const address = useGuideAddress()
  const clipboard = useCopyToClipboard({ notify: false })
  const remainQuota = Number(user?.quota ?? 0)
  const requestCount = Number(user?.request_count ?? 0)
  const summary = useUsageSummary(1)

  const keysQuery = useQuery({
    queryKey: ['terminal', 'home', 'keys'],
    queryFn: async () => {
      const result = await getApiKeys({ p: 1, size: 10 })
      return result.success ? (result.data?.items ?? []) : []
    },
    staleTime: 60 * 1000,
  })
  const hasKey = (keysQuery.data?.length ?? 0) > 0
  const funded = remainQuota > 0
  const requested = requestCount > 0 || (summary.data?.requests ?? 0) > 0
  const completedSteps = Number(funded) + Number(hasKey) + Number(requested)
  let currentStep = 1
  if (funded && hasKey) currentStep = 3
  else if (funded) currentStep = 2
  let setupAction = (
    <Link to='/playground' className='ed-btn ed-btn--accent ed-btn--sm'>
      {t('Open playground')}
    </Link>
  )
  if (!funded) {
    setupAction = (
      <Link to='/wallet' hash='topup' className='ed-btn ed-btn--accent ed-btn--sm'>
        {t('Top up')}
      </Link>
    )
  } else if (!hasKey) {
    setupAction = (
      <Link to='/keys' className='ed-btn ed-btn--accent ed-btn--sm'>
        {t('Create an API key')}
      </Link>
    )
  }

  return (
    <TerminalPage
      title={t('Overview')}
      description={t('What you spend, and how to send the first request.')}
    >
      {summary.error ? (
        <p role='alert' className='text-destructive'>
          {t(summary.error.message)}
        </p>
      ) : null}
      <section className='ed-paper ed-onboard'>
        <div className='ed-onboardHead'>
          <div>
            <p className='ed-eyebrow'>
              <Rocket size={13} aria-hidden='true' />
              {t('Get started')}
            </p>
            <h2 className='ed-display'>{t('Send your first request')}</h2>
            <p>
              {t(
                'Three quick steps, each checked against your live workspace.'
              )}
            </p>
          </div>
          <p className='ed-onboardMeta'>
            {t('{{done}} of 3 steps', { done: completedSteps })} ·{' '}
            {Math.round((completedSteps / 3) * 100)}%
          </p>
        </div>
        <div className='ed-onboardSteps'>
          <article
            className={cn('ed-onboardStep', currentStep === 1 && 'is-current')}
          >
            <b>1</b>
            <h3>
              <Wallet size={14} aria-hidden='true' /> {t('Fund the wallet')}
            </h3>
            <p>{t('Add credit so requests can run.')}</p>
          </article>
          <article
            className={cn('ed-onboardStep', currentStep === 2 && 'is-current')}
          >
            <b>2</b>
            <h3>
              <KeyRound size={14} aria-hidden='true' /> {t('Create an API key')}
            </h3>
            <p>
              {t(
                'Create a key here. You can copy it again from the API keys page.'
              )}
            </p>
          </article>
          <article
            className={cn('ed-onboardStep', currentStep === 3 && 'is-current')}
          >
            <b>3</b>
            <h3>{t('Make the first request')}</h3>
            <p>{t('Run a test from the playground with the workspace key.')}</p>
          </article>
        </div>
        <div className='ed-onboardActions'>{setupAction}</div>
      </section>

      <section className='ed-stats ed-stats--three'>
        <article>
          <span>{t('Available balance')}</span>
          <strong className={remainQuota <= 0 ? 'is-empty' : undefined}>
            {formatConsoleMoney(remainQuota)}
          </strong>
          <small>
            {remainQuota <= 0
              ? t('Too low to cover requests.')
              : t('Balance you can still spend')}
          </small>
        </article>
        <article>
          <span>{t('Wallet spending today')}</span>
          <strong>
            {summary.data ? formatConsoleMoney(summary.data.quota) : '—'}
          </strong>
          <small>
            {summary.data
              ? t('Subscription usage: {{quota}} quota units', {
                  quota: summary.data.subscription_quota ?? 0,
                })
              : '—'}
          </small>
        </article>
        <article>
          <span>{t('Savings today')}</span>
          <strong className='is-saved'>
            {summary.data ? formatConsoleMoney(summary.data.saved_quota) : '—'}
          </strong>
          <small>{t('Today · recorded request rates')}</small>
        </article>
      </section>

      <section className='ed-panel'>
        <header className='ed-panelHead'>
          <div>
            <h2>{t('Connect your client')}</h2>
            <p>
              {t(
                'Drop-in OpenAI-compatible endpoint. Swap the base URL and go.'
              )}
            </p>
          </div>
        </header>
        <div className='ed-panelBody'>
          <div className='ed-field'>
            <span>{t('API key')}</span>
            <div className='ed-fieldRow'>
              {hasKey ? (
                <Link to='/keys' className='ed-btn ed-btn--outline ed-btn--xs'>
                  {t('Manage keys')}
                </Link>
              ) : (
                <Link to='/keys' className='ed-btn ed-btn--xs'>
                  <KeyRound aria-hidden='true' />
                  {t('Create your first key')}
                </Link>
              )}
            </div>
          </div>
          <div className='ed-field'>
            <span>{t('Base URL')}</span>
            <div className='ed-inlineCopy'>
              <code>{address.baseUrl}</code>
              <button
                type='button'
                className='ed-iconBtn ed-iconBtn--xs'
                aria-label={t('Copy')}
                onClick={() => {
                  void clipboard.copyToClipboard(address.baseUrl)
                }}
              >
                <Copy size={14} aria-hidden='true' />
              </button>
            </div>
          </div>
          <Link
            to='/beginner-guide'
            className='ed-btn ed-btn--outline ed-btn--xs'
          >
            {t('Read the docs')}
          </Link>
        </div>
      </section>
    </TerminalPage>
  )
}
