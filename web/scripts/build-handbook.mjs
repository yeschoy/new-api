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
// Regenerates src/features/guide/content/handbook.zh.ts from handbook.zh.md.
// Run `bun run handbook` after editing the Markdown.
import fs from 'node:fs'
import path from 'node:path'

const dir = path.resolve('src/features/guide/content')
const source = fs.readFileSync(path.join(dir, 'handbook.zh.md'), 'utf8')
const license = fs
  .readFileSync(path.resolve('src/features/guide/lib/handbook.ts'), 'utf8')
  .split('*/')[0]
const output = `${license}*/\n// Generated from handbook.zh.md by scripts/build-handbook.mjs. Do not edit by hand.\nconst handbookSource: string = ${JSON.stringify(source)}\n\nexport default handbookSource\n`
fs.writeFileSync(path.join(dir, 'handbook.zh.ts'), output)
console.log('handbook.zh.ts regenerated')
