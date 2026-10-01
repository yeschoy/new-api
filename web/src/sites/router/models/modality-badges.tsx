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
import { AudioLines, FileText, Image, Type, Video } from 'lucide-react'

import { outputsOf } from '@/lib/model-filters'
import type { CatalogModel } from '@/lib/queries'
import type { Modality } from '@/lib/services'

const BADGE: Record<Modality, { icon: React.ReactNode; className: string }> = {
  text: { icon: <Type className='size-3' />, className: 'bg-[#4d8dff]/15 text-[#4d8dff]' },
  image: { icon: <Image className='size-3' />, className: 'bg-[#22c55e]/15 text-[#22c55e]' },
  audio: { icon: <AudioLines className='size-3' />, className: 'bg-[#e879f9]/15 text-[#e879f9]' },
  video: { icon: <Video className='size-3' />, className: 'bg-[#f59e0b]/15 text-[#f59e0b]' },
  file: { icon: <FileText className='size-3' />, className: 'bg-[#94a3b8]/15 text-[#94a3b8]' },
}

/** One small coloured tile per output modality of a model. */
export function ModalityBadges(props: { model: CatalogModel }) {
  return (
    <span className='flex gap-1'>
      {outputsOf(props.model).map((m) => (
        <span key={m} title={m} className={`flex size-5 items-center justify-center rounded-[4px] ${BADGE[m].className}`}>
          {BADGE[m].icon}
        </span>
      ))}
    </span>
  )
}
