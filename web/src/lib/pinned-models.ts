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
import type { CatalogModel } from './queries'

/** The site's favourite models, in order: first on the home page, and the chat's default. */
export const PINNED_MODELS: ReadonlyArray<{ name: string; vendor: string }> = [
  { name: 'deepseek-v4.1-flash', vendor: 'DeepSeek' },
  { name: 'gpt-6-sol', vendor: 'OpenAI' },
  { name: 'claude-opus-5-5', vendor: 'Anthropic' },
]

/** The first pinned model the catalog has, else the first by name; the catalog's own order is not stable. */
export function defaultModel(models: CatalogModel[]): string {
  const pinned = PINNED_MODELS.find((pin) => models.some((model) => model.model_name === pin.name))
  if (pinned) return pinned.name
  const names = models.map((model) => model.model_name)
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))[0] ?? ''
}
