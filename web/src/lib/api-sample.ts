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
export type SampleLanguage = 'curl' | 'python' | 'typescript'

/** Ready-to-run request snippets against this gateway's OpenAI endpoint. */
export function apiSample(lang: SampleLanguage, baseUrl: string, model: string): string {
  if (lang === 'python') {
    return [
      'from openai import OpenAI',
      '',
      'client = OpenAI(',
      `    base_url="${baseUrl}/v1",`,
      '    api_key="<API_KEY>",',
      ')',
      '',
      'completion = client.chat.completions.create(',
      `    model="${model}",`,
      '    messages=[{"role": "user", "content": "你好"}],',
      ')',
      'print(completion.choices[0].message.content)',
    ].join('\n')
  }
  if (lang === 'typescript') {
    return [
      "import OpenAI from 'openai'",
      '',
      'const client = new OpenAI({',
      `  baseURL: '${baseUrl}/v1',`,
      "  apiKey: '<API_KEY>',",
      '})',
      '',
      'const completion = await client.chat.completions.create({',
      `  model: '${model}',`,
      "  messages: [{ role: 'user', content: '你好' }],",
      '})',
      'console.log(completion.choices[0].message.content)',
    ].join('\n')
  }
  return [
    `curl ${baseUrl}/v1/chat/completions \\`,
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer <API_KEY>" \\',
    "  -d '{",
    `    "model": "${model}",`,
    '    "messages": [{"role": "user", "content": "你好"}]',
    "  }'",
  ].join('\n')
}
