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
import z from 'zod'

// IDs, quota, token counts and aggregates are decimal strings in the frozen
// contract (docs/partner-tenant-api.md). They can exceed 2^53 and are never
// parsed into numbers here.

export const PARTNER_USAGE_LOG_TYPE_CONSUME = 2
export const PARTNER_USAGE_LOG_TYPE_ERROR = 5

export const partnerUsageLogSchema = z.object({
  id: z.string(),
  event_id: z.string(),
  created_at: z.number(),
  type: z.number(),
  tenant_id: z.string(),
  tenant_name: z.string(),
  account_id: z.string(),
  identity_source: z.string(),
  user_id: z.string(),
  username: z.string(),
  token_id: z.string(),
  token_name: z.string(),
  model_name: z.string(),
  channel_id: z.string(),
  channel_name: z.string(),
  group: z.string(),
  ip: z.string(),
  request_id: z.string(),
  upstream_request_id: z.string(),
  subscription_id: z.string(),
  quota: z.string(),
  quota_cny: z.string().nullable(),
  prompt_tokens: z.string(),
  completion_tokens: z.string(),
  use_time: z.number(),
  is_stream: z.boolean(),
  content: z.string(),
  other: z.string(),
})
export type PartnerUsageLog = z.infer<typeof partnerUsageLogSchema>

export const partnerUsageLogPageSchema = z.object({
  page: z.number(),
  page_size: z.number(),
  total: z.number(),
  items: z.array(partnerUsageLogSchema),
  start_timestamp: z.number(),
  end_timestamp: z.number(),
})
export type PartnerUsageLogPage = z.infer<typeof partnerUsageLogPageSchema>

export const partnerUsageLogStatSchema = z.object({
  record_count: z.string(),
  request_count: z.string(),
  succeeded_count: z.string(),
  failed_count: z.string(),
  quota: z.string(),
  prompt_tokens: z.string(),
  completion_tokens: z.string(),
  tokens: z.string(),
  quota_cny: z.object({
    currency: z.string(),
    available: z.boolean(),
    reason: z.string().optional(),
    amount: z.string().nullable(),
    // A factor whose configuration is invalid is delivered as null.
    quota_per_unit: z.string().nullable(),
    usd_to_cny_rate: z.string().nullable(),
    scale: z.number(),
    rounding: z.string(),
  }),
  start_timestamp: z.number(),
  end_timestamp: z.number(),
})
export type PartnerUsageLogStat = z.infer<typeof partnerUsageLogStatSchema>
