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
import type { SavingsModel } from '@/features/home/lib/pricing-savings'

export type GroupDiscount =
  | { kind: 'original' }
  | { kind: 'off'; zhe: number }
  | { kind: 'markup'; times: number }

export type GroupUsageQuote = {
  input: number
  output: number
  cacheHitInput: number | null
  savingsPercent: number
  ratio: number
}

export function parseGroupRatio(value: number | string | undefined): number {
  const ratio = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(ratio) || ratio <= 0) return 1
  return ratio
}

export function describeGroupDiscount(ratio: number): GroupDiscount {
  const normalized = parseGroupRatio(ratio)
  if (Math.abs(normalized - 1) < 0.0005) return { kind: 'original' }
  if (normalized > 1) {
    return { kind: 'markup', times: Number(normalized.toFixed(2)) }
  }
  const zheRaw = normalized * 10
  const zhe = Number(zheRaw.toFixed(zheRaw % 1 === 0 ? 0 : 1))
  return { kind: 'off', zhe }
}

export function quoteGroupUsage(
  model: SavingsModel,
  groupRatio: number
): GroupUsageQuote {
  const ratio = parseGroupRatio(groupRatio)
  const input = model.baseInputPrice * ratio
  const output = model.baseOutputPrice * ratio
  const cacheRead =
    model.baseCacheReadPrice == null ? null : model.baseCacheReadPrice * ratio
  const cacheHitInput =
    cacheRead == null ? null : input * 0.05 + cacheRead * 0.95
  const savingsPercent = ratio >= 1 ? 0 : Math.floor((1 - ratio) * 100 + 1e-9)
  return { input, output, cacheHitInput, savingsPercent, ratio }
}
