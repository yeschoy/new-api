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

import { resolveCnyDisplay } from '../lib/filters'

type CnyAmountProps = {
  /** Six-place decimal string, or null when the conversion is unavailable. */
  amount: string | null | undefined
  /** Raw quota as its exact decimal string; tells "tiny" from "zero". */
  rawQuota: string
  className?: string
}

/**
 * CNY display equivalent. Renders the server's decimal string as delivered:
 * a missing amount is "unavailable" (never ¥0) and a positive quota rounding
 * to zero is "less than the smallest unit" (never free).
 */
export function CnyAmount(props: CnyAmountProps) {
  const { t } = useTranslation()
  const display = resolveCnyDisplay(props.amount, props.rawQuota)
  if (display.kind === 'unavailable') {
    return (
      <span className={props.className} data-cny-state='unavailable'>
        {t('Unavailable')}
      </span>
    )
  }
  if (display.kind === 'below-minimum') {
    return (
      <span
        className={props.className}
        data-cny-state='below-minimum'
        title={t('Less than the smallest displayed unit, not free.')}
      >
        {t('Less than ¥0.000001')}
      </span>
    )
  }
  return (
    <span className={props.className} data-cny-state='amount'>
      ¥{display.amount}
    </span>
  )
}
