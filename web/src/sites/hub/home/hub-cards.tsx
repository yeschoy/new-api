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
import { AudioLines, Boxes, Film, Image, Layers, Mic, Plug, Users, User } from 'lucide-react'
import { useState } from 'react'

import { BrandMark } from '@/components/brand-mark'
import { ProviderIcon } from '@/components/provider-icon'
import { cn } from '@/lib/format'

const card =
  'flex h-[223px] w-full flex-col rounded-[16px] bg-white p-4 text-[#353941] shadow-[0_2px_8px_rgba(0,0,0,0.1)]'

function Chip(props: { icon: React.ReactNode; label: string; className?: string }) {
  return (
    <span className={cn('absolute flex items-center gap-1 rounded-[6px] border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-[10px] whitespace-nowrap text-[#353941]', props.className)}>
      {props.icon}
      {props.label}
    </span>
  )
}

/** Hub-and-spoke: provider strip on top, capabilities around the logo. */
function CapabilityCard(props: { icons: string[] }) {
  const i = 'size-2.5'
  return (
    <div className={card}>
      <div className='text-center text-[14px] font-medium text-[#1a1a1a]'>一个接口，接入任意模型</div>
      <div className='mx-auto mt-2 flex items-center gap-1.5 rounded-full border border-[#e5e7eb] px-2 py-0.5'>
        {props.icons.slice(0, 5).map((icon) => (
          <ProviderIcon key={icon} name={icon} size={11} />
        ))}
        <span className='text-[9px] text-[#888]'>···</span>
      </div>
      <div className='relative mx-auto mt-1 h-[130px] w-[300px]' aria-hidden='true'>
        <svg viewBox='0 0 300 130' className='absolute inset-0 text-[#d9d9d9]'>
          <path d='M150 65 H96 M150 65 H204 M150 65 L96 22 M150 65 L204 22 M150 65 L96 108 M150 65 L204 108 M150 65 V120' stroke='currentColor' fill='none' />
        </svg>
        <span className='absolute top-[45px] left-[130px] flex size-10 items-center justify-center rounded-full bg-[#1677ff]'>
          <BrandMark tone='blue' size={26} className='rounded-full' />
        </span>
        <Chip icon={<Mic className={i} />} label='语音识别' className='top-[14px] left-[40px]' />
        <Chip icon={<AudioLines className={i} />} label='语音合成' className='top-[14px] left-[196px]' />
        <Chip icon={<Image className={i} />} label='图像生成' className='top-[56px] left-[10px]' />
        <Chip icon={<Film className={i} />} label='视频生成' className='top-[56px] left-[212px]' />
        <Chip icon={<Layers className={i} />} label='向量嵌入' className='top-[98px] left-[36px]' />
        <Chip icon={<Boxes className={i} />} label='重排序' className='top-[98px] left-[204px]' />
        <Chip icon={<Plug className={i} />} label='MCP' className='top-[112px] left-[132px]' />
      </div>
    </div>
  )
}

const FORMATS = [
  { id: 'chat', label: 'Chat Completions', path: '/v1/chat/completions' },
  { id: 'messages', label: 'Messages', path: '/v1/messages' },
  { id: 'responses', label: 'Responses', path: '/v1/responses' },
] as const

function sample(format: (typeof FORMATS)[number], base: string, model: string) {
  const head = [`curl ${base}${format.path} \\`, `  -H "Authorization: Bearer sk-***" \\`, `  -H "Content-Type: application/json" \\`]
  if (format.id === 'responses') {
    return [...head, `  -d '{`, `    "model": "${model}",`, `    "input": "Hi"`, `  }'`].join('\n')
  }
  const extra = format.id === 'messages' ? `\n    "max_tokens": 1024,` : ''
  return [...head, `  -d '{`, `    "model": "${model}",${extra}`, `    "messages": [{"role":"user","content":"Hi"}]`, `  }'`].join('\n')
}

function ApiCard(props: { baseUrl: string; model: string }) {
  const [active, setActive] = useState<(typeof FORMATS)[number]['id']>('chat')
  const format = FORMATS.find((f) => f.id === active) ?? FORMATS[0]
  return (
    <div className={card}>
      <div className='text-center text-[14px] font-medium text-[#1a1a1a]'>OpenAI 兼容接口</div>
      <div role='tablist' className='mt-2 flex w-fit gap-0.5 rounded-[8px] bg-[#f5f5f5] p-0.5'>
        {FORMATS.map((f) => (
          <button
            key={f.id}
            type='button'
            role='tab'
            aria-selected={active === f.id}
            onClick={() => setActive(f.id)}
            className={cn(
              'h-[18px] rounded-[6px] px-2 font-[Arial] text-[10.5px] leading-[18px] font-medium',
              active === f.id ? 'bg-white text-[#111] shadow-sm' : 'text-[#888]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      <pre className='mt-2 h-[126px] overflow-hidden rounded-[16px] bg-[#f5f5f5] p-1.5 px-2.5 font-mono text-[11px] leading-[15.4px] text-[#353941]'>
        {sample(format, props.baseUrl, props.model)}
      </pre>
    </div>
  )
}

function RoutingCard(props: { icons: string[]; vendors: string[] }) {
  return (
    <div className={card}>
      <div className='text-center text-[14px] font-medium text-[#1a1a1a]'>更高可用性</div>
      <div className='relative mx-auto mt-3 h-[150px] w-[330px]' aria-hidden='true'>
        <svg viewBox='0 0 330 150' className='absolute inset-0 text-[#d9d9d9]'>
          <path d='M92 36 C130 36,130 75,160 75 M92 75 H160 M92 114 C130 114,130 75,160 75 M200 75 H236 M270 40 C255 40,250 75,236 75 M270 110 C255 110,250 75,236 75' stroke='currentColor' fill='none' />
          <path id='arc' d='M150 60 A30 30 0 0 1 210 60' fill='none' />
          <text className='fill-[#888] text-[10px]'>
            <textPath href='#arc' startOffset='8'>智能路由</textPath>
          </text>
        </svg>
        {props.vendors.slice(0, 3).map((vendor, index) => (
          <span
            key={vendor}
            className='absolute left-0 w-[92px] truncate rounded-[6px] border border-[#e5e7eb] bg-white px-1.5 py-0.5 text-center text-[10px]'
            style={{ top: 26 + index * 39 }}
          >
            {vendor}
          </span>
        ))}
        <span className='absolute top-[55px] left-[160px] flex size-10 items-center justify-center rounded-full border border-[#e5e7eb] bg-white'>
          <ProviderIcon name={props.icons[1] ?? props.icons[0]} size={18} />
        </span>
        <span className='absolute top-[60px] left-[236px] flex size-[30px] items-center justify-center rounded-full border border-[#e5e7eb] bg-white'>
          <Users className='size-3.5' />
        </span>
        {[25, 95].map((top) => (
          <span key={top} className='absolute left-[270px] flex size-[30px] items-center justify-center rounded-full border border-[#e5e7eb] bg-white' style={{ top }}>
            <User className='size-3' />
          </span>
        ))}
      </div>
    </div>
  )
}

/** Three 371×223 cards, 32px apart, overlapping the dotted map. */
export function HubCards(props: { icons: string[]; vendors: string[]; baseUrl: string; model: string }) {
  return (
    <div className='mx-auto grid max-w-[1177px] gap-8 px-6 md:grid-cols-3 xl:px-0'>
      <CapabilityCard icons={props.icons} />
      <ApiCard baseUrl={props.baseUrl} model={props.model} />
      <RoutingCard icons={props.icons} vendors={props.vendors} />
    </div>
  )
}
