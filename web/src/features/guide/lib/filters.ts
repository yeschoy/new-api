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
import { ERROR_ROWS } from '../constants'
import type { GuideTool, UseCaseId } from '../types'

export function filterGuideTools(
  tools: readonly GuideTool[],
  useCase: UseCaseId | 'all',
  query: string
) {
  const normalized = query.trim().toLowerCase()
  return tools.filter((tool) => {
    const matchesUseCase = useCase === 'all' || tool.useCases.includes(useCase)
    if (!matchesUseCase) return false
    if (!normalized) return true
    return tool.name.toLowerCase().includes(normalized)
  })
}

export function filterErrorRows(query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return ERROR_ROWS
  return ERROR_ROWS.filter((row) => {
    return `${row.symptomKey} ${row.meaningKey} ${row.actionKey}`
      .toLowerCase()
      .includes(normalized)
  })
}
