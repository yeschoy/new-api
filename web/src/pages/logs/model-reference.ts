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

// Model families whose official prices this site compares against, with the
// currency those prices are quoted in (domestic families in CNY, overseas in
// USD). Recognising a family is not a verification of the provider's prices.
const FAMILIES: Array<{ currency: 'CNY' | 'USD'; keywords: string[]; pattern?: RegExp }> = [
  {
    currency: 'USD',
    keywords: ['gpt-', 'chatgpt-', 'text-embedding-', 'omni-moderation', 'dall-e', 'whisper', 'tts-'],
    pattern: /\bo[134](?:-|$)/,
  },
  { currency: 'USD', keywords: ['claude-', 'anthropic'] },
  { currency: 'USD', keywords: ['gemini-', 'learnlm-'] },
  { currency: 'USD', keywords: ['grok-', 'xai-'] },
  { currency: 'CNY', keywords: ['deepseek-'] },
  { currency: 'CNY', keywords: ['qwen', 'qwq-'] },
  { currency: 'CNY', keywords: ['doubao-', 'volcengine'] },
  { currency: 'CNY', keywords: ['moonshot-', 'kimi-'] },
  { currency: 'CNY', keywords: ['minimax', 'abab'] },
  { currency: 'CNY', keywords: ['glm-', 'chatglm', 'cogview', 'cogvideo'] },
  { currency: 'CNY', keywords: ['mimo-'] },
  { currency: 'CNY', keywords: ['ernie'] },
  { currency: 'CNY', keywords: ['spark'] },
  { currency: 'CNY', keywords: ['hunyuan'] },
  { currency: 'CNY', keywords: ['baichuan'] },
  { currency: 'CNY', keywords: ['internlm'] },
  { currency: 'CNY', keywords: ['step-'] },
  { currency: 'CNY', keywords: ['yi-'] },
  { currency: 'USD', keywords: ['mistral-', 'mixtral-'] },
  { currency: 'USD', keywords: ['llama-', 'meta-'] },
  { currency: 'USD', keywords: ['command-', 'cohere-'] },
]

/** The currency a model family's official price is quoted in, if the family is known. */
export function referenceCurrency(modelName: string): 'CNY' | 'USD' | undefined {
  const name = modelName.toLowerCase()
  const family = FAMILIES.find(
    (item) => item.keywords.some((keyword) => name.includes(keyword)) || (item.pattern?.test(name) ?? false)
  )
  return family?.currency
}
