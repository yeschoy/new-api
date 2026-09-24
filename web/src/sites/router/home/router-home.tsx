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
import { useMemo } from 'react'

import { useCatalog, useRankings } from '@/lib/queries'

import { RouterShell } from '../router-shell'
import { RouterFeatures } from './router-features'
import { RouterHero, heroStats } from './router-hero'
import { FeaturedApps, FeaturedModels, RecentModels } from './router-sections'
import { RouterSteps } from './router-steps'
import { WorldMap } from './world-map'

const FALLBACK_ICONS = [
  'OpenAI', 'Claude.Color', 'Gemini.Color', 'DeepSeek.Color', 'Qwen.Color', 'Kimi.Color',
  'Zhipu.Color', 'Grok', 'Doubao.Color', 'Mistral.Color', 'Meta.Color', 'Minimax.Color',
  'Hunyuan.Color', 'Cohere.Color', 'Perplexity.Color', 'Nvidia.Color', 'Baichuan.Color', 'Spark.Color',
  'Yi.Color', 'Stepfun.Color', 'Wenxin.Color', 'Ollama', 'HuggingFace.Color', 'Together.Color',
]

export function RouterHome() {
  const { models } = useCatalog()
  const rankings = useRankings('week')
  const ranked = rankings.data?.models ?? []

  const vendorCount = useMemo(() => new Set(models.map((m) => m.vendor)).size, [models])

  const icons = useMemo(() => {
    const fromCatalog = [...new Set(models.map((m) => m.vendorIcon).filter(Boolean))] as string[]
    return [...fromCatalog, ...FALLBACK_ICONS.filter((i) => !fromCatalog.includes(i))]
  }, [models])

  const stats = useMemo(
    () =>
      heroStats({
        weeklyTokens: ranked.reduce((sum, row) => sum + row.total_tokens, 0),
        modelCount: models.length,
        vendorCount,
      }),
    [models.length, ranked, vendorCount]
  )

  const slug = ranked[0]
    ? `${ranked[0].vendor.toLowerCase()}/${ranked[0].model_name}`
    : 'openai/gpt-4o-mini'

  return (
    <RouterShell>
      <div className='relative overflow-x-clip'>
        <WorldMap className='pointer-events-none absolute inset-x-0 top-4 mx-auto h-[640px] w-full max-w-[1440px] [mask-image:radial-gradient(ellipse_72%_62%_at_50%_42%,black_40%,transparent_86%)]' />
        <div className='relative'>
          <RouterHero stats={stats} />
        </div>
      </div>
      {/* Positioned so the cards paint above the map's lower fade. */}
      <div className='relative'>
        <RouterFeatures icons={icons} slug={slug} />
        <FeaturedModels
          rows={ranked}
          catalog={models}
          modelCount={models.length}
          vendorCount={vendorCount}
        />
        <FeaturedApps />
        <RouterSteps />
        <RecentModels models={models} />
        <div className='h-32' />
      </div>
    </RouterShell>
  )
}
