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
import { formatQuota } from '@/lib/format'

export function formatConsoleMoney(quota: number): string {
  return formatQuota(Number.isFinite(quota) ? quota : 0)
}

export function estimateGatewayListSavings(
  logs: Array<{ quota: number; model_name: string }>,
  catalog: SavingsModel[]
): number {
  const byName = new Map(catalog.map((model) => [model.modelName, model]))
  let saved = 0
  for (const log of logs) {
    const model = byName.get(log.model_name)
    if (!model) continue
    if (model.savingsPercent <= 0 || model.savingsPercent >= 100) continue
    saved += log.quota * (model.savingsPercent / (100 - model.savingsPercent))
  }
  return saved
}
