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
import { useCallback, useState } from 'react'

import { revealOne } from './keys-api'

export type FullKey = { value: string | null; load: () => Promise<string> }

/** The full key behind a masked one, fetched on first use and kept for the row. */
export function useFullKey(id: number): FullKey {
  const [value, setValue] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (value) return value
    const full = await revealOne(id)
    setValue(full)
    return full
  }, [id, value])
  return { value, load }
}
