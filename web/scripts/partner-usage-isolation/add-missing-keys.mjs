// Sanctioned seven-locale writer for the merchant usage isolation task group.
// Run from `web/`: node scripts/partner-usage-isolation/add-missing-keys.mjs
// then `bun run i18n:sync`. Contains only this task group's keys.
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const CATEGORY_ERROR =
  'user_category must be exactly one of all, ordinary or merchant'
const TENANT_ID_ERROR =
  'tenant_id must be exactly one positive integer in canonical decimal form'
const CONFLICT_ERROR =
  'user_category=ordinary cannot be combined with tenant_id'

const newKeys = {
  en: {
    'User category': 'User category',
    'Owning merchant': 'Owning merchant',
    'Ordinary user': 'Ordinary user',
    'Merchant user': 'Merchant user',
    'Merchant #{{id}}': 'Merchant #{{id}}',
    'Merchant ID: {{id}}': 'Merchant ID: {{id}}',
    'Unknown merchant': 'Unknown merchant',
    'Search merchants...': 'Search merchants...',
    'No merchants found': 'No merchants found',
    'Failed to load merchants': 'Failed to load merchants',
    [CATEGORY_ERROR]:
      'The user category must be exactly one of all, ordinary or merchant.',
    [TENANT_ID_ERROR]:
      'The merchant ID must be exactly one positive integer in canonical decimal form.',
    [CONFLICT_ERROR]:
      'The ordinary user category cannot be combined with a specific merchant.',
  },
  zh: {
    'User category': '用户类别',
    'Owning merchant': '所属商户',
    'Ordinary user': '普通用户',
    'Merchant user': '商户用户',
    'Merchant #{{id}}': '商户 #{{id}}',
    'Merchant ID: {{id}}': '商户 ID：{{id}}',
    'Unknown merchant': '未知商户',
    'Search merchants...': '搜索商户...',
    'No merchants found': '未找到商户',
    'Failed to load merchants': '加载商户失败',
    [CATEGORY_ERROR]: '用户类别只能是全部、普通或商户中的一个。',
    [TENANT_ID_ERROR]: '商户 ID 必须是一个规范十进制形式的正整数。',
    [CONFLICT_ERROR]: '普通用户类别不能与具体商户同时筛选。',
  },
  'zh-TW': {
    'User category': '使用者類別',
    'Owning merchant': '所屬商戶',
    'Ordinary user': '一般使用者',
    'Merchant user': '商戶使用者',
    'Merchant #{{id}}': '商戶 #{{id}}',
    'Merchant ID: {{id}}': '商戶 ID：{{id}}',
    'Unknown merchant': '未知商戶',
    'Search merchants...': '搜尋商戶...',
    'No merchants found': '找不到商戶',
    'Failed to load merchants': '載入商戶失敗',
    [CATEGORY_ERROR]: '使用者類別只能是全部、一般或商戶其中之一。',
    [TENANT_ID_ERROR]: '商戶 ID 必須是一個標準十進位形式的正整數。',
    [CONFLICT_ERROR]: '一般使用者類別不能與特定商戶同時篩選。',
  },
  fr: {
    'User category': "Catégorie d'utilisateur",
    'Owning merchant': 'Marchand rattaché',
    'Ordinary user': 'Utilisateur ordinaire',
    'Merchant user': 'Utilisateur marchand',
    'Merchant #{{id}}': 'Marchand n° {{id}}',
    'Merchant ID: {{id}}': 'ID du marchand : {{id}}',
    'Unknown merchant': 'Marchand inconnu',
    'Search merchants...': 'Rechercher des marchands...',
    'No merchants found': 'Aucun marchand trouvé',
    'Failed to load merchants': 'Échec du chargement des marchands',
    [CATEGORY_ERROR]:
      "La catégorie d'utilisateur doit être exactement l'une des valeurs : tous, ordinaire ou marchand.",
    [TENANT_ID_ERROR]:
      "L'ID du marchand doit être exactement un entier positif en notation décimale canonique.",
    [CONFLICT_ERROR]:
      'La catégorie « ordinaire » ne peut pas être combinée avec un marchand précis.',
  },
  ja: {
    'User category': 'ユーザー区分',
    'Owning merchant': '所属マーチャント',
    'Ordinary user': '一般ユーザー',
    'Merchant user': 'マーチャントユーザー',
    'Merchant #{{id}}': 'マーチャント #{{id}}',
    'Merchant ID: {{id}}': 'マーチャント ID：{{id}}',
    'Unknown merchant': '不明なマーチャント',
    'Search merchants...': 'マーチャントを検索...',
    'No merchants found': 'マーチャントが見つかりません',
    'Failed to load merchants': 'マーチャントの読み込みに失敗しました',
    [CATEGORY_ERROR]:
      'ユーザー区分は「すべて」「一般」「マーチャント」のいずれか 1 つで指定してください。',
    [TENANT_ID_ERROR]:
      'マーチャント ID は正規の 10 進表記の正の整数 1 つで指定してください。',
    [CONFLICT_ERROR]:
      '一般ユーザー区分と特定のマーチャントは同時に指定できません。',
  },
  ru: {
    'User category': 'Категория пользователя',
    'Owning merchant': 'Мерчант-владелец',
    'Ordinary user': 'Обычный пользователь',
    'Merchant user': 'Пользователь мерчанта',
    'Merchant #{{id}}': 'Мерчант № {{id}}',
    'Merchant ID: {{id}}': 'ID мерчанта: {{id}}',
    'Unknown merchant': 'Неизвестный мерчант',
    'Search merchants...': 'Поиск мерчантов...',
    'No merchants found': 'Мерчанты не найдены',
    'Failed to load merchants': 'Не удалось загрузить мерчантов',
    [CATEGORY_ERROR]:
      'Категория пользователя должна быть ровно одним из значений: все, обычные или мерчант.',
    [TENANT_ID_ERROR]:
      'ID мерчанта должен быть ровно одним положительным целым числом в канонической десятичной записи.',
    [CONFLICT_ERROR]:
      'Категорию «обычные» нельзя сочетать с конкретным мерчантом.',
  },
  vi: {
    'User category': 'Loại người dùng',
    'Owning merchant': 'Thương nhân sở hữu',
    'Ordinary user': 'Người dùng thường',
    'Merchant user': 'Người dùng thương nhân',
    'Merchant #{{id}}': 'Thương nhân #{{id}}',
    'Merchant ID: {{id}}': 'ID thương nhân: {{id}}',
    'Unknown merchant': 'Thương nhân không xác định',
    'Search merchants...': 'Tìm thương nhân...',
    'No merchants found': 'Không tìm thấy thương nhân',
    'Failed to load merchants': 'Không tải được danh sách thương nhân',
    [CATEGORY_ERROR]:
      'Loại người dùng phải là đúng một trong các giá trị: tất cả, thường hoặc thương nhân.',
    [TENANT_ID_ERROR]:
      'ID thương nhân phải là đúng một số nguyên dương ở dạng thập phân chuẩn.',
    [CONFLICT_ERROR]:
      'Không thể kết hợp loại người dùng thường với một thương nhân cụ thể.',
  },
}

// Administrator merchant usage page (features/partner-usage-logs).
const SCOPE_NOTICE =
  'Only merchant records written to the dedicated store after the cut-over appear here. Earlier merchant records remain on the default usage logs page and are not migrated, so this history is not complete.'
const EMPTY_HINT =
  'An empty result is expected until merchant usage logging is cut over to the dedicated store; it does not mean the merchant had no earlier usage.'
const CNY_HINT =
  'A display equivalent at the current rate, not a historical charge, wallet balance or plan price.'
const CHARGED_FAILURE =
  'A failed request may still have been charged; its quota stays in the totals.'

const usageLogKeys = {
  en: {
    'Merchant usage logs': 'Merchant usage logs',
    [SCOPE_NOTICE]: SCOPE_NOTICE,
    'No merchant usage records in this window':
      'No merchant usage records in this window',
    [EMPTY_HINT]: EMPTY_HINT,
    'Failed to load merchant usage logs': 'Failed to load merchant usage logs',
    'Amount (CNY, current rate)': 'Amount (CNY, current rate)',
    [CNY_HINT]: CNY_HINT,
    'Raw quota': 'Raw quota',
    'Internal metering units, not money or tokens.':
      'Internal metering units, not money or tokens.',
    'Requests (retries folded)': 'Requests (retries folded)',
    'Succeeded: {{value}}': 'Succeeded: {{value}}',
    'Failed: {{value}}': 'Failed: {{value}}',
    [CHARGED_FAILURE]: CHARGED_FAILURE,
    'Records (every attempt)': 'Records (every attempt)',
    'Input: {{input}} · Output: {{output}}':
      'Input: {{input}} · Output: {{output}}',
    'Less than ¥0.000001': 'Less than ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      'Less than the smallest displayed unit, not free.',
    'All types': 'All types',
    'Effective window: {{start}} – {{end}}':
      'Effective window: {{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      'Check the user ID, text filters and time range.',
    'Merchant usage record details': 'Merchant usage record details',
    'Event ID': 'Event ID',
    'Upstream request ID': 'Upstream request ID',
    'Identity source': 'Identity source',
    'Recorded metadata': 'Recorded metadata',
    Summary: 'Summary',
  },
  zh: {
    'Merchant usage logs': '商户用量日志',
    [SCOPE_NOTICE]:
      '此页仅包含切换后写入独立存储的商户记录。更早的商户记录仍保留在默认使用日志页，不会迁移，因此这里的历史并不完整。',
    'No merchant usage records in this window':
      '所选时间范围内没有商户用量记录',
    [EMPTY_HINT]:
      '在商户用量日志切换到独立存储之前，结果为空属于正常情况，并不代表该商户此前没有用量。',
    'Failed to load merchant usage logs': '加载商户用量日志失败',
    'Amount (CNY, current rate)': '金额（人民币，按当前汇率）',
    [CNY_HINT]:
      '按当前汇率折算的展示值，不是历史实扣金额、钱包余额或套餐价格。',
    'Raw quota': '原始额度',
    'Internal metering units, not money or tokens.':
      '内部计量单位，不是金额，也不是 Token 数。',
    'Requests (retries folded)': '请求数（重试已合并）',
    'Succeeded: {{value}}': '成功：{{value}}',
    'Failed: {{value}}': '失败：{{value}}',
    [CHARGED_FAILURE]: '失败的请求仍可能已被计费，其额度计入合计。',
    'Records (every attempt)': '记录数（每次尝试）',
    'Input: {{input}} · Output: {{output}}':
      '输入：{{input}} · 输出：{{output}}',
    'Less than ¥0.000001': '小于 ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      '小于最小展示单位，并非免费。',
    'All types': '全部类型',
    'Effective window: {{start}} – {{end}}':
      '生效时间范围：{{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      '请检查用户 ID、文本筛选条件和时间范围。',
    'Merchant usage record details': '商户用量记录详情',
    'Event ID': '事件 ID',
    'Upstream request ID': '上游请求 ID',
    'Identity source': '身份来源',
    'Recorded metadata': '记录的元数据',
    Summary: '汇总',
  },
  'zh-TW': {
    'Merchant usage logs': '商戶用量日誌',
    [SCOPE_NOTICE]:
      '此頁僅包含切換後寫入獨立儲存的商戶記錄。更早的商戶記錄仍保留在預設使用日誌頁，不會遷移，因此這裡的歷史並不完整。',
    'No merchant usage records in this window':
      '所選時間範圍內沒有商戶用量記錄',
    [EMPTY_HINT]:
      '在商戶用量日誌切換到獨立儲存之前，結果為空屬於正常情況，並不代表該商戶先前沒有用量。',
    'Failed to load merchant usage logs': '載入商戶用量日誌失敗',
    'Amount (CNY, current rate)': '金額（人民幣，依目前匯率）',
    [CNY_HINT]:
      '依目前匯率換算的顯示值，不是歷史實際扣款、錢包餘額或方案價格。',
    'Raw quota': '原始額度',
    'Internal metering units, not money or tokens.':
      '內部計量單位，不是金額，也不是 Token 數。',
    'Requests (retries folded)': '請求數（重試已合併）',
    'Succeeded: {{value}}': '成功：{{value}}',
    'Failed: {{value}}': '失敗：{{value}}',
    [CHARGED_FAILURE]: '失敗的請求仍可能已被計費，其額度計入合計。',
    'Records (every attempt)': '記錄數（每次嘗試）',
    'Input: {{input}} · Output: {{output}}':
      '輸入：{{input}} · 輸出：{{output}}',
    'Less than ¥0.000001': '小於 ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      '小於最小顯示單位，並非免費。',
    'All types': '全部類型',
    'Effective window: {{start}} – {{end}}':
      '生效時間範圍：{{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      '請檢查使用者 ID、文字篩選條件和時間範圍。',
    'Merchant usage record details': '商戶用量記錄詳情',
    'Event ID': '事件 ID',
    'Upstream request ID': '上游請求 ID',
    'Identity source': '身分來源',
    'Recorded metadata': '記錄的中繼資料',
    Summary: '彙總',
  },
  fr: {
    'Merchant usage logs': "Journaux d'utilisation des marchands",
    [SCOPE_NOTICE]:
      "Seuls les enregistrements des marchands écrits dans le stockage dédié après la bascule apparaissent ici. Les enregistrements antérieurs restent sur la page des journaux d'utilisation par défaut et ne sont pas migrés : cet historique est donc incomplet.",
    'No merchant usage records in this window':
      "Aucun enregistrement d'utilisation marchand sur cette période",
    [EMPTY_HINT]:
      "Un résultat vide est normal tant que la journalisation de l'utilisation des marchands n'a pas basculé vers le stockage dédié ; cela ne signifie pas que le marchand n'avait aucune utilisation antérieure.",
    'Failed to load merchant usage logs':
      "Échec du chargement des journaux d'utilisation des marchands",
    'Amount (CNY, current rate)': 'Montant (CNY, taux actuel)',
    [CNY_HINT]:
      "Équivalent affiché au taux actuel ; ce n'est ni un débit historique, ni un solde de portefeuille, ni le prix d'une offre.",
    'Raw quota': 'Quota brut',
    'Internal metering units, not money or tokens.':
      "Unités de mesure internes, ni de l'argent ni des tokens.",
    'Requests (retries folded)': 'Requêtes (tentatives regroupées)',
    'Succeeded: {{value}}': 'Réussies : {{value}}',
    'Failed: {{value}}': 'Échouées : {{value}}',
    [CHARGED_FAILURE]:
      'Une requête échouée peut tout de même avoir été facturée ; son quota reste inclus dans les totaux.',
    'Records (every attempt)': 'Enregistrements (chaque tentative)',
    'Input: {{input}} · Output: {{output}}':
      'Entrée : {{input}} · Sortie : {{output}}',
    'Less than ¥0.000001': 'Moins de ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      "Inférieur à la plus petite unité affichée, ce n'est pas gratuit.",
    'All types': 'Tous les types',
    'Effective window: {{start}} – {{end}}':
      'Période effective : {{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      "Vérifiez l'ID utilisateur, les filtres de texte et la période.",
    'Merchant usage record details':
      "Détails de l'enregistrement d'utilisation marchand",
    'Event ID': "ID de l'événement",
    'Upstream request ID': 'ID de requête amont',
    'Identity source': "Source d'identité",
    'Recorded metadata': 'Métadonnées enregistrées',
    Summary: 'Récapitulatif',
  },
  ja: {
    'Merchant usage logs': 'マーチャント利用ログ',
    [SCOPE_NOTICE]:
      'このページには、切り替え後に専用ストアへ書き込まれたマーチャントの記録のみが表示されます。それ以前の記録は既定の利用ログページに残り、移行されないため、ここの履歴は完全ではありません。',
    'No merchant usage records in this window':
      'この期間にマーチャントの利用記録はありません',
    [EMPTY_HINT]:
      'マーチャント利用ログが専用ストアに切り替わるまでは、結果が空でも正常です。そのマーチャントに以前の利用がなかったことを意味しません。',
    'Failed to load merchant usage logs':
      'マーチャント利用ログの読み込みに失敗しました',
    'Amount (CNY, current rate)': '金額（CNY、現在のレート）',
    [CNY_HINT]:
      '現在のレートによる表示用の換算値であり、過去の実際の請求額、ウォレット残高、プラン価格ではありません。',
    'Raw quota': '生のクォータ',
    'Internal metering units, not money or tokens.':
      '内部の計量単位であり、金額でもトークン数でもありません。',
    'Requests (retries folded)': 'リクエスト数（再試行を集約）',
    'Succeeded: {{value}}': '成功：{{value}}',
    'Failed: {{value}}': '失敗：{{value}}',
    [CHARGED_FAILURE]:
      '失敗したリクエストでも課金されている場合があり、そのクォータは合計に含まれます。',
    'Records (every attempt)': 'レコード数（すべての試行）',
    'Input: {{input}} · Output: {{output}}':
      '入力：{{input}} · 出力：{{output}}',
    'Less than ¥0.000001': '¥0.000001 未満',
    'Less than the smallest displayed unit, not free.':
      '表示可能な最小単位未満であり、無料ではありません。',
    'All types': 'すべての種類',
    'Effective window: {{start}} – {{end}}': '有効な期間：{{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      'ユーザー ID、テキストフィルター、期間を確認してください。',
    'Merchant usage record details': 'マーチャント利用記録の詳細',
    'Event ID': 'イベント ID',
    'Upstream request ID': 'アップストリームリクエスト ID',
    'Identity source': 'ID ソース',
    'Recorded metadata': '記録されたメタデータ',
    Summary: 'サマリー',
  },
  ru: {
    'Merchant usage logs': 'Журналы использования мерчантов',
    [SCOPE_NOTICE]:
      'Здесь отображаются только записи мерчантов, внесённые в отдельное хранилище после переключения. Более ранние записи остаются на странице журналов использования по умолчанию и не переносятся, поэтому эта история неполная.',
    'No merchant usage records in this window':
      'За этот период нет записей об использовании мерчантов',
    [EMPTY_HINT]:
      'Пустой результат ожидаем, пока журналирование использования мерчантов не переключено на отдельное хранилище; это не означает, что у мерчанта не было использования ранее.',
    'Failed to load merchant usage logs':
      'Не удалось загрузить журналы использования мерчантов',
    'Amount (CNY, current rate)': 'Сумма (CNY, текущий курс)',
    [CNY_HINT]:
      'Отображаемый эквивалент по текущему курсу; это не историческое списание, не баланс кошелька и не цена тарифа.',
    'Raw quota': 'Исходная квота',
    'Internal metering units, not money or tokens.':
      'Внутренние единицы учёта, а не деньги и не токены.',
    'Requests (retries folded)': 'Запросы (повторы объединены)',
    'Succeeded: {{value}}': 'Успешно: {{value}}',
    'Failed: {{value}}': 'С ошибкой: {{value}}',
    [CHARGED_FAILURE]:
      'Неудачный запрос всё равно мог быть тарифицирован; его квота остаётся в итогах.',
    'Records (every attempt)': 'Записи (каждая попытка)',
    'Input: {{input}} · Output: {{output}}':
      'Вход: {{input}} · Выход: {{output}}',
    'Less than ¥0.000001': 'Менее ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      'Меньше наименьшей отображаемой единицы, но не бесплатно.',
    'All types': 'Все типы',
    'Effective window: {{start}} – {{end}}':
      'Фактический период: {{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      'Проверьте ID пользователя, текстовые фильтры и период.',
    'Merchant usage record details': 'Сведения о записи использования мерчанта',
    'Event ID': 'ID события',
    'Upstream request ID': 'ID запроса к апстриму',
    'Identity source': 'Источник идентификации',
    'Recorded metadata': 'Записанные метаданные',
    Summary: 'Сводка',
  },
  vi: {
    'Merchant usage logs': 'Nhật ký sử dụng của thương nhân',
    [SCOPE_NOTICE]:
      'Trang này chỉ gồm các bản ghi của thương nhân được ghi vào kho lưu trữ riêng sau khi chuyển đổi. Các bản ghi trước đó vẫn nằm ở trang nhật ký sử dụng mặc định và không được di chuyển, nên lịch sử ở đây không đầy đủ.',
    'No merchant usage records in this window':
      'Không có bản ghi sử dụng của thương nhân trong khoảng thời gian này',
    [EMPTY_HINT]:
      'Kết quả trống là bình thường cho đến khi nhật ký sử dụng của thương nhân được chuyển sang kho lưu trữ riêng; điều đó không có nghĩa là thương nhân chưa từng sử dụng trước đây.',
    'Failed to load merchant usage logs':
      'Không tải được nhật ký sử dụng của thương nhân',
    'Amount (CNY, current rate)': 'Số tiền (CNY, tỷ giá hiện tại)',
    [CNY_HINT]:
      'Giá trị quy đổi để hiển thị theo tỷ giá hiện tại, không phải khoản trừ trong quá khứ, số dư ví hay giá gói.',
    'Raw quota': 'Hạn mức gốc',
    'Internal metering units, not money or tokens.':
      'Đơn vị đo nội bộ, không phải tiền hay token.',
    'Requests (retries folded)': 'Yêu cầu (đã gộp lần thử lại)',
    'Succeeded: {{value}}': 'Thành công: {{value}}',
    'Failed: {{value}}': 'Thất bại: {{value}}',
    [CHARGED_FAILURE]:
      'Yêu cầu thất bại vẫn có thể đã bị tính phí; hạn mức của nó vẫn nằm trong tổng.',
    'Records (every attempt)': 'Bản ghi (mỗi lần thử)',
    'Input: {{input}} · Output: {{output}}':
      'Đầu vào: {{input}} · Đầu ra: {{output}}',
    'Less than ¥0.000001': 'Nhỏ hơn ¥0.000001',
    'Less than the smallest displayed unit, not free.':
      'Nhỏ hơn đơn vị hiển thị nhỏ nhất, không phải miễn phí.',
    'All types': 'Tất cả loại',
    'Effective window: {{start}} – {{end}}':
      'Khoảng thời gian hiệu lực: {{start}} – {{end}}',
    'Check the user ID, text filters and time range.':
      'Hãy kiểm tra ID người dùng, bộ lọc văn bản và khoảng thời gian.',
    'Merchant usage record details': 'Chi tiết bản ghi sử dụng của thương nhân',
    'Event ID': 'ID sự kiện',
    'Upstream request ID': 'ID yêu cầu thượng nguồn',
    'Identity source': 'Nguồn danh tính',
    'Recorded metadata': 'Siêu dữ liệu đã ghi',
    Summary: 'Tóm tắt',
  },
}

for (const [locale, trans] of Object.entries(usageLogKeys)) {
  Object.assign(newKeys[locale], trans)
}

async function main() {
  let totalAdded = 0

  for (const [locale, trans] of Object.entries(newKeys)) {
    const filePath = path.join(LOCALES_DIR, `${locale}.json`)
    const json = JSON.parse(await fs.readFile(filePath, 'utf8'))

    let count = 0
    for (const [key, value] of Object.entries(trans)) {
      if (json.translation[key] !== value) {
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
