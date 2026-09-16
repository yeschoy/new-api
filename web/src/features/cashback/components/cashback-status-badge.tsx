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

import type {
  CashbackReviewStatus,
  CashbackRiskLevel,
  CashbackSettlementStatus,
} from '../types'

type CashbackStatusBadgeProps =
  | { kind: 'risk'; value: CashbackRiskLevel }
  | { kind: 'review'; value: CashbackReviewStatus }
  | { kind: 'settlement'; value: CashbackSettlementStatus }

export function CashbackStatusBadge(props: CashbackStatusBadgeProps) {
  const { t } = useTranslation()
  const labels = {
    low: t('Low risk'),
    medium: t('Medium risk'),
    high: t('High risk'),
    severe: t('Severe risk'),
    pending: t('Pending review'),
    approved: t('Approved'),
    rejected: t('Rejected'),
    frozen: t('Frozen'),
    issued: t('Issued'),
    canceled: t('Canceled'),
    reclaimed: t('Reclaimed'),
    debt: t('Debt'),
  }
  let variant: 'default' | 'destructive' | 'secondary' = 'secondary'
  if (
    props.value === 'high' ||
    props.value === 'severe' ||
    props.value === 'rejected' ||
    props.value === 'debt'
  ) {
    variant = 'destructive'
  } else if (
    props.value === 'approved' ||
    props.value === 'issued' ||
    props.value === 'reclaimed'
  ) {
    variant = 'default'
  }

  return <Badge variant={variant}>{labels[props.value]}</Badge>
}
