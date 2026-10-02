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

/** A decorative trend line under a figure; the figure itself carries the information. */
export function Sparkline(props: { values: number[] }) {
  const values = props.values.length > 1 ? props.values : [0, 0]
  const max = Math.max(...values, 0)
  const step = 100 / (values.length - 1)
  const y = (value: number) => (max > 0 ? 30 - (value / max) * 26 : 30)
  const points = values.map((value, index) => `${(index * step).toFixed(2)},${y(value).toFixed(2)}`).join(' ')
  return (
    <svg aria-hidden='true' viewBox='0 0 100 32' preserveAspectRatio='none' className='mt-3 h-10 w-full overflow-visible'>
      <polygon points={`0,32 ${points} 100,32`} style={{ fill: 'var(--or-primary)', opacity: 0.08 }} />
      <polyline points={points} fill='none' vectorEffect='non-scaling-stroke' style={{ stroke: 'var(--or-primary)', strokeWidth: 1.5 }} />
    </svg>
  )
}
