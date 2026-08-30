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

export const ROUTE_IDS = ['mainland', 'global', 'current'] as const
export type RouteId = (typeof ROUTE_IDS)[number]

export const ADDRESS_KINDS = ['baseUrl', 'host', 'path', 'fullUrl'] as const
export type AddressKind = (typeof ADDRESS_KINDS)[number]

export const USE_CASE_IDS = [
  'chat',
  'office',
  'code',
  'translate',
  'workflow',
  'account',
] as const
export type UseCaseId = (typeof USE_CASE_IDS)[number]

export const TOOL_STATUSES = ['ready', 'config', 'protocol', 'blocked'] as const
export type ToolStatus = (typeof TOOL_STATUSES)[number]

export type RouteAddresses = {
  host: string
  baseUrl: string
  path: string
  fullUrl: string
}

export type UseCase = {
  id: UseCaseId
  labelKey: string
  hintKey: string
}

export type GuideTool = {
  id: string
  name: string
  status: ToolStatus
  useCases: UseCaseId[]
  beginnerPick?: boolean
  fillKey: string
  noteKey: string
  steps: string[]
  mistakeKey: string
  successKey: string
  docsUrl?: string
  siteUrl?: string
}

export type ErrorRow = {
  id: string
  symptomKey: string
  meaningKey: string
  actionKey: string
}
