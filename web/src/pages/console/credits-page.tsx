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
import { useSearchParams } from 'react-router'

import { Notice } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { BalancePanel } from '@/pages/wallet/balance-panel'
import { SubscriptionPanel } from '@/pages/wallet/subscription-panel'
import { TopUpHistory } from '@/pages/wallet/topup-history'
import { TopUpPanel } from '@/pages/wallet/topup-panel'
import { useWalletInfo } from '@/pages/wallet/wallet-hooks'

import { ConsolePage } from './console-page'
import { RedeemPanel } from './credits-redeem'

/** The wallet: balance, online top-up, redemption codes, subscriptions and top-up orders. */
export function CreditsPage() {
  const { t } = useI18n()
  return (
    <ConsolePage active='credits' title={t('钱包')} description={t('余额用于支付模型调用费用，按实际用量实时扣除。')}>
      <WalletContent />
    </ConsolePage>
  )
}

function WalletContent() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const info = useWalletInfo()

  return (
    <div className='flex flex-col gap-4'>
      <BalancePanel />
      {info.data ? <TopUpPanel info={info.data} /> : null}
      {info.isError ? <Notice tone='error'>{errorMessage(info.error, t('获取充值信息失败'))}</Notice> : null}
      <RedeemPanel info={info.data} />
      {info.data ? <SubscriptionPanel info={info.data} /> : null}
      <TopUpHistory focus={params.has('show_history')} />
    </div>
  )
}
