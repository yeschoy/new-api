import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

// Key conflicts introduced independently on both branches. The local wording
// is retained for established fork UI (console operator, client and usage).
const newKeys = {
  en: {},
  zh: { 'All models': '全部模型', 'Cumulative usage': '累计消耗', Operator: '运营后台' },
  'zh-TW': { 'All models': '全部模型', 'Cumulative usage': '累計消耗', Operator: '營運後台', Client: '客戶端' },
  fr: { 'Cumulative usage': 'Consommation cumulée', Operator: 'Exploitation' },
  ja: { 'Cumulative usage': '累計使用量', Later: 'あとで', Field: 'フィールド', Operator: '運用管理' },
  ru: { 'Cumulative usage': 'Суммарный расход', Operator: 'Администрирование' },
  vi: { 'Cumulative usage': 'Tổng mức sử dụng', Later: 'Sau', Operator: 'Vận hành', Client: 'Ứng dụng' },
}

function stage(locale, index) {
  const file = `web/src/i18n/locales/${locale}.json`
  return JSON.parse(execFileSync('git', ['show', `:${index}:${file}`], { encoding: 'utf8' }))
}

async function main() {
  let totalAdded = 0
  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const base = stage(locale, 1)
    const ours = stage(locale, 2)
    const theirs = stage(locale, 3)
    const merged = { ...base.translation, ...theirs.translation, ...ours.translation }
    const conflicts = []
    for (const key of Object.keys(merged)) {
      if (key in ours.translation && key in theirs.translation && ours.translation[key] !== theirs.translation[key]) {
        const baseValue = base.translation[key]
        const ourValue = ours.translation[key]
        const theirValue = theirs.translation[key]
        if (ourValue === baseValue) merged[key] = theirValue
        else if (theirValue === baseValue) merged[key] = ourValue
        else {
          conflicts.push(key)
          if (!(key in trans)) throw new Error(`Unresolved ${locale} key: ${key}`)
          merged[key] = trans[key]
        }
      }
    }
    for (const [key, value] of Object.entries(trans)) {
      if (!conflicts.includes(key)) throw new Error(`Stale explicit ${locale} decision: ${key}`)
      merged[key] = value
    }
    const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)))
    await fs.writeFile(filePath, stableStringify({ ...ours, translation: sorted }), 'utf8')
    const count = Object.keys(sorted).length - Object.keys(ours.translation).length
    console.log(`${locale}: ${count} translations added; ${conflicts.length} divergent translations reviewed`)
    totalAdded += count
  }
  console.log(`\nTotal: ${totalAdded} translations added`)
}

main().catch((err) => { console.error(err); process.exitCode = 1 })
