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
import { Button, Modal, Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'

export type PayRow = { label: string; value: React.ReactNode }

/** "确认支付": what is bought and what it costs, then on to the provider. */
export function PayDialog(props: {
  rows: PayRow[]
  error?: string | null
  busy: boolean
  /** False until the price is known. */
  ready: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useI18n()
  return (
    <Modal
      title={t('确认支付')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button variant='primary' busy={props.busy} disabled={!props.ready} onClick={props.onConfirm}>
            {t('确认支付')}
          </Button>
        </>
      }
    >
      <dl className='flex flex-col gap-3 text-[14px]'>
        {props.rows.map((row) => (
          <div key={row.label} className='flex items-baseline justify-between gap-4'>
            <dt className='text-or-muted shrink-0'>{row.label}</dt>
            <dd className='min-w-0 text-right font-medium break-words tabular-nums'>{row.value}</dd>
          </div>
        ))}
      </dl>
      {props.error ? <Notice tone='error' className='mt-4'>{props.error}</Notice> : null}
    </Modal>
  )
}
