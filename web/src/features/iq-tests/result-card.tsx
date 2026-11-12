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
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toIntlLocale } from '@/i18n/languages'

import { IQPreview } from './preview'
import {
  artifactRevision,
  type IQModelCard,
  type IQResult,
  type IQStatus,
} from './types'

export function IQStatusLabel(props: { status: IQStatus }) {
  const { t } = useTranslation()
  switch (props.status) {
    case 'pending':
      return t('Pending')
    case 'running':
      return t('Running')
    case 'success':
      return t('Success')
    case 'timeout':
      return t('Timed out')
    case 'unavailable':
      return t('Model unavailable')
    case 'invalid_artifact':
      return t('Invalid artwork')
    case 'interrupted':
      return t('Interrupted')
    default:
      return t('Failed')
  }
}

function IQFailureMessage(props: { result: IQResult }) {
  const { t } = useTranslation()
  // Never render raw backend/provider messages, including historical records.
  // The numeric HTTP suffix is the only interpolated diagnostic value.
  switch (props.result.status) {
    case 'timeout':
      return t('The IQ request timed out.')
    case 'interrupted':
      return t('Execution was interrupted and was not retried.')
    case 'unavailable':
      return t('No compatible enabled route is available.')
    case 'invalid_artifact':
      return t(
        'The model did not return a complete HTML or SVG artwork within the size limit.'
      )
  }
  const httpStatus = /^upstream_http_([1-5]\d{2})$/.exec(
    props.result.error_code
  )?.[1]
  if (httpStatus && httpStatus !== '200') {
    return t('Upstream rejected the request (HTTP {{status}}).', {
      status: httpStatus,
    })
  }
  switch (props.result.error_code) {
    case 'transport_timeout':
      return t('The upstream connection timed out.')
    case 'transport_error':
      return t('The upstream request failed before a response was received.')
    case 'response_read_failed':
      return t('Could not read the upstream response.')
    case 'request_setup_failed':
      return t('The IQ request could not be prepared.')
    default:
      return t(
        'The request failed. Detailed diagnostics are not available for this run.'
      )
  }
}

export function IQTime(props: { seconds: number }) {
  const { t, i18n } = useTranslation()
  if (!props.seconds) return <>{t('Not scheduled')}</>
  return (
    <time dateTime={new Date(props.seconds * 1000).toISOString()}>
      {new Intl.DateTimeFormat(
        toIntlLocale(i18n.resolvedLanguage || i18n.language),
        { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Shanghai' }
      ).format(props.seconds * 1000)}
    </time>
  )
}

export function IQResultCard(props: {
  scope: string
  card: IQModelCard
  live: boolean
  onOpen: (revision: string) => void
}) {
  const { t } = useTranslation()
  const latest = props.card.latest
  const progress = props.card.progress
  const success = latest?.status === 'success'
  const failed =
    latest &&
    !success &&
    latest.status !== 'pending' &&
    latest.status !== 'running'
  const revision = latest ? artifactRevision(latest) : ''
  return (
    <Card className='min-w-0' data-iq-preview={success ? revision : undefined}>
      <CardHeader>
        <CardTitle className='break-all'>{props.card.model}</CardTitle>
        <CardDescription>
          {latest ? (
            <>
              {t('Run result')} · <IQTime seconds={latest.completed_at} />
            </>
          ) : (
            t('No result yet')
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className='bg-muted flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg'>
          {success && latest && props.live ? (
            <IQPreview scope={props.scope} result={latest} />
          ) : (
            <p className='text-muted-foreground p-6 text-center text-sm'>
              {success ? t('Open preview') : t('No artwork available')}
            </p>
          )}
        </div>
        {failed && latest && (
          <p className='text-destructive mt-3 text-sm break-words'>
            <IQFailureMessage result={latest} />
          </p>
        )}
      </CardContent>
      <CardFooter className='flex-wrap justify-between gap-3'>
        <div className='flex flex-wrap gap-2'>
          {latest && (
            <Badge variant={success ? 'secondary' : 'destructive'}>
              <IQStatusLabel status={latest.status} />
            </Badge>
          )}
          {progress && (
            <Badge variant='outline'>
              {t('Current run')}: <IQStatusLabel status={progress.status} />
            </Badge>
          )}
        </div>
        {success && (
          <Button
            variant='outline'
            size='sm'
            onClick={() => props.onOpen(revision)}
            aria-label={t('Preview {{model}}', { model: props.card.model })}
          >
            {t('Open preview')}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
