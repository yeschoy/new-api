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
import { Button as ButtonPrimitive } from '@base-ui/react/button'
import type { LucideIcon } from 'lucide-react'
import { isValidElement, type HTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Editorial building blocks shared by the console dashboards.
 *
 * `tone` is retained as a data attribute for tests and future theming, but
 * the visual system no longer colours panels by tone: every panel is paper
 * with a hairline rule, and the accent appears only on actions and numbers.
 */
export type YecaiTone = 'leaf' | 'model' | 'money' | 'signal' | 'neutral'

type YecaiPanelElement = 'article' | 'aside' | 'div' | 'li' | 'section'

interface YecaiPanelProps extends HTMLAttributes<HTMLElement> {
  as?: YecaiPanelElement
  layer?: 'base' | 'raised' | 'hero'
  tone?: YecaiTone
}

export function YecaiPanel(props: YecaiPanelProps) {
  const {
    as: Element = 'div',
    className,
    layer = 'base',
    tone = 'neutral',
    ...panelProps
  } = props

  return (
    <Element
      {...panelProps}
      className={cn('ed-paper', layer === 'hero' && 'ed-paper--tint', className)}
      data-layer={layer}
      data-tone={tone}
    />
  )
}

interface YecaiBentoGridProps extends HTMLAttributes<HTMLDivElement> {
  density?: 'airy' | 'compact'
}

export function YecaiBentoGrid(props: YecaiBentoGridProps) {
  const { className, density = 'airy', ...gridProps } = props

  return (
    <div
      {...gridProps}
      className={cn('ed-bento', className)}
      data-density={density}
    />
  )
}

interface YecaiBentoItemProps extends HTMLAttributes<HTMLElement> {
  as?: Exclude<YecaiPanelElement, 'li'>
  tone?: YecaiTone
}

export function YecaiBentoItem(props: YecaiBentoItemProps) {
  const {
    as: Element = 'article',
    className,
    tone = 'neutral',
    ...itemProps
  } = props

  return <Element {...itemProps} className={className} data-tone={tone} />
}

export type YecaiActionProps = ButtonPrimitive.Props & {
  appearance?: 'solid' | 'soft' | 'outline'
  size?: 'sm' | 'md' | 'lg' | 'tile'
  tone?: YecaiTone
}

function isNativeButtonRender(render: ButtonPrimitive.Props['render']) {
  if (!render || !isValidElement(render)) return true
  return render.type === 'button'
}

const ACTION_APPEARANCE: Record<
  NonNullable<YecaiActionProps['appearance']>,
  string
> = {
  solid: 'ed-btn--accent',
  soft: 'ed-btn--outline',
  outline: 'ed-btn--ghost',
}

const ACTION_SIZE: Record<NonNullable<YecaiActionProps['size']>, string> = {
  sm: 'ed-btn--xs',
  md: 'ed-btn--sm',
  lg: 'ed-btn--lg',
  tile: '',
}

export function YecaiAction(props: YecaiActionProps) {
  const {
    appearance = 'solid',
    className,
    nativeButton,
    render,
    size = 'md',
    tone = 'leaf',
    ...buttonProps
  } = props

  return (
    <ButtonPrimitive
      {...buttonProps}
      className={cn(
        'ed-btn',
        ACTION_APPEARANCE[appearance],
        ACTION_SIZE[size],
        className
      )}
      data-appearance={appearance}
      data-slot='yecai-action'
      data-tone={tone}
      data-yecai-size={size}
      nativeButton={nativeButton ?? isNativeButtonRender(render)}
      render={render}
    />
  )
}

interface YecaiMetricProps extends HTMLAttributes<HTMLDivElement> {
  detail?: ReactNode
  icon: LucideIcon
  label: ReactNode
  tone?: YecaiTone
  value: ReactNode
}

export function YecaiMetric(props: YecaiMetricProps) {
  const {
    className,
    detail,
    icon: Icon,
    label,
    tone = 'neutral',
    value,
    ...metricProps
  } = props

  return (
    <div
      {...metricProps}
      className={cn('ed-metric', className)}
      data-tone={tone}
    >
      <span className='ed-metricIcon' aria-hidden='true'>
        <Icon />
      </span>
      <span className='ed-metricCopy'>
        <span className='ed-metricLabel'>{label}</span>
        <strong className='ed-metricValue'>{value}</strong>
        {detail ? <small className='ed-metricDetail'>{detail}</small> : null}
      </span>
    </div>
  )
}

interface YecaiPriceFlowProps extends HTMLAttributes<HTMLElement> {
  accessibleLabel: string
  officialLabel: ReactNode
  officialValue: ReactNode
  savingsLabel?: ReactNode
  savingsValue?: ReactNode
  siteLabel: ReactNode
  siteValue: ReactNode
  size?: 'compact' | 'hero'
}

/** Receipt-style comparison of the base price against the site price. */
export function YecaiPriceFlow(props: YecaiPriceFlowProps) {
  const {
    accessibleLabel,
    className,
    officialLabel,
    officialValue,
    savingsLabel,
    savingsValue,
    siteLabel,
    siteValue,
    size = 'compact',
    ...flowProps
  } = props

  return (
    <figure
      {...flowProps}
      aria-label={accessibleLabel}
      className={cn('m-0', className)}
      data-size={size}
    >
      <dl className='ed-receiptRows'>
        <div>
          <dt>{officialLabel}</dt>
          <dd className='is-base'>{officialValue}</dd>
        </div>
        <div>
          <dt>{siteLabel}</dt>
          <dd>{siteValue}</dd>
        </div>
      </dl>
      {savingsValue ? (
        <figcaption className='ed-savings mt-3 flex items-center justify-between gap-3 text-sm'>
          <span>{savingsLabel}</span>
          <strong className='ed-num text-lg'>{savingsValue}</strong>
        </figcaption>
      ) : null}
    </figure>
  )
}
