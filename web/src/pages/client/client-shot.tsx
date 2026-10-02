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
export type Screenshot = { src: string; width: number; height: number }

/** Screenshots of the real desktop client, kept in public/client. */
export const SCREENSHOTS = {
  appsLight: { src: '/client/yecai-client-apps-light-showcase.webp', width: 1820, height: 880 },
  appsDark: { src: '/client/yecai-client-apps-dark-showcase.webp', width: 1826, height: 873 },
  connection: { src: '/client/yecai-client-app-connection-showcase.webp', width: 1825, height: 982 },
  pricing: { src: '/client/yecai-client-model-pricing-showcase.webp', width: 1820, height: 1344 },
} satisfies Record<string, Screenshot>

/** A screenshot in a plain app-window frame, captioned in its title bar. */
export function Shot(props: { shot: Screenshot; alt: string; caption: string; first?: boolean }) {
  return (
    <figure className='border-or-line bg-or-card min-w-0 overflow-hidden rounded-[12px] border'>
      <figcaption className='border-or-line text-or-muted flex h-9 items-center gap-3 border-b px-3 text-[12px] font-medium'>
        <span className='flex shrink-0 gap-1.5' aria-hidden='true'>
          <span className='bg-or-fg/15 size-2.5 rounded-full' />
          <span className='bg-or-fg/15 size-2.5 rounded-full' />
          <span className='bg-or-fg/15 size-2.5 rounded-full' />
        </span>
        <span className='truncate'>{props.caption}</span>
      </figcaption>
      <img
        src={props.shot.src}
        alt={props.alt}
        width={props.shot.width}
        height={props.shot.height}
        loading={props.first ? 'eager' : 'lazy'}
        fetchPriority={props.first ? 'high' : 'auto'}
        decoding='async'
        className='block h-auto w-full'
      />
    </figure>
  )
}
