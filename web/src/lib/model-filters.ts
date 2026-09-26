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
import type { Modality } from './services'

/** What a model produces; text when the catalog does not say. */
export function outputsOf(model: CatalogModel): Modality[] {
  return model.output_modalities?.length ? model.output_modalities : ['text']
}

/** What a model accepts; text when the catalog does not say. */
export function inputsOf(model: CatalogModel): Modality[] {
  return model.input_modalities?.length ? model.input_modalities : ['text']
}
