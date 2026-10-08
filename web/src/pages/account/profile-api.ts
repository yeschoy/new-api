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
import { t } from '@/i18n/i18n'
import { api, type ApiEnvelope } from '@/lib/api'
import { unwrap } from '@/lib/console-api'

// ── Email (controller/user.go EmailBind) ──────────────────────────────────

export async function bindEmail(email: string, code: string): Promise<void> {
  const res = await api.post<ApiEnvelope<unknown>>('/api/oauth/email/bind', { email, code })
  unwrap(res.data, t('绑定失败'))
}

// ── Preferences kept in the user's settings (controller/user.go UpdateSelf) ──

export async function saveLanguage(language: string): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/user/self', { language })
  unwrap(res.data, t('保存失败'))
}

/** The console menu choice, as the JSON string consoleModuleOn reads. */
export async function saveSidebarModules(json: string): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/user/self', { sidebar_modules: json })
  unwrap(res.data, t('保存失败'))
}

export type NotifyType = 'email' | 'webhook' | 'bark' | 'gotify'

/** controller/user.go UpdateUserSettingRequest; the threshold is in quota units. */
export type NotificationSettings = {
  notify_type: NotifyType
  quota_warning_threshold: number
  notification_email: string
  webhook_url: string
  webhook_secret: string
  bark_url: string
  gotify_url: string
  gotify_token: string
  gotify_priority: number
  accept_unset_model_ratio_model: boolean
  record_ip_log: boolean
  upstream_model_update_notify_enabled: boolean
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const res = await api.put<ApiEnvelope<unknown>>('/api/user/setting', settings)
  unwrap(res.data, t('保存失败'))
}

// ── Daily check-in (controller/checkin.go) ────────────────────────────────

export type CheckinRecord = { checkin_date: string; quota_awarded: number }

export type CheckinStatus = {
  enabled: boolean
  min_quota: number
  max_quota: number
  stats: {
    checked_in_today: boolean
    total_checkins: number
    total_quota: number
    checkin_count: number
    records: CheckinRecord[] | null
  }
}

/** `month` is YYYY-MM. */
export async function getCheckin(month: string): Promise<CheckinStatus> {
  const res = await api.get<ApiEnvelope<CheckinStatus>>('/api/user/checkin', { params: { month } })
  return unwrap(res.data, t('获取签到信息失败'))
}

/** Checks in for today; the route sits behind the human check when it is on. */
export async function checkIn(turnstile: string): Promise<{ quota_awarded: number }> {
  const res = await api.post<ApiEnvelope<{ quota_awarded: number }>>('/api/user/checkin', undefined, {
    params: turnstile ? { turnstile } : {},
  })
  return unwrap(res.data, t('签到失败'))
}
