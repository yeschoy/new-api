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

/*
 * The beginner guide's tool catalog. Texts are Chinese marked with tk();
 * product names and error codes stay as plain strings. Steps, tips and
 * snippets may hold {host}, {baseUrl} and {fullUrl}, filled with this site's
 * address when shown.
 */
export type ToolCategory = 'chat' | 'translate' | 'coding' | 'manager' | 'platform'

/** green: works with the OpenAI-compatible address; yellow: needs a config file; blue: needs its own protocol; gray: no custom address. */
export type ToolStatus = 'green' | 'yellow' | 'blue' | 'gray'

export type BeginnerTool = {
  id: string
  name: string
  category: ToolCategory
  status: ToolStatus
  recommended?: boolean
  summary: string
  steps: string[]
  tips?: string[]
  snippet?: { label: string; code: string }
}

export type TroubleshootRow = { error: string; meaning: string; fix: string }

export type UseCase = {
  useCase: string
  tools: string
  difficulty: 'easy' | 'medium' | 'advanced'
  /** The tools (by id) the card narrows the list to. */
  toolIds: string[]
}
