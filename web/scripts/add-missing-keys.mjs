import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const newKeys = {
  en: {
    'Thinking level': 'Thinking level',
    Minimal: 'Minimal',
    Low: 'Low',
    High: 'High',
    'Extra high': 'Extra high',
    Maximum: 'Maximum',
    'Models in {{group}}': 'Models in {{group}}',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.',
    'Click to join': 'Click to join',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      'Per-user plan limit. 0 disables the plan limit; system limits still apply.',
    'Invalid redemption entitlement': 'Invalid redemption entitlement',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}',
  },
  zh: {
    'Thinking level': '思考等级',
    Minimal: '极低',
    Low: '低',
    High: '高',
    'Extra high': '极高',
    Maximum: '最高',
    'Models in {{group}}': '{{group}} 分组的模型',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      '应用于所有选中的模型。“默认”沿用模型或渠道设置，模型名称中的修饰参数优先。可用等级取决于模型。',
    'Click to join': '点击加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      '每位用户的套餐限速。0 表示不启用套餐限速，系统限速仍然生效。',
    'Invalid redemption entitlement': '无效的兑换码权益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已通过兑换码开通订阅套餐 {{plan}}，兑换码 ID {{id}}',
  },
  'zh-TW': {
    'Thinking level': '思考等級',
    Minimal: '極低',
    Low: '低',
    High: '高',
    'Extra high': '極高',
    Maximum: '最高',
    'Models in {{group}}': '{{group}} 群組的模型',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      '套用至所有選取的模型。「預設」沿用模型或渠道設定，模型名稱中的修飾參數優先。可用等級取決於模型。',
    'Click to join': '點擊加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      '每位使用者的方案速率限制。0 表示不啟用方案限制，系統限制仍然生效。',
    'Invalid redemption entitlement': '無效的兌換碼權益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已使用兌換碼開通訂閱方案 {{plan}}，兌換碼 ID {{id}}',
  },
  fr: {
    'Thinking level': 'Niveau de réflexion',
    Minimal: 'Minimal',
    Low: 'Faible',
    High: 'Élevé',
    'Extra high': 'Très élevé',
    Maximum: 'Maximum',
    'Models in {{group}}': 'Modèles du groupe {{group}}',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      'S’applique à tous les modèles sélectionnés. Par défaut, les réglages du modèle ou du canal sont conservés ; les modificateurs du nom du modèle sont prioritaires. Les niveaux disponibles dépendent du modèle.',
    'Click to join': 'Cliquez pour rejoindre',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      'Limite du forfait par utilisateur. 0 désactive cette limite ; les limites système restent applicables.',
    'Invalid redemption entitlement':
      "Droit associé au code d'échange invalide",
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      "Abonnement {{plan}} activé avec un code d'échange (ID du code : {{id}})",
  },
  ja: {
    'Thinking level': '思考レベル',
    Minimal: '最小',
    Low: '低',
    High: '高',
    'Extra high': '非常に高い',
    Maximum: '最大',
    'Models in {{group}}': '{{group}} グループのモデル',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      '選択したすべてのモデルに適用されます。デフォルトではモデルまたはチャネルの設定を維持し、モデル名の修飾パラメーターが優先されます。利用可能なレベルはモデルによって異なります。',
    'Click to join': 'クリックして参加',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      'ユーザーごとのプラン制限です。0 でプラン制限を無効にしても、システム制限は適用されます。',
    'Invalid redemption entitlement': '引き換えコードの特典が無効です',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '引き換えコードでサブスクリプションプラン {{plan}} を有効化（コード ID: {{id}}）',
  },
  ru: {
    'Thinking level': 'Уровень размышления',
    Minimal: 'Минимальный',
    Low: 'Низкий',
    High: 'Высокий',
    'Extra high': 'Очень высокий',
    Maximum: 'Максимальный',
    'Models in {{group}}': 'Модели группы {{group}}',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      'Применяется ко всем выбранным моделям. По умолчанию сохраняются настройки модели или канала; модификаторы в имени модели имеют приоритет. Доступные уровни зависят от модели.',
    'Click to join': 'Нажмите, чтобы вступить',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      'Лимит плана на пользователя. 0 отключает лимит плана; системные ограничения сохраняются.',
    'Invalid redemption entitlement': 'Недопустимый тип вознаграждения по коду',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'План подписки {{plan}} активирован кодом погашения (ID кода: {{id}})',
  },
  vi: {
    'Thinking level': 'Mức độ suy nghĩ',
    Minimal: 'Tối thiểu',
    Low: 'Thấp',
    High: 'Cao',
    'Extra high': 'Rất cao',
    Maximum: 'Tối đa',
    'Models in {{group}}': 'Mô hình trong nhóm {{group}}',
    'Applies to all selected models. Default keeps model/channel settings; model modifiers take precedence. Supported levels depend on the model.':
      'Áp dụng cho tất cả mô hình đã chọn. Mặc định giữ cài đặt của mô hình hoặc kênh; tham số bổ sung trong tên mô hình được ưu tiên. Các mức khả dụng tùy thuộc vào mô hình.',
    'Click to join': 'Nhấn để tham gia',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.':
      'Giới hạn gói cho mỗi người dùng. 0 tắt giới hạn gói; giới hạn hệ thống vẫn áp dụng.',
    'Invalid redemption entitlement': 'Quyền lợi của mã đổi không hợp lệ',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'Đã kích hoạt gói đăng ký {{plan}} bằng mã đổi (ID mã: {{id}})',
  },
}

async function main() {
  if (process.argv.includes('--merge-git-index')) {
    for (const locale of Object.keys(newKeys)) {
      const relativePath = `web/src/i18n/locales/${locale}.json`
      const [base, ours, theirs] = [1, 2, 3].map((stage) =>
        JSON.parse(
          execFileSync('git', ['show', `:${stage}:${relativePath}`], {
            encoding: 'utf8',
          })
        )
      )
      const translation = {}
      for (const key of new Set([
        ...Object.keys(base.translation),
        ...Object.keys(ours.translation),
        ...Object.keys(theirs.translation),
      ])) {
        const original = base.translation[key]
        const local = ours.translation[key]
        const remote = theirs.translation[key]
        let value
        if (local === remote || remote === original) value = local
        else if (local === original) value = remote
        else throw new Error(`Conflicting translation: ${locale}: ${key}`)
        if (value !== undefined) translation[key] = value
      }
      ours.translation = Object.fromEntries(
        Object.entries(translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(
        path.join(LOCALES_DIR, `${locale}.json`),
        stableStringify(ours),
        'utf8'
      )
      console.log(
        `${locale}: merged ${Object.keys(translation).length} translations`
      )
    }
    return
  }
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.hasOwn(json.translation, key)) {
        json.translation[key] = value
        count++
      } else if (json.translation[key] !== value) {
        json.translation[key] = value
        count++
      }
    }

    if (count > 0) {
      json.translation = Object.fromEntries(
        Object.entries(json.translation).sort(([a], [b]) => a.localeCompare(b))
      )
      await fs.writeFile(filePath, stableStringify(json), 'utf8')
    }

    console.log(`${locale}: ${count} translations applied`)
    totalAdded += count
  }

  console.log(`\nTotal: ${totalAdded} translations applied`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
