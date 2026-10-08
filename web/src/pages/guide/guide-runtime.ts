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
import type { GuideAudience } from './guide-types'

/** Examples never show a real key; this stands in for it. */
export const API_KEY_PLACEHOLDER = 'sk-••••••'

/** What the guide fills into its texts and code: this site's addresses, the chosen model and group, and the brand. */
export type GuideValues = {
  host: string
  baseUrl: string
  fullUrl: string
  model: string
  group: string
  apiKey: string
  brand: string
}

const NAMES = /\{(host|baseUrl|fullUrl|model|group|apiKey|brand)\}/g

/** Fills the {placeholders} of a code template it has values for; anything else (JSON braces, other names) stays as written. */
export function fillTemplate(template: string, values: Partial<GuideValues>): string {
  return template.replace(NAMES, (match, name: keyof GuideValues) => values[name] ?? match)
}

/** The account's models that speak the article's protocol, by name; every model when the article works with any. */
export function filterModelsForAudience(
  accountModels: readonly string[],
  pricing: ReadonlyArray<{ model_name: string; supported_endpoint_types?: string[] }>,
  audience: GuideAudience
): string[] {
  const models = [...new Set(accountModels)].sort((a, b) => a.localeCompare(b))
  if (audience === 'all') return models
  const speaks = new Set(pricing.filter((model) => model.supported_endpoint_types?.includes(audience)).map((model) => model.model_name))
  return models.filter((model) => speaks.has(model))
}
