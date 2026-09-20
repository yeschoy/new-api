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
import { describe, expect, it } from 'vitest'

import { parseHandbook } from '../lib/handbook'

const sample = `# 指南标题

> 更新时间

## ⚡ 先看这一分钟版本

三样东西就够。

# 💬 一、聊天与办公软件

## 1\\. Cherry Studio（新手首选！）✅ 直接支持

界面清爽，是最佳选择。

**配置步骤**

1. 打开设置。

## 2\\. Windsurf ❌ 不建议 / 不能直连

不建议。

# 八、报错别慌

|报错|处理|
|---|---|
|401|重试|

## 通用排查

先 curl。
`

describe('parseHandbook', () => {
  it('splits tool chapters into categories with status and summary', () => {
    const parsed = parseHandbook(sample)

    expect(parsed.title).toBe('指南标题')
    expect(parsed.intro).toContain('先看这一分钟版本')
    expect(parsed.categories).toHaveLength(1)
    expect(parsed.categories[0].title).toBe('聊天与办公软件')
    expect(parsed.categories[0].tools.map((tool) => tool.name)).toEqual([
      'Cherry Studio（新手首选！）',
      'Windsurf',
    ])
    expect(parsed.categories[0].tools[0].status).toBe('supported')
    expect(parsed.categories[0].tools[0].summary).toBe(
      '界面清爽，是最佳选择。'
    )
    expect(parsed.categories[0].tools[1].status).toBe('unsupported')
  })

  it('keeps non-tool chapters as general Markdown with their subsections', () => {
    const parsed = parseHandbook(sample)

    expect(parsed.chapters.map((chapter) => chapter.title)).toEqual([
      '报错别慌',
    ])
    expect(parsed.chapters[0].body).toContain('|401|重试|')
    expect(parsed.chapters[0].body).toContain('## 通用排查')
  })
})
