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
import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { getSelf } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'

import { redeemTopupCode } from '../api'

// ============================================================================
// Redemption Hook
// ============================================================================

export function useRedemption() {
  const { t } = useTranslation()
  const [redeeming, setRedeeming] = useState(false)

  const redeemCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!code || code.trim() === '') {
        toast.error(t('Please enter a redemption code'))
        return false
      }

      try {
        setRedeeming(true)
        const response = await redeemTopupCode({ key: code })

        if (response.success && response.data) {
          if (typeof response.data === 'number') {
            toast.success(
              t('Redemption successful! Added: {{quota}}', {
                quota: formatQuota(response.data),
              })
            )
          } else if (response.data.type === 'subscription') {
            toast.success(
              t('Subscription redeemed: {{plan}}', {
                plan: response.data.plan_title,
              })
            )
          } else {
            handleServerError(response, t('Redemption failed'))
            return false
          }
          // A refresh failure cannot undo a successful, single-use redeem.
          // The wallet also retries its own user/subscription refresh.
          try {
            await getSelf()
          } catch {
            // Keep the success result so the user does not retry a spent code.
          }
          return true
        }

        handleServerError(response, t('Redemption failed'))
        return false
      } catch (_error) {
        handleServerError(_error, t('Redemption failed'))
        return false
      } finally {
        setRedeeming(false)
      }
    },
    [t]
  )

  return {
    redeeming,
    redeemCode,
  }
}
