import type { CashbackReward } from '../types'

// Historical source-less reviews count only when a human reviewer is recorded.
export function isManuallyApprovedPayer(reward: CashbackReward): boolean {
  return (
    reward.direction === 'invitee' &&
    reward.review_status === 'approved' &&
    reward.reward_quota > 0 &&
    (reward.review_source === 'manual' ||
      (reward.review_source === '' && reward.reviewed_by > 0))
  )
}
