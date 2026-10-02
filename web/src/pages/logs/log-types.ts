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

/** Admins (role >= 10) read everyone's logs ('all') or only their own ('self'). */
export type LogScope = 'all' | 'self'

export type LogPage<T> = { items: T[]; total: number }

/** One row of /api/log (model/log.go Log); `other` is a JSON string. */
export type LogEntry = {
  id: number
  user_id: number
  created_at: number
  type: number
  content: string
  username: string
  token_name: string
  model_name: string
  quota: number
  prompt_tokens: number
  completion_tokens: number
  use_time: number
  is_stream: boolean
  channel: number
  channel_name?: string | null
  token_id: number
  group: string
  ip: string
  other: string
  request_id?: string
  upstream_request_id?: string
}

export type ChannelAffinity = {
  rule_name?: string
  selected_group?: string
  using_group?: string
  key_hint?: string
  key_fp?: string
}

export type TaskPluginAuthor = { name: string; url?: string }
export type TaskPluginInfo = { key: string; name: string; version?: string; author?: TaskPluginAuthor }
export type TaskPluginRuntime = { key: string; version: string; api_version: number; generation: number }
export type RootInfo = { task_plugin?: TaskPluginRuntime; upstream_task_id?: string; node_name?: string }

export type RequestRuleTrace = { cond: string; multiplier: number; matched: boolean }

export type StreamStatus = { status?: string; end_reason?: string; error_count?: number; end_error?: string; errors?: string[] }

/** Admin-only part of `other` (the backend strips it for everyone else). */
export type LogAdminInfo = {
  is_multi_key?: boolean
  multi_key_index?: number
  use_channel?: Array<number | string>
  local_count_tokens?: boolean
  usage_billing_path?: string
  channel_affinity?: ChannelAffinity
  payment_method?: string
  callback_payment_method?: string
  caller_ip?: string
  server_ip?: string
  version?: string
  node_name?: string
  admin_username?: string
  admin_id?: number | string
  admin_role?: number
  auth_method?: string
  quota_saturation?: { op: string; kind: 'overflow' | 'underflow' | 'nan'; original: number; clamped: number }
  task_plugin?: TaskPluginInfo
}

/** The parsed `other` field: billing inputs, cache use, audit details and diagnostics. */
export type LogOther = {
  admin_info?: LogAdminInfo
  root_info?: RootInfo
  op?: { action?: string; params?: Record<string, unknown> }
  audit_info?: { method?: string; route?: string; path?: string; status?: number; success?: boolean }
  login_method?: string
  user_agent?: string
  request_path?: string
  request_conversion?: string[]
  ws?: boolean
  audio?: boolean
  audio_input?: number
  audio_output?: number
  text_input?: number
  text_output?: number
  cache_tokens?: number
  cache_creation_tokens?: number
  cache_creation_tokens_5m?: number
  cache_creation_tokens_1h?: number
  claude?: boolean
  model_ratio?: number
  completion_ratio?: number
  model_price?: number
  group_ratio?: number
  user_group_ratio?: number
  cache_ratio?: number
  cache_creation_ratio?: number
  cache_creation_ratio_5m?: number
  cache_creation_ratio_1h?: number
  is_model_mapped?: boolean
  upstream_model_name?: string
  audio_ratio?: number
  audio_completion_ratio?: number
  frt?: number
  billing_mode?: string
  expr_b64?: string
  matched_tier?: string
  request_rules?: RequestRuleTrace[]
  usage_facts?: Record<string, string | number>
  billing_usage?: Record<string, number>
  billing_cost_before_group?: number
  reasoning_effort?: string
  image?: boolean
  image_ratio?: number
  image_output?: number
  web_search?: boolean
  web_search_call_count?: number
  web_search_price?: number
  file_search?: boolean
  file_search_call_count?: number
  file_search_price?: number
  tool_surcharges?: Array<{ name: string; count: number; price: number }>
  audio_input_seperate_price?: boolean
  audio_input_price?: number
  image_generation_call?: boolean
  image_generation_call_price?: number
  is_system_prompt_overwritten?: boolean
  po?: string[]
  billing_source?: string
  group?: string
  stream_status?: StreamStatus
  violation_fee?: boolean
  violation_fee_code?: string
  violation_fee_marker?: string
  fee_quota?: number
  reject_reason?: string
  is_task?: boolean
  task_id?: string
  reason?: string
  subscription_plan_id?: string | number
  subscription_plan_title?: string
  subscription_id?: string | number
  subscription_pre_consumed?: number
  subscription_post_delta?: number
  subscription_consumed?: number
  subscription_remain?: number
  subscription_total?: number
}

/** /api/log/stat: spend in quota units plus requests and tokens per minute. */
export type LogStats = { quota: number; rpm: number; tpm: number }

/** One row of /api/task (dto/task.go TaskDto). Times are in seconds. */
export type TaskLog = {
  id: number
  user_id: number
  username?: string
  platform: string
  task_id: string
  action: string
  channel_id: number
  group: string
  quota: number
  submit_time: number
  start_time?: number
  finish_time?: number
  progress?: string
  data?: unknown
  properties?: { input?: string; upstream_model_name?: string; origin_model_name?: string } | null
  legacy_video_available?: boolean
  fail_reason?: string
  status: string
  admin_info?: { request_id?: string; request_path?: string; task_plugin?: TaskPluginInfo }
  root_info?: RootInfo
}

/** One row of /api/mj (model/midjourney.go Midjourney). Times are in milliseconds. */
export type DrawingLog = {
  id: number
  user_id: number
  code: number
  action: string
  mj_id: string
  prompt: string
  prompt_en?: string
  submit_time: number
  start_time?: number
  finish_time?: number
  image_url?: string
  status: string
  progress?: string
  fail_reason?: string
  channel_id: number
  quota?: number
}

/** Admin view of a user (GET /api/user/:id). */
export type LogUserInfo = {
  id: number
  username: string
  display_name?: string
  quota: number
  used_quota: number
  request_count: number
  group?: string
  aff_code?: string
  aff_count?: number
  aff_quota?: number
  remark?: string
}
