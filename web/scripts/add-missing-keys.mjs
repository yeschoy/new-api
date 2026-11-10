import fs from 'node:fs/promises'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return JSON.stringify(obj, null, 2) + '\n'
}

const newKeys = {
  en: {
    'Checkout access has expired': 'Checkout access has expired',
    'Subscription checkout': 'Subscription checkout',
    'Checkout access expires': 'Checkout access expires',
    'Payment received': 'Payment received',
    'Subscription delivered. You can return to the merchant.': 'Subscription delivered. You can return to the merchant.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': 'Delivery is pending. Do not pay again; delivery continues even if you close this page.',
    'This payment is no longer available. Return to the merchant to check your order.': 'This payment is no longer available. Return to the merchant to check your order.',
    'Awaiting payment confirmation': 'Awaiting payment confirmation',
    'Payment QR code': 'Payment QR code',
    'Open secure payment page': 'Open secure payment page',
    'Payment details are not ready. Return to the merchant if this persists.': 'Payment details are not ready. Return to the merchant if this persists.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': 'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.',
    'Checkout access is missing, invalid or expired': 'Checkout access is missing, invalid or expired',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': 'Return to the merchant to check this order. Do not pay again if you have already paid.',
    'Only verified payment activates your subscription. This page cannot confirm payment.': 'Only verified payment activates your subscription. This page cannot confirm payment.',
    'Click to join': 'Click to join',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Per-user plan limit. 0 disables the plan limit; system limits still apply.',
    'Invalid redemption entitlement': 'Invalid redemption entitlement',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}',
  },
  zh: {
    'Checkout access has expired': '收银台访问已过期',
    'Subscription checkout': '订阅收银台',
    'Checkout access expires': '收银台访问到期时间',
    'Payment received': '已确认收款',
    'Subscription delivered. You can return to the merchant.': '订阅已开通，您可以返回商户。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': '正在开通订阅，请勿重复付款。关闭页面后仍会继续处理。',
    'This payment is no longer available. Return to the merchant to check your order.': '当前支付已不可用，请返回商户查看订单。',
    'Awaiting payment confirmation': '等待支付确认',
    'Payment QR code': '付款二维码',
    'Open secure payment page': '打开安全支付页面',
    'Payment details are not ready. Return to the merchant if this persists.': '支付信息尚未就绪。如持续出现，请返回商户处理。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': '暂时无法刷新订单状态，这不代表支付失败。请重试查询或联系商户确认后再付款。',
    'Checkout access is missing, invalid or expired': '收银台访问凭证缺失、无效或已过期',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': '请返回商户查看此订单。如已付款，请勿重复支付。',
    'Only verified payment activates your subscription. This page cannot confirm payment.': '仅经核实的付款会开通订阅，本页面无法确认收款。',
    'Click to join': '点击加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': '每位用户的套餐限速。0 表示不启用套餐限速，系统限速仍然生效。',
    'Invalid redemption entitlement': '无效的兑换码权益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已通过兑换码开通订阅套餐 {{plan}}，兑换码 ID {{id}}',
  },
  'zh-TW': {
    'Checkout access has expired': '收銀台存取已過期',
    'Subscription checkout': '訂閱收銀台',
    'Checkout access expires': '收銀台存取到期時間',
    'Payment received': '已確認收款',
    'Subscription delivered. You can return to the merchant.': '訂閱已開通，您可以返回商戶。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': '正在開通訂閱，請勿重複付款。關閉頁面後仍會繼續處理。',
    'This payment is no longer available. Return to the merchant to check your order.': '目前已無法支付，請返回商戶查看訂單。',
    'Awaiting payment confirmation': '等待付款確認',
    'Payment QR code': '付款 QR Code',
    'Open secure payment page': '開啟安全付款頁面',
    'Payment details are not ready. Return to the merchant if this persists.': '付款資訊尚未就緒。如持續出現，請返回商戶處理。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': '暫時無法更新訂單狀態，這不代表付款失敗。請重試查詢或聯絡商戶確認後再付款。',
    'Checkout access is missing, invalid or expired': '收銀台存取憑證遺失、無效或已過期',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': '請返回商戶查看此訂單。如已付款，請勿重複支付。',
    'Only verified payment activates your subscription. This page cannot confirm payment.': '僅經核實的付款會開通訂閱，本頁面無法確認收款。',
    'Click to join': '點擊加入',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': '每位使用者的方案速率限制。0 表示不啟用方案限制，系統限制仍然生效。',
    'Invalid redemption entitlement': '無效的兌換碼權益',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '已使用兌換碼開通訂閱方案 {{plan}}，兌換碼 ID {{id}}',
  },
  fr: {
    'Checkout access has expired': 'L’accès au paiement a expiré',
    'Subscription checkout': 'Paiement de l’abonnement',
    'Checkout access expires': 'Expiration de l’accès au paiement',
    'Payment received': 'Paiement reçu',
    'Subscription delivered. You can return to the merchant.': 'Abonnement activé. Vous pouvez retourner chez le marchand.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': 'Activation en cours. Ne payez pas à nouveau ; le traitement continue après la fermeture de cette page.',
    'This payment is no longer available. Return to the merchant to check your order.': 'Ce paiement n’est plus disponible. Consultez votre commande chez le marchand.',
    'Awaiting payment confirmation': 'En attente de confirmation du paiement',
    'Payment QR code': 'Code QR de paiement',
    'Open secure payment page': 'Ouvrir le paiement sécurisé',
    'Payment details are not ready. Return to the merchant if this persists.': 'Les informations de paiement ne sont pas prêtes. Si cela persiste, contactez le marchand.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': 'Impossible d’actualiser la commande. Cela ne signifie pas un échec du paiement. Réessayez ou vérifiez auprès du marchand avant de payer.',
    'Checkout access is missing, invalid or expired': 'Accès au paiement absent, invalide ou expiré',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': 'Consultez cette commande chez le marchand. Ne payez pas à nouveau si vous avez déjà payé.',
    'Only verified payment activates your subscription. This page cannot confirm payment.': 'Seul un paiement vérifié active l’abonnement. Cette page ne peut pas confirmer un paiement.',
    'Click to join': 'Cliquez pour rejoindre',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Limite du forfait par utilisateur. 0 désactive cette limite ; les limites système restent applicables.',
    'Invalid redemption entitlement':
      "Droit associé au code d'échange invalide",
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      "Abonnement {{plan}} activé avec un code d'échange (ID du code : {{id}})",
  },
  ja: {
    'Checkout access has expired': '支払いページのアクセス期限が切れました',
    'Subscription checkout': 'サブスクリプションのお支払い',
    'Checkout access expires': '支払いページのアクセス期限',
    'Payment received': '入金確認済み',
    'Subscription delivered. You can return to the merchant.': 'サブスクリプションが有効になりました。販売元にお戻りください。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': '有効化を処理中です。再度お支払いしないでください。このページを閉じても処理は続きます。',
    'This payment is no longer available. Return to the merchant to check your order.': 'このお支払いは利用できません。販売元で注文をご確認ください。',
    'Awaiting payment confirmation': '支払い確認待ち',
    'Payment QR code': '支払い用QRコード',
    'Open secure payment page': '安全な支払いページを開く',
    'Payment details are not ready. Return to the merchant if this persists.': '支払い情報は準備中です。解消しない場合は販売元にお問い合わせください。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': '注文状態を更新できません。支払い失敗を意味するものではありません。再照会するか、販売元に確認してからお支払いください。',
    'Checkout access is missing, invalid or expired': '支払いページのアクセス情報がないか、無効または期限切れです',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': '販売元でこの注文をご確認ください。お支払い済みの場合は再度お支払いしないでください。',
    'Only verified payment activates your subscription. This page cannot confirm payment.': '検証済みの入金のみがサブスクリプションを有効にします。このページでは入金を確定できません。',
    'Click to join': 'クリックして参加',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'ユーザーごとのプラン制限です。0 でプラン制限を無効にしても、システム制限は適用されます。',
    'Invalid redemption entitlement': '引き換えコードの特典が無効です',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      '引き換えコードでサブスクリプションプラン {{plan}} を有効化（コード ID: {{id}}）',
  },
  ru: {
    'Checkout access has expired': 'Срок доступа к оплате истёк',
    'Subscription checkout': 'Оплата подписки',
    'Checkout access expires': 'Срок доступа к оплате',
    'Payment received': 'Оплата получена',
    'Subscription delivered. You can return to the merchant.': 'Подписка активирована. Вы можете вернуться к продавцу.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': 'Активация ожидается. Не платите повторно: обработка продолжится и после закрытия страницы.',
    'This payment is no longer available. Return to the merchant to check your order.': 'Эта оплата больше недоступна. Проверьте заказ у продавца.',
    'Awaiting payment confirmation': 'Ожидание подтверждения оплаты',
    'Payment QR code': 'QR-код для оплаты',
    'Open secure payment page': 'Открыть защищённую страницу оплаты',
    'Payment details are not ready. Return to the merchant if this persists.': 'Данные для оплаты ещё не готовы. Если проблема сохраняется, обратитесь к продавцу.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': 'Не удалось обновить статус заказа. Это не означает сбой оплаты. Повторите проверку или уточните у продавца перед оплатой.',
    'Checkout access is missing, invalid or expired': 'Доступ к оплате отсутствует, недействителен или истёк',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': 'Проверьте этот заказ у продавца. Если вы уже заплатили, не платите повторно.',
    'Only verified payment activates your subscription. This page cannot confirm payment.': 'Подписку активирует только проверенная оплата. Эта страница не может подтвердить платёж.',
    'Click to join': 'Нажмите, чтобы вступить',
    'Per-user plan limit. 0 disables the plan limit; system limits still apply.': 'Лимит плана на пользователя. 0 отключает лимит плана; системные ограничения сохраняются.',
    'Invalid redemption entitlement': 'Недопустимый тип вознаграждения по коду',
    'Opened subscription plan {{plan}} with a redemption code, code ID {{id}}':
      'План подписки {{plan}} активирован кодом погашения (ID кода: {{id}})',
  },
  vi: {
    'Checkout access has expired': 'Quyền truy cập thanh toán đã hết hạn',
    'Subscription checkout': 'Thanh toán đăng ký',
    'Checkout access expires': 'Hạn truy cập trang thanh toán',
    'Payment received': 'Đã nhận thanh toán',
    'Subscription delivered. You can return to the merchant.': 'Đã kích hoạt đăng ký. Bạn có thể quay lại nhà bán hàng.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.': 'Đang chờ kích hoạt. Đừng thanh toán lại; quá trình xử lý vẫn tiếp tục khi bạn đóng trang.',
    'This payment is no longer available. Return to the merchant to check your order.': 'Thanh toán này không còn khả dụng. Hãy quay lại nhà bán hàng để kiểm tra đơn.',
    'Awaiting payment confirmation': 'Đang chờ xác nhận thanh toán',
    'Payment QR code': 'Mã QR thanh toán',
    'Open secure payment page': 'Mở trang thanh toán an toàn',
    'Payment details are not ready. Return to the merchant if this persists.': 'Thông tin thanh toán chưa sẵn sàng. Nếu vẫn tiếp diễn, hãy liên hệ nhà bán hàng.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.': 'Không thể cập nhật trạng thái đơn. Điều này không có nghĩa thanh toán thất bại. Hãy thử tra cứu lại hoặc hỏi nhà bán hàng trước khi trả tiền.',
    'Checkout access is missing, invalid or expired': 'Quyền truy cập thanh toán bị thiếu, không hợp lệ hoặc đã hết hạn',
    'Return to the merchant to check this order. Do not pay again if you have already paid.': 'Quay lại nhà bán hàng để kiểm tra đơn này. Đừng thanh toán lại nếu đã trả tiền.',
    'Only verified payment activates your subscription. This page cannot confirm payment.': 'Chỉ thanh toán đã xác minh mới kích hoạt đăng ký. Trang này không thể xác nhận thanh toán.',
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
