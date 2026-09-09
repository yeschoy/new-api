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
import { LOG_TYPE_ENUM } from '../constants'
import type { UsageLog } from '../data/schema'
import type { LogOtherData } from '../types'
import { parseLogOther, isViolationFeeLog } from './format'
import { isPerCallBilling } from './utils'

export function isFailedRequest(log: UsageLog): boolean {
  return (
    log.type === LOG_TYPE_ENUM.ERROR ||
    (log.is_stream &&
      parseLogOther(log.other)?.stream_status?.status === 'error')
  )
}

export function getRequestErrorText(log: UsageLog): string {
  const other = parseLogOther(log.other)
  const stream = other?.stream_status
  const parts = [
    other?.reject_reason,
    stream?.end_error,
    ...(Array.isArray(stream?.errors) ? stream.errors : []),
    log.content,
  ]
  return parts
    .filter((part) => typeof part === 'string' && part.trim())
    .join('\n')
}

export function getRecordedUnitPrices(other: LogOtherData | null) {
  if (isViolationFeeLog(other)) {
    return { mode: 'fee' as const, input: null, output: null, perRequest: null }
  }
  if (other?.billing_mode === 'tiered_expr') {
    return {
      mode: 'dynamic' as const,
      input: null,
      output: null,
      perRequest: null,
    }
  }
  if (isPerCallBilling(other?.model_price)) {
    const price = other?.model_price
    return {
      mode: 'request' as const,
      input: null,
      output: null,
      perRequest:
        typeof price === 'number' && Number.isFinite(price) ? price : null,
    }
  }
  const modelRatio = other?.model_ratio
  const outputRatio = other?.completion_ratio
  const input =
    typeof modelRatio === 'number' &&
    Number.isFinite(modelRatio) &&
    modelRatio >= 0
      ? modelRatio * 2
      : null
  const output =
    input !== null &&
    typeof outputRatio === 'number' &&
    Number.isFinite(outputRatio) &&
    outputRatio >= 0
      ? input * outputRatio
      : null
  return {
    mode: 'tokens' as const,
    input: input !== null && Number.isFinite(input) ? input : null,
    output: output !== null && Number.isFinite(output) ? output : null,
    perRequest: null,
  }
}
