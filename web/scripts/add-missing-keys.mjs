import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Double 11 top-up special': 'Double 11 top-up special',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': 'Every CNY 100 topped up earns {{reward}} in bonus credit',
    'Complete hundreds per order only; remainders do not carry over.': 'Complete hundreds per order only; remainders do not carry over.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': 'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.',
    'Check your wallet for current rewards.': 'Check your wallet for current rewards.',
    'Offer details will appear when the campaign starts.': 'Offer details will appear when the campaign starts.',
    'Click to join': 'Click to join',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Per-user plan limit. 0 disables the plan limit; system limits still apply.',
    'Invalid redemption entitlement': 'Invalid redemption entitlement',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}',
  },
  zh: {
    'Double 11 top-up special': '双11充值特惠',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': '充值每满 100 元，赠 {{reward}} 使用额度',
    'Complete hundreds per order only; remainders do not carry over.': '单笔订单按完整的 100 元计算，零头不累计。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': '赠送额度不可提现，参与条件与次数限制以钱包页面为准。',
    'Check your wallet for current rewards.': '前往钱包查看当前充值赠送规则。',
    'Offer details will appear when the campaign starts.': '活动开始后展示具体赠送规则。',
    'Click to join': '点击加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': '每位用户的套餐限速。0 表示不启用套餐限速，系统限速仍然生效。',
    'Invalid redemption entitlement': '无效的兑换码权益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已通过兑换码开通订阅套餐 {{plan}}，兑换码 ID {{id}}',
  },
  'zh-TW': {
    'Double 11 top-up special': '雙11儲值優惠',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': '儲值每滿人民幣 100 元，贈 {{reward}} 使用額度',
    'Complete hundreds per order only; remainders do not carry over.': '每筆訂單以完整的人民幣 100 元計算，餘額不累計。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': '贈送額度不可提領，參加條件與次數限制以錢包頁面為準。',
    'Check your wallet for current rewards.': '前往錢包查看目前的儲值贈送規則。',
    'Offer details will appear when the campaign starts.': '活動開始後將顯示詳細贈送規則。',
    'Click to join': '點擊加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': '每位使用者的方案速率限制。0 表示不啟用方案限制，系統限制仍然生效。',
    'Invalid redemption entitlement': '無效的兌換碼權益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已使用兌換碼開通訂閱方案 {{plan}}，兌換碼 ID {{id}}',
  },
  fr: {
    'Double 11 top-up special': 'Offre de recharge du 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': 'Pour 100 CNY rechargés, recevez {{reward}} de crédit bonus',
    'Complete hundreds per order only; remainders do not carry over.': 'Par tranches entières de 100 CNY par commande ; le reste ne se cumule pas.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': 'Crédit bonus non retirable. Conditions et limites dans votre portefeuille.',
    'Check your wallet for current rewards.': 'Consultez votre portefeuille pour les bonus en cours.',
    'Offer details will appear when the campaign starts.': 'Les détails seront affichés au début de la campagne.',
    'Click to join': 'Cliquez pour rejoindre',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Limite du forfait par utilisateur. 0 désactive cette limite ; les limites système restent applicables.',
    'Invalid redemption entitlement':
      "Droit associé au code d'échange invalide",
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      "Abonnement {{plan}} activé avec un code d'échange (ID du code : {{id}})",
  },
  ja: {
    'Double 11 top-up special': '11.11チャージ特典',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': '100人民元のチャージごとに{{reward}}の利用クレジットを進呈',
    'Complete hundreds per order only; remainders do not carry over.': '1注文につき100人民元単位で計算し、端数は繰り越しません。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': '特典クレジットは出金できません。対象条件と回数制限はウォレットをご確認ください。',
    'Check your wallet for current rewards.': '現在の特典はウォレットでご確認ください。',
    'Offer details will appear when the campaign starts.': 'キャンペーン開始後に特典の詳細を表示します。',
    'Click to join': 'クリックして参加',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'ユーザーごとのプラン制限です。0 でプラン制限を無効にしても、システム制限は適用されます。',
    'Invalid redemption entitlement': '引き換えコードの特典が無効です',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '引き換えコードでサブスクリプションプラン {{plan}} を有効化（コード ID: {{id}}）',
  },
  ru: {
    'Double 11 top-up special': 'Бонус за пополнение к 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': 'За каждые 100 CNY пополнения — {{reward}} бонусного кредита',
    'Complete hundreds per order only; remainders do not carry over.': 'Учитываются полные 100 CNY в одном заказе; остаток не переносится.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': 'Бонусный кредит нельзя вывести. Условия и лимиты указаны в кошельке.',
    'Check your wallet for current rewards.': 'Текущие бонусы за пополнение смотрите в кошельке.',
    'Offer details will appear when the campaign starts.': 'Подробные условия появятся после начала акции.',
    'Click to join': 'Нажмите, чтобы вступить',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Лимит плана на пользователя. 0 отключает лимит плана; системные ограничения сохраняются.',
    'Invalid redemption entitlement': 'Недопустимый тип вознаграждения по коду',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'План подписки {{plan}} активирован кодом погашения (ID кода: {{id}})',
  },
  vi: {
    'Double 11 top-up special': 'Ưu đãi nạp tiền 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit': 'Nạp mỗi 100 CNY, nhận {{reward}} tín dụng thưởng',
    'Complete hundreds per order only; remainders do not carry over.': 'Tính theo từng 100 CNY trọn vẹn trong mỗi đơn; phần lẻ không cộng dồn.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.': 'Tín dụng thưởng không thể rút. Xem điều kiện và giới hạn trong ví.',
    'Check your wallet for current rewards.': 'Xem ưu đãi nạp tiền hiện tại trong ví.',
    'Offer details will appear when the campaign starts.': 'Chi tiết ưu đãi sẽ hiển thị khi chương trình bắt đầu.',
    'Click to join': 'Nhấn để tham gia',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Giới hạn gói cho mỗi người dùng. 0 tắt giới hạn gói; giới hạn hệ thống vẫn áp dụng.',
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
        JSON.parse(execFileSync('git', ['show', `:${stage}:${relativePath}`], { encoding: 'utf8' }))
      )
      const translation = {}
      for (const key of new Set([...Object.keys(base.translation), ...Object.keys(ours.translation), ...Object.keys(theirs.translation)])) {
        const original = base.translation[key]
        const local = ours.translation[key]
        const remote = theirs.translation[key]
        let value
        if (local === remote || remote === original) value = local
        else if (local === original) value = remote
        else throw new Error(`Conflicting translation: ${locale}: ${key}`)
        if (value !== undefined) translation[key] = value
      }
      ours.translation = Object.fromEntries(Object.entries(translation).sort(([a], [b]) => a.localeCompare(b)))
      await fs.writeFile(path.join(LOCALES_DIR, `${locale}.json`), stableStringify(ours), 'utf8')
      console.log(`${locale}: merged ${Object.keys(translation).length} translations`)
    }
    return
  }
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (!Object.prototype.hasOwnProperty.call(json.translation, key)) {
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
