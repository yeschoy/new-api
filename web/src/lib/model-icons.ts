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

// Icons (@lobehub/icons names) for models whose vendor has none set in the admin.
const FAMILIES: Array<[RegExp, string]> = [
  [/^(gpt|o\d|codex|chatgpt)/, 'OpenAI'],
  [/^claude/, 'Claude.Color'],
  [/^(gemini|gemma)/, 'Gemini.Color'],
  [/^deepseek/, 'DeepSeek.Color'],
  [/^(qwen|qwq|qvq)/, 'Qwen.Color'],
  [/^(glm|chatglm)/, 'Zhipu.Color'],
  [/^grok/, 'Grok'],
  [/^kimi/, 'Kimi.Color'],
  [/^(minimax|abab)/, 'Minimax.Color'],
  [/^mimo/, 'XiaomiMiMo'],
  [/^(seed|doubao)/, 'Doubao.Color'],
  [/^(hy\d|hunyuan)/, 'Hunyuan.Color'],
  [/^llama/, 'Meta.Color'],
  [/^(mistral|codestral|magistral|ministral)/, 'Mistral.Color'],
  [/^ernie/, 'Wenxin.Color'],
]

const VENDORS: Record<string, string> = {
  xai: 'Grok',
  xiaomi: 'XiaomiMiMo',
  moonshot: 'Kimi.Color',
  'moonshot ai': 'Kimi.Color',
  tencent: 'Hunyuan.Color',
  bytedance: 'Doubao.Color',
}

/** The model family's icon from its name, else its vendor's; undefined leaves the letter fallback. */
export function guessIcon(modelName: string, vendor?: string): string | undefined {
  const name = modelName.toLowerCase()
  const family = FAMILIES.find(([pattern]) => pattern.test(name))
  if (family) return family[1]
  return vendor ? VENDORS[vendor.toLowerCase()] : undefined
}
