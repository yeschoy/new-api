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

import type { CashbackReward } from '../types'

type Props = {
  reward: Pick<CashbackReward, 'strategy' | 'fixed_per_hundred' | 'rate_bps'>
}

export function CashbackStrategyLabel(props: Props) {
  const { t } = useTranslation()
  if (props.reward.strategy === 'per_hundred') {
    return (
      <>
        {t('Every 100 of top-up returns {{amount}}', {
          amount: props.reward.fixed_per_hundred,
        })}
      </>
    )
  }
  return <>{(props.reward.rate_bps / 100).toFixed(2)}%</>
}
