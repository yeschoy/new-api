import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const newKeys = {
  en: {
    'Retained runs per group': 'Retained runs per group',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.',
    'Group display order': 'Group display order',
    'Save group order': 'Save group order',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.',
    'Checkout access has expired': 'Checkout access has expired',
    'Subscription checkout': 'Subscription checkout',
    'Checkout access expires': 'Checkout access expires',
    'Payment received': 'Payment received',
    'Subscription delivered. You can return to the merchant.':
      'Subscription delivered. You can return to the merchant.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      'Delivery is pending. Do not pay again; delivery continues even if you close this page.',
    'This payment is no longer available. Return to the merchant to check your order.':
      'This payment is no longer available. Return to the merchant to check your order.',
    'Awaiting payment confirmation': 'Awaiting payment confirmation',
    'Payment QR code': 'Payment QR code',
    'Open secure payment page': 'Open secure payment page',
    'Payment details are not ready. Return to the merchant if this persists.':
      'Payment details are not ready. Return to the merchant if this persists.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.',
    'Checkout access is missing, invalid or expired':
      'Checkout access is missing, invalid or expired',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      'Return to the merchant to check this order. Do not pay again if you have already paid.',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      'Only verified payment activates your subscription. This page cannot confirm payment.',
    'Great models.': 'Great models.',
    'Within reach.': 'Within reach.',
    'For each full top-up of': 'For each full top-up of',
    'Bonus usage credit': 'Bonus usage credit',
    'Per order · Bonus credit is not withdrawable':
      'Per order · Bonus credit is not withdrawable',
    'Offer rules': 'Offer rules',
    'Double 11 special': 'Double 11 special',
    'Double 11 top-up special': 'Double 11 top-up special',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      'Every CNY 100 topped up earns {{reward}} in bonus credit',
    'Complete hundreds per order only; remainders do not carry over.':
      'Complete hundreds per order only; remainders do not carry over.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.',
    'Check your wallet for current rewards.':
      'Check your wallet for current rewards.',
    'Offer details will appear when the campaign starts.':
      'Offer details will appear when the campaign starts.',
    'New plan': 'New plan',
    'Show run history': 'Show run history',
    'Hide run history': 'Hide run history',
    'Delete plan': 'Delete plan',
    'Delete plan {{group}}?': 'Delete plan {{group}}?',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      'Create and save a plan to show its group here. Available groups are not added automatically.',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      'Only saved plans appear in the gallery. Selecting a group does not create a plan.',
    'Run result': 'Run result',
    'Load older runs': 'Load older runs',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.',
    'Task group': 'Task group',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      'Each group has its own task, models, prompts and schedule. Save changes before switching groups.',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.',
    'Prompt {{number}}': 'Prompt {{number}}',
    'Remove prompt': 'Remove prompt',
    'Add prompt': 'Add prompt',
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
    'Retained runs per group': '每组保留轮数',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      '保留该分组最近完成的执行轮次（1–1000，默认 30）。更早的记录、作品和不再使用的快照将永久删除，正在执行的任务不受影响。',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      '按分组对比生成的 HTML/SVG 作品，最新轮次排在前面。这不是标准化智商评分。',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      '每个分组集中展示保留的历次结果，最新在前。新结果不会替换旧卡片，时间均为北京时间。',
    'Group display order': '分组展示顺序',
    'Save group order': '保存分组顺序',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      '拖拽或点击箭头调整已保存分组的顺序，保存后对所有用户生效。运行历史仍按时间倒序排列。',
    'Checkout access has expired': '收银台访问已过期',
    'Subscription checkout': '订阅收银台',
    'Checkout access expires': '收银台访问到期时间',
    'Payment received': '已确认收款',
    'Subscription delivered. You can return to the merchant.':
      '订阅已开通，您可以返回商户。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      '正在开通订阅，请勿重复付款。关闭页面后仍会继续处理。',
    'This payment is no longer available. Return to the merchant to check your order.':
      '当前支付已不可用，请返回商户查看订单。',
    'Awaiting payment confirmation': '等待支付确认',
    'Payment QR code': '付款二维码',
    'Open secure payment page': '打开安全支付页面',
    'Payment details are not ready. Return to the merchant if this persists.':
      '支付信息尚未就绪。如持续出现，请返回商户处理。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      '暂时无法刷新订单状态，这不代表支付失败。请重试查询或联系商户确认后再付款。',
    'Checkout access is missing, invalid or expired':
      '收银台访问凭证缺失、无效或已过期',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      '请返回商户查看此订单。如已付款，请勿重复支付。',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      '仅经核实的付款会开通订阅，本页面无法确认收款。',
    'Great models.': '好模型，',
    'Within reach.': '触手可及。',
    'For each full top-up of': '单笔每满',
    'Bonus usage credit': '额外赠送额度',
    'Per order · Bonus credit is not withdrawable':
      '单笔计算 · 赠送额度不可提现',
    'Offer rules': '活动规则',
    'Double 11 special': '双11特惠',
    'Double 11 top-up special': '双11充值特惠',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      '充值每满 100 元，赠 {{reward}} 使用额度',
    'Complete hundreds per order only; remainders do not carry over.':
      '单笔订单按完整的 100 元计算，零头不累计。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      '赠送额度不可提现，参与条件与次数限制以钱包页面为准。',
    'Check your wallet for current rewards.': '前往钱包查看当前充值赠送规则。',
    'Offer details will appear when the campaign starts.':
      '活动开始后展示具体赠送规则。',
    'New plan': '新建计划',
    'Show run history': '查看运行历史',
    'Hide run history': '收起运行历史',
    'Delete plan': '删除计划',
    'Delete plan {{group}}?': '删除 {{group}} 的计划？',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      '从展示列表移除此计划，停止定时和尚未发送的请求。已生成的作品会保留，已经开始的请求可能继续完成。',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      '每个已保存计划的分组只展示一行，运行历史需主动打开查看。时间均为北京时间。',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      '新建并保存计划后，对应分组才会展示在这里，不会自动添加其他可用分组。',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      '仅展示已保存的计划，选择分组不会自动创建计划。',
    'Run result': '本次结果',
    'Load older runs': '加载更早的记录',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      '每次运行结果独立保存，最新的排在前面。每行展示一个分组的一次运行，时间均为北京时间。',
    'Task group': '任务分组',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      '每个分组独立配置任务、模型、提示词和定时。切换分组前请先保存修改。',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      '每次运行随机抽取一条提示词，该任务内所有模型共用。默认使用项目现有提示词。',
    'Prompt {{number}}': '提示词 {{number}}',
    'Remove prompt': '移除提示词',
    'Add prompt': '添加提示词',
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
    'Retained runs per group': '每組保留輪數',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      '保留此分組最近完成的執行輪次（1–1000，預設 30）。更早的紀錄、作品及不再使用的快照將永久刪除，執行中的任務不受影響。',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      '依分組比較產生的 HTML/SVG 作品，最新輪次排在前面。這不是標準化智商評分。',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      '每個分組集中顯示保留的歷次結果，最新在前。新結果不會取代舊卡片，時間均為北京時間。',
    'Group display order': '分組顯示順序',
    'Save group order': '儲存分組順序',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      '拖曳或點擊箭頭調整已儲存分組的順序，儲存後對所有使用者生效。執行歷史仍依時間由新到舊排列。',
    'Checkout access has expired': '收銀台存取已過期',
    'Subscription checkout': '訂閱收銀台',
    'Checkout access expires': '收銀台存取到期時間',
    'Payment received': '已確認收款',
    'Subscription delivered. You can return to the merchant.':
      '訂閱已開通，您可以返回商戶。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      '正在開通訂閱，請勿重複付款。關閉頁面後仍會繼續處理。',
    'This payment is no longer available. Return to the merchant to check your order.':
      '目前已無法支付，請返回商戶查看訂單。',
    'Awaiting payment confirmation': '等待付款確認',
    'Payment QR code': '付款 QR Code',
    'Open secure payment page': '開啟安全付款頁面',
    'Payment details are not ready. Return to the merchant if this persists.':
      '付款資訊尚未就緒。如持續出現，請返回商戶處理。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      '暫時無法更新訂單狀態，這不代表付款失敗。請重試查詢或聯絡商戶確認後再付款。',
    'Checkout access is missing, invalid or expired':
      '收銀台存取憑證遺失、無效或已過期',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      '請返回商戶查看此訂單。如已付款，請勿重複支付。',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      '僅經核實的付款會開通訂閱，本頁面無法確認收款。',
    'Great models.': '好模型，',
    'Within reach.': '觸手可及。',
    'For each full top-up of': '單筆每滿',
    'Bonus usage credit': '額外贈送額度',
    'Per order · Bonus credit is not withdrawable':
      '單筆計算 · 贈送額度不可提領',
    'Offer rules': '活動規則',
    'Double 11 special': '雙11優惠',
    'Double 11 top-up special': '雙11儲值優惠',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      '儲值每滿人民幣 100 元，贈 {{reward}} 使用額度',
    'Complete hundreds per order only; remainders do not carry over.':
      '每筆訂單以完整的人民幣 100 元計算，餘額不累計。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      '贈送額度不可提領，參加條件與次數限制以錢包頁面為準。',
    'Check your wallet for current rewards.':
      '前往錢包查看目前的儲值贈送規則。',
    'Offer details will appear when the campaign starts.':
      '活動開始後將顯示詳細贈送規則。',
    'New plan': '新增計畫',
    'Show run history': '查看執行歷史',
    'Hide run history': '收起執行歷史',
    'Delete plan': '刪除計畫',
    'Delete plan {{group}}?': '刪除 {{group}} 的計畫？',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      '從展示清單移除此計畫，停止排程與尚未送出的請求。已產生的作品會保留，已開始的請求可能繼續完成。',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      '每個已儲存計畫的群組只顯示一行，執行歷史需主動開啟查看。時間均為北京時間。',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      '新增並儲存計畫後，對應群組才會顯示在這裡，不會自動新增其他可用群組。',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      '僅顯示已儲存的計畫，選取群組不會自動建立計畫。',
    'Run result': '本次結果',
    'Load older runs': '載入更早的記錄',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      '每次執行結果獨立儲存，最新的排在前面。每行顯示一個群組的一次執行，時間均為北京時間。',
    'Task group': '任務群組',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      '每個群組獨立設定任務、模型、提示詞和排程。切換群組前請先儲存修改。',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      '每次執行隨機抽取一條提示詞，此任務內所有模型共用。預設使用專案現有提示詞。',
    'Prompt {{number}}': '提示詞 {{number}}',
    'Remove prompt': '移除提示詞',
    'Add prompt': '新增提示詞',
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
    'Retained runs per group': 'Exécutions conservées par groupe',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      'Conserve les dernières exécutions terminées du groupe (1–1000, 30 par défaut). Les anciens résultats, œuvres et instantanés inutilisés sont supprimés définitivement. Les exécutions en cours sont protégées.',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      'Comparez les œuvres HTML/SVG par groupe, des plus récentes aux plus anciennes. Ce n’est pas un score de QI standardisé.',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      'Chaque groupe réunit ses résultats conservés, les plus récents en premier. Les nouveaux ne remplacent pas les anciennes cartes. Horaires de Pékin.',
    'Group display order': 'Ordre d’affichage des groupes',
    'Save group order': 'Enregistrer l’ordre',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      'Glissez les groupes enregistrés ou utilisez les flèches. Enregistrez pour appliquer l’ordre à tous. L’historique reste du plus récent au plus ancien.',
    'Checkout access has expired': 'L’accès au paiement a expiré',
    'Subscription checkout': 'Paiement de l’abonnement',
    'Checkout access expires': 'Expiration de l’accès au paiement',
    'Payment received': 'Paiement reçu',
    'Subscription delivered. You can return to the merchant.':
      'Abonnement activé. Vous pouvez retourner chez le marchand.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      'Activation en cours. Ne payez pas à nouveau ; le traitement continue après la fermeture de cette page.',
    'This payment is no longer available. Return to the merchant to check your order.':
      'Ce paiement n’est plus disponible. Consultez votre commande chez le marchand.',
    'Awaiting payment confirmation': 'En attente de confirmation du paiement',
    'Payment QR code': 'Code QR de paiement',
    'Open secure payment page': 'Ouvrir le paiement sécurisé',
    'Payment details are not ready. Return to the merchant if this persists.':
      'Les informations de paiement ne sont pas prêtes. Si cela persiste, contactez le marchand.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      'Impossible d’actualiser la commande. Cela ne signifie pas un échec du paiement. Réessayez ou vérifiez auprès du marchand avant de payer.',
    'Checkout access is missing, invalid or expired':
      'Accès au paiement absent, invalide ou expiré',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      'Consultez cette commande chez le marchand. Ne payez pas à nouveau si vous avez déjà payé.',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      'Seul un paiement vérifié active l’abonnement. Cette page ne peut pas confirmer un paiement.',
    'Great models.': 'Les meilleurs modèles.',
    'Within reach.': 'À votre portée.',
    'For each full top-up of': 'Par tranche rechargée de',
    'Bonus usage credit': 'Crédit bonus',
    'Per order · Bonus credit is not withdrawable':
      'Par commande · Bonus non retirable',
    'Offer rules': 'Conditions',
    'Double 11 special': 'Offre du 11.11',
    'Double 11 top-up special': 'Offre de recharge du 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      'Pour 100 CNY rechargés, recevez {{reward}} de crédit bonus',
    'Complete hundreds per order only; remainders do not carry over.':
      'Par tranches entières de 100 CNY par commande ; le reste ne se cumule pas.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      'Crédit bonus non retirable. Conditions et limites dans votre portefeuille.',
    'Check your wallet for current rewards.':
      'Consultez votre portefeuille pour les bonus en cours.',
    'Offer details will appear when the campaign starts.':
      'Les détails seront affichés au début de la campagne.',
    'New plan': 'Nouveau programme',
    'Show run history': 'Voir l’historique',
    'Hide run history': 'Masquer l’historique',
    'Delete plan': 'Supprimer le programme',
    'Delete plan {{group}}?': 'Supprimer le programme de {{group}} ?',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      'Retirer ce programme de la galerie et arrêter sa planification et les requêtes non envoyées. Les œuvres sont conservées. Les requêtes déjà lancées peuvent se terminer.',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      'Chaque programme enregistré occupe une ligne par groupe. L’historique reste masqué jusqu’à son ouverture. Horaires en heure de Pékin.',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      'Créez et enregistrez un programme pour afficher son groupe ici. Les groupes disponibles ne sont pas ajoutés automatiquement.',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      'Seuls les programmes enregistrés apparaissent dans la galerie. Sélectionner un groupe ne crée pas de programme.',
    'Run result': 'Résultat de l’exécution',
    'Load older runs': 'Charger les exécutions précédentes',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      'Chaque exécution est conservée, de la plus récente à la plus ancienne. Une ligne par exécution de groupe. Horaires de Pékin.',
    'Task group': 'Groupe de la tâche',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      'Chaque groupe a sa tâche, ses modèles, ses prompts et sa planification. Enregistrez avant de changer de groupe.',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      'Un prompt est tiré au sort à chaque exécution et partagé par tous les modèles de la tâche. Le prompt actuel du projet est utilisé par défaut.',
    'Prompt {{number}}': 'Prompt {{number}}',
    'Remove prompt': 'Retirer le prompt',
    'Add prompt': 'Ajouter un prompt',
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
    'Retained runs per group': 'グループごとの保持実行数',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      'このグループの完了済み実行を新しい順に保持します（1～1000、既定は30）。古い記録・作品・未使用のスナップショットは完全に削除されます。実行中のタスクは保護されます。',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      '生成された HTML/SVG 作品をグループ別に新しい順で比較します。標準化されたIQスコアではありません。',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      '各グループの保持済み結果を新しい順でまとめて表示します。新しい結果が古いカードを置き換えることはありません。時刻は北京時間です。',
    'Group display order': 'グループの表示順',
    'Save group order': '表示順を保存',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      'ドラッグまたは矢印で保存済みグループを並べ替えます。保存すると全ユーザーに反映されます。実行履歴は新しい順のままです。',
    'Checkout access has expired': '支払いページのアクセス期限が切れました',
    'Subscription checkout': 'サブスクリプションのお支払い',
    'Checkout access expires': '支払いページのアクセス期限',
    'Payment received': '入金確認済み',
    'Subscription delivered. You can return to the merchant.':
      'サブスクリプションが有効になりました。販売元にお戻りください。',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      '有効化を処理中です。再度お支払いしないでください。このページを閉じても処理は続きます。',
    'This payment is no longer available. Return to the merchant to check your order.':
      'このお支払いは利用できません。販売元で注文をご確認ください。',
    'Awaiting payment confirmation': '支払い確認待ち',
    'Payment QR code': '支払い用QRコード',
    'Open secure payment page': '安全な支払いページを開く',
    'Payment details are not ready. Return to the merchant if this persists.':
      '支払い情報は準備中です。解消しない場合は販売元にお問い合わせください。',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      '注文状態を更新できません。支払い失敗を意味するものではありません。再照会するか、販売元に確認してからお支払いください。',
    'Checkout access is missing, invalid or expired':
      '支払いページのアクセス情報がないか、無効または期限切れです',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      '販売元でこの注文をご確認ください。お支払い済みの場合は再度お支払いしないでください。',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      '検証済みの入金のみがサブスクリプションを有効にします。このページでは入金を確定できません。',
    'Great models.': '優れたモデルを、',
    'Within reach.': 'もっと身近に。',
    'For each full top-up of': '1注文のチャージ額ごとに',
    'Bonus usage credit': '追加利用クレジット',
    'Per order · Bonus credit is not withdrawable':
      '注文単位で計算 · 特典は出金不可',
    'Offer rules': '特典条件',
    'Double 11 special': '11.11特典',
    'Double 11 top-up special': '11.11チャージ特典',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      '100人民元のチャージごとに{{reward}}の利用クレジットを進呈',
    'Complete hundreds per order only; remainders do not carry over.':
      '1注文につき100人民元単位で計算し、端数は繰り越しません。',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      '特典クレジットは出金できません。対象条件と回数制限はウォレットをご確認ください。',
    'Check your wallet for current rewards.':
      '現在の特典はウォレットでご確認ください。',
    'Offer details will appear when the campaign starts.':
      'キャンペーン開始後に特典の詳細を表示します。',
    'New plan': 'プランを新規作成',
    'Show run history': '実行履歴を表示',
    'Hide run history': '実行履歴を閉じる',
    'Delete plan': 'プランを削除',
    'Delete plan {{group}}?': '{{group}} のプランを削除しますか？',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      'このプランをギャラリーから除外し、スケジュールと未送信のリクエストを停止します。保存済みの作品は保持されます。開始済みのリクエストは完了する場合があります。',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      '保存済みプランはグループごとに1行で表示します。実行履歴は開くまで表示されません。時刻は北京時間です。',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      'プランを作成して保存すると、そのグループがここに表示されます。利用可能なグループは自動追加されません。',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      '保存済みのプランのみギャラリーに表示されます。グループの選択だけではプランは作成されません。',
    'Run result': '今回の結果',
    'Load older runs': '以前の実行を読み込む',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      '実行結果は毎回個別に保存され、新しい順に表示されます。1行が1グループの1回の実行です。時刻は北京時間です。',
    'Task group': 'タスクのグループ',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      'グループごとにタスク、モデル、プロンプト、スケジュールを個別に設定します。グループを切り替える前に変更を保存してください。',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      '実行ごとにプロンプトを1つランダムに選び、タスク内の全モデルで共有します。既定ではプロジェクトの既存プロンプトを使います。',
    'Prompt {{number}}': 'プロンプト {{number}}',
    'Remove prompt': 'プロンプトを削除',
    'Add prompt': 'プロンプトを追加',
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
    'Retained runs per group': 'Хранимых запусков на группу',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      'Хранить последние завершённые запуски группы (1–1000, по умолчанию 30). Старые записи, работы и неиспользуемые снимки удаляются навсегда. Активные запуски защищены.',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      'Сравнивайте работы HTML/SVG по группам, начиная с новых запусков. Это не стандартизированный показатель IQ.',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      'Сохранённые результаты каждой группы показаны вместе, новые первыми. Новые результаты не заменяют старые карточки. Время пекинское.',
    'Group display order': 'Порядок отображения групп',
    'Save group order': 'Сохранить порядок',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      'Перетащите сохранённые группы или используйте стрелки. Сохраните порядок для всех пользователей. История остаётся от новых запусков к старым.',
    'Checkout access has expired': 'Срок доступа к оплате истёк',
    'Subscription checkout': 'Оплата подписки',
    'Checkout access expires': 'Срок доступа к оплате',
    'Payment received': 'Оплата получена',
    'Subscription delivered. You can return to the merchant.':
      'Подписка активирована. Вы можете вернуться к продавцу.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      'Активация ожидается. Не платите повторно: обработка продолжится и после закрытия страницы.',
    'This payment is no longer available. Return to the merchant to check your order.':
      'Эта оплата больше недоступна. Проверьте заказ у продавца.',
    'Awaiting payment confirmation': 'Ожидание подтверждения оплаты',
    'Payment QR code': 'QR-код для оплаты',
    'Open secure payment page': 'Открыть защищённую страницу оплаты',
    'Payment details are not ready. Return to the merchant if this persists.':
      'Данные для оплаты ещё не готовы. Если проблема сохраняется, обратитесь к продавцу.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      'Не удалось обновить статус заказа. Это не означает сбой оплаты. Повторите проверку или уточните у продавца перед оплатой.',
    'Checkout access is missing, invalid or expired':
      'Доступ к оплате отсутствует, недействителен или истёк',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      'Проверьте этот заказ у продавца. Если вы уже заплатили, не платите повторно.',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      'Подписку активирует только проверенная оплата. Эта страница не может подтвердить платёж.',
    'Great models.': 'Лучшие модели.',
    'Within reach.': 'Ближе, чем кажется.',
    'For each full top-up of': 'За каждые полные',
    'Bonus usage credit': 'Бонусный кредит',
    'Per order · Bonus credit is not withdrawable':
      'На заказ · Бонус нельзя вывести',
    'Offer rules': 'Условия',
    'Double 11 special': 'Акция 11.11',
    'Double 11 top-up special': 'Бонус за пополнение к 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      'За каждые 100 CNY пополнения — {{reward}} бонусного кредита',
    'Complete hundreds per order only; remainders do not carry over.':
      'Учитываются полные 100 CNY в одном заказе; остаток не переносится.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      'Бонусный кредит нельзя вывести. Условия и лимиты указаны в кошельке.',
    'Check your wallet for current rewards.':
      'Текущие бонусы за пополнение смотрите в кошельке.',
    'Offer details will appear when the campaign starts.':
      'Подробные условия появятся после начала акции.',
    'New plan': 'Новый план',
    'Show run history': 'История запусков',
    'Hide run history': 'Скрыть историю',
    'Delete plan': 'Удалить план',
    'Delete plan {{group}}?': 'Удалить план группы {{group}}?',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      'Убрать план из галереи, отключить расписание и неотправленные запросы. Сохранённые работы останутся. Уже начатые запросы могут завершиться.',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      'Каждый сохранённый план отображается одной строкой группы. История запусков скрыта до открытия. Время пекинское.',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      'Создайте и сохраните план, чтобы его группа появилась здесь. Доступные группы не добавляются автоматически.',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      'В галерее видны только сохранённые планы. Выбор группы не создаёт план.',
    'Run result': 'Результат запуска',
    'Load older runs': 'Загрузить более ранние запуски',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      'Все запуски сохраняются отдельно, новые сверху. Одна строка — один запуск группы. Время пекинское.',
    'Task group': 'Группа задачи',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      'У каждой группы свои задача, модели, запросы и расписание. Сохраните изменения перед сменой группы.',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      'Для каждого запуска случайно выбирается один запрос, общий для всех моделей задачи. По умолчанию используется текущий запрос проекта.',
    'Prompt {{number}}': 'Запрос {{number}}',
    'Remove prompt': 'Удалить запрос',
    'Add prompt': 'Добавить запрос',
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
    'Retained runs per group': 'Số lần chạy giữ lại mỗi nhóm',
    'Keep the latest completed runs in this group (1–1000, default 30). Older records, artwork and unused snapshots are permanently deleted. Active runs are protected.':
      'Giữ các lần chạy đã hoàn tất gần nhất của nhóm (1–1000, mặc định 30). Bản ghi, tác phẩm cũ và ảnh chụp trạng thái không còn dùng sẽ bị xóa vĩnh viễn. Lần chạy đang hoạt động được bảo vệ.',
    'Compare generated HTML/SVG artwork by group, newest runs first. Not a standardized IQ score.':
      'So sánh tác phẩm HTML/SVG theo nhóm, lần chạy mới nhất trước. Đây không phải điểm IQ chuẩn hóa.',
    'Each group shows its retained runs together, newest first. New results do not replace older cards. Times are shown in Beijing time.':
      'Mỗi nhóm hiển thị chung các kết quả được giữ lại, mới nhất trước. Kết quả mới không thay thế thẻ cũ. Thời gian theo giờ Bắc Kinh.',
    'Group display order': 'Thứ tự hiển thị nhóm',
    'Save group order': 'Lưu thứ tự nhóm',
    'Drag or use the arrows to reorder saved groups. Save to apply for all viewers. Run history stays newest first.':
      'Kéo hoặc dùng mũi tên để sắp xếp các nhóm đã lưu. Lưu để áp dụng cho mọi người. Lịch sử vẫn hiển thị lần chạy mới nhất trước.',
    'Checkout access has expired': 'Quyền truy cập thanh toán đã hết hạn',
    'Subscription checkout': 'Thanh toán đăng ký',
    'Checkout access expires': 'Hạn truy cập trang thanh toán',
    'Payment received': 'Đã nhận thanh toán',
    'Subscription delivered. You can return to the merchant.':
      'Đã kích hoạt đăng ký. Bạn có thể quay lại nhà bán hàng.',
    'Delivery is pending. Do not pay again; delivery continues even if you close this page.':
      'Đang chờ kích hoạt. Đừng thanh toán lại; quá trình xử lý vẫn tiếp tục khi bạn đóng trang.',
    'This payment is no longer available. Return to the merchant to check your order.':
      'Thanh toán này không còn khả dụng. Hãy quay lại nhà bán hàng để kiểm tra đơn.',
    'Awaiting payment confirmation': 'Đang chờ xác nhận thanh toán',
    'Payment QR code': 'Mã QR thanh toán',
    'Open secure payment page': 'Mở trang thanh toán an toàn',
    'Payment details are not ready. Return to the merchant if this persists.':
      'Thông tin thanh toán chưa sẵn sàng. Nếu vẫn tiếp diễn, hãy liên hệ nhà bán hàng.',
    'Unable to refresh order status. Payment is not marked as failed. Retry status or check with the merchant before paying.':
      'Không thể cập nhật trạng thái đơn. Điều này không có nghĩa thanh toán thất bại. Hãy thử tra cứu lại hoặc hỏi nhà bán hàng trước khi trả tiền.',
    'Checkout access is missing, invalid or expired':
      'Quyền truy cập thanh toán bị thiếu, không hợp lệ hoặc đã hết hạn',
    'Return to the merchant to check this order. Do not pay again if you have already paid.':
      'Quay lại nhà bán hàng để kiểm tra đơn này. Đừng thanh toán lại nếu đã trả tiền.',
    'Only verified payment activates your subscription. This page cannot confirm payment.':
      'Chỉ thanh toán đã xác minh mới kích hoạt đăng ký. Trang này không thể xác nhận thanh toán.',
    'Great models.': 'Mô hình hàng đầu.',
    'Within reach.': 'Trong tầm tay.',
    'For each full top-up of': 'Mỗi lần nạp đủ',
    'Bonus usage credit': 'Tín dụng thưởng thêm',
    'Per order · Bonus credit is not withdrawable':
      'Tính theo đơn · Không thể rút tiền thưởng',
    'Offer rules': 'Thể lệ',
    'Double 11 special': 'Ưu đãi 11.11',
    'Double 11 top-up special': 'Ưu đãi nạp tiền 11.11',
    'Every CNY 100 topped up earns {{reward}} in bonus credit':
      'Nạp mỗi 100 CNY, nhận {{reward}} tín dụng thưởng',
    'Complete hundreds per order only; remainders do not carry over.':
      'Tính theo từng 100 CNY trọn vẹn trong mỗi đơn; phần lẻ không cộng dồn.',
    'Gift credit cannot be withdrawn. Eligibility and limits are shown in your wallet.':
      'Tín dụng thưởng không thể rút. Xem điều kiện và giới hạn trong ví.',
    'Check your wallet for current rewards.':
      'Xem ưu đãi nạp tiền hiện tại trong ví.',
    'Offer details will appear when the campaign starts.':
      'Chi tiết ưu đãi sẽ hiển thị khi chương trình bắt đầu.',
    'New plan': 'Tạo kế hoạch',
    'Show run history': 'Xem lịch sử chạy',
    'Hide run history': 'Ẩn lịch sử chạy',
    'Delete plan': 'Xóa kế hoạch',
    'Delete plan {{group}}?': 'Xóa kế hoạch của {{group}}?',
    'Remove this plan from the gallery and stop its schedule and unsent requests. Saved artwork is kept. Requests already started may finish.':
      'Ẩn kế hoạch khỏi thư viện, dừng lịch chạy và các yêu cầu chưa gửi. Tác phẩm đã lưu được giữ lại. Các yêu cầu đã bắt đầu có thể tiếp tục hoàn tất.',
    'Each saved plan has one group row. Run history is hidden until opened. Times are shown in Beijing time.':
      'Mỗi kế hoạch đã lưu hiển thị một hàng cho nhóm. Lịch sử chạy được ẩn cho đến khi mở. Thời gian theo giờ Bắc Kinh.',
    'Create and save a plan to show its group here. Available groups are not added automatically.':
      'Tạo và lưu kế hoạch để hiển thị nhóm tại đây. Các nhóm khả dụng không được tự động thêm.',
    'Only saved plans appear in the gallery. Selecting a group does not create a plan.':
      'Chỉ các kế hoạch đã lưu xuất hiện trong thư viện. Chọn nhóm không tự tạo kế hoạch.',
    'Run result': 'Kết quả lần chạy',
    'Load older runs': 'Tải các lần chạy cũ hơn',
    'Every run is saved separately, newest first. Each row is one group run. Times are shown in Beijing time.':
      'Mỗi lần chạy được lưu riêng, mới nhất ở trên. Mỗi hàng là một lần chạy của một nhóm. Thời gian theo giờ Bắc Kinh.',
    'Task group': 'Nhóm tác vụ',
    'Each group has its own task, models, prompts and schedule. Save changes before switching groups.':
      'Mỗi nhóm có tác vụ, mô hình, câu lệnh và lịch chạy riêng. Hãy lưu thay đổi trước khi chuyển nhóm.',
    'One prompt is randomly selected for each run and shared by all models in this task. The existing project prompt is used by default.':
      'Mỗi lần chạy chọn ngẫu nhiên một câu lệnh dùng chung cho mọi mô hình trong tác vụ. Mặc định dùng câu lệnh hiện có của dự án.',
    'Prompt {{number}}': 'Câu lệnh {{number}}',
    'Remove prompt': 'Xóa câu lệnh',
    'Add prompt': 'Thêm câu lệnh',
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

// Hosted purchase copy. --partner-purchase applies only this scoped batch.
const purchaseKeys = {
  en: {
    'Choose your subscription': 'Choose your subscription',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      'One purchase per link. Final payment and delivery status are shown in the checkout.',
    'Loading purchase options…': 'Loading purchase options…',
    'Purchase access expires': 'Purchase access expires',
    'An order already exists for this purchase':
      'An order already exists for this purchase',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.',
    'Resume checkout / view order': 'Resume checkout / view order',
    'No purchase options are available': 'No purchase options are available',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.',
    'One calendar month': 'One calendar month',
    'Unlimited quota': 'Unlimited quota',
    'Internal quota units: {{amount}}': 'Internal quota units: {{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      'Plan rate limit: {{rpm}} requests/min',
    'Payment method': 'Payment method',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      'Your original options are locked for safe retry. A new purchase must start from the merchant.',
    'Original plan {{plan}} · payment {{method}}':
      'Original plan {{plan}} · payment {{method}}',
    'Opening checkout…': 'Opening checkout…',
    'Retry original purchase': 'Retry original purchase',
    'Continue to checkout': 'Continue to checkout',
    'Check purchase status': 'Check purchase status',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      'Purchase access has expired. Return to the merchant to check your order before starting again.',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.',
  },
  zh: {
    'Choose your subscription': '选择订阅套餐',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      '每个链接仅限一次购买。最终付款与交付状态以收银台为准。',
    'Loading purchase options…': '正在加载购买选项…',
    'Purchase access expires': '购买入口到期时间',
    'An order already exists for this purchase': '本次购买已有订单',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      '请继续此订单，不要另行购买。如已付款，请等待核验确认。',
    'Resume checkout / view order': '继续付款 / 查看订单',
    'No purchase options are available': '暂无可用购买选项',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      '商户目前没有可付款的套餐或支付方式。请返回商户或稍后查看。',
    'One calendar month': '一个日历月',
    'Unlimited quota': '不限额度',
    'Internal quota units: {{amount}}': '内部额度单位：{{amount}}',
    'Plan rate limit: {{rpm}} requests/min': '套餐限速：{{rpm}} 次请求/分钟',
    'Payment method': '支付方式',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      '已锁定原购买选项，以便安全重试。新购买须从商户重新发起。',
    'Original plan {{plan}} · payment {{method}}':
      '原套餐 {{plan}} · 支付方式 {{method}}',
    'Opening checkout…': '正在打开收银台…',
    'Retry original purchase': '重试原购买',
    'Continue to checkout': '前往收银台',
    'Check purchase status': '查询购买状态',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      '浏览器存储不可用，刷新恢复受限。如页面关闭，请返回商户查单。',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      '购买入口无效、已撤销或已在其他窗口使用。请返回商户查询本次购买。',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      '购买入口已过期。再次发起前，请返回商户查询订单。',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      '本次购买已使用其他选项。请查询状态或返回商户，不要重复付款。',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      '当前购买选项不可用。再次发起前，请查询购买状态或联系商户。',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      '无法确认请求结果。请重试原购买或查询状态，不要另行付款。',
  },
  'zh-TW': {
    'Choose your subscription': '選擇訂閱方案',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      '每個連結僅限一次購買。最終付款與交付狀態以收銀台為準。',
    'Loading purchase options…': '正在載入購買選項…',
    'Purchase access expires': '購買入口到期時間',
    'An order already exists for this purchase': '本次購買已有訂單',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      '請繼續此訂單，不要另行購買。如已付款，請等待驗證確認。',
    'Resume checkout / view order': '繼續付款 / 檢視訂單',
    'No purchase options are available': '暫無可用購買選項',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      '商戶目前沒有可付款的方案或付款方式。請返回商戶或稍後查看。',
    'One calendar month': '一個曆月',
    'Unlimited quota': '不限額度',
    'Internal quota units: {{amount}}': '內部額度單位：{{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      '方案速率限制：每分鐘 {{rpm}} 次請求',
    'Payment method': '付款方式',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      '已鎖定原購買選項，以便安全重試。新購買須從商戶重新發起。',
    'Original plan {{plan}} · payment {{method}}':
      '原方案 {{plan}} · 付款方式 {{method}}',
    'Opening checkout…': '正在開啟收銀台…',
    'Retry original purchase': '重試原購買',
    'Continue to checkout': '前往收銀台',
    'Check purchase status': '查詢購買狀態',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      '瀏覽器儲存不可用，重新整理後的恢復受限。如頁面關閉，請返回商戶查單。',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      '購買入口無效、已撤銷或已在其他視窗使用。請返回商戶查詢本次購買。',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      '購買入口已過期。再次發起前，請返回商戶查詢訂單。',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      '本次購買已使用其他選項。請查詢狀態或返回商戶，不要重複付款。',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      '目前購買選項不可用。再次發起前，請查詢購買狀態或聯絡商戶。',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      '無法確認請求結果。請重試原購買或查詢狀態，不要另行付款。',
  },
  fr: {
    'Choose your subscription': 'Choisissez votre abonnement',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      'Un achat par lien. Le paiement et la livraison définitifs sont indiqués dans la caisse.',
    'Loading purchase options…': 'Chargement des options d’achat…',
    'Purchase access expires': 'Expiration de l’accès à l’achat',
    'An order already exists for this purchase':
      'Une commande existe déjà pour cet achat',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      'Reprenez cette commande sans nouvel achat. Si vous avez payé, attendez la confirmation vérifiée.',
    'Resume checkout / view order': 'Reprendre le paiement / voir la commande',
    'No purchase options are available': 'Aucune option d’achat disponible',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      'Le marchand n’a aucun forfait payable ou moyen de paiement disponible. Revenez chez lui ou réessayez plus tard.',
    'One calendar month': 'Un mois calendaire',
    'Unlimited quota': 'Quota illimité',
    'Internal quota units: {{amount}}': 'Unités de quota internes : {{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      'Limite du forfait : {{rpm}} requêtes/min',
    'Payment method': 'Moyen de paiement',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      'Vos choix initiaux sont verrouillés pour réessayer sans risque. Tout nouvel achat doit partir du marchand.',
    'Original plan {{plan}} · payment {{method}}':
      'Forfait initial {{plan}} · paiement {{method}}',
    'Opening checkout…': 'Ouverture de la caisse…',
    'Retry original purchase': 'Réessayer l’achat initial',
    'Continue to checkout': 'Passer au paiement',
    'Check purchase status': 'Vérifier l’état de l’achat',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      'Le stockage du navigateur est indisponible. La reprise après actualisation est limitée ; si la page se ferme, consultez la commande chez le marchand.',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      'L’accès est invalide, révoqué ou déjà utilisé dans une autre fenêtre. Vérifiez votre achat auprès du marchand.',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      'L’accès à l’achat a expiré. Vérifiez la commande chez le marchand avant de recommencer.',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      'Cet achat utilise déjà d’autres options. Vérifiez son état ou contactez le marchand ; ne payez pas deux fois.',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      'Ces options d’achat sont indisponibles. Vérifiez l’état de l’achat ou contactez le marchand avant de recommencer.',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      'La demande n’a pas pu être confirmée. Réessayez le même achat ou vérifiez son état ; ne lancez pas un second paiement.',
  },
  ja: {
    'Choose your subscription': 'サブスクリプションを選択',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      'リンクごとに購入は1回限りです。最終的な支払い・提供状況は決済画面に表示されます。',
    'Loading purchase options…': '購入オプションを読み込み中…',
    'Purchase access expires': '購入アクセスの有効期限',
    'An order already exists for this purchase':
      'この購入には既存の注文があります',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      '新たに購入せず、この注文を再開してください。支払い済みの場合は確認をお待ちください。',
    'Resume checkout / view order': '決済を再開 / 注文を表示',
    'No purchase options are available': '購入できるオプションがありません',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      '現在、この加盟店には購入可能なプランまたは支払い方法がありません。加盟店に戻るか、後ほどご確認ください。',
    'One calendar month': '1暦月',
    'Unlimited quota': 'クォータ無制限',
    'Internal quota units: {{amount}}': '内部クォータ単位：{{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      'プランの制限：毎分 {{rpm}} リクエスト',
    'Payment method': '支払い方法',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      '安全に再試行するため、最初の選択内容を固定しました。新規購入は加盟店から開始してください。',
    'Original plan {{plan}} · payment {{method}}':
      '元のプラン {{plan}} · 支払い {{method}}',
    'Opening checkout…': '決済画面を開いています…',
    'Retry original purchase': '元の購入を再試行',
    'Continue to checkout': '決済へ進む',
    'Check purchase status': '購入状況を確認',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      'ブラウザーのストレージが利用できず、再読み込み後の復元は制限されます。ページを閉じた場合は加盟店で注文をご確認ください。',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      '購入アクセスが無効、取り消し済み、または別のウィンドウで使用済みです。加盟店で購入状況をご確認ください。',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      '購入アクセスの有効期限が切れました。再開する前に加盟店で注文をご確認ください。',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      'この購入は別の選択内容で処理されています。状況を確認するか加盟店に戻ってください。二重に支払わないでください。',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      'これらの購入オプションは利用できません。再開する前に購入状況を確認するか加盟店へお問い合わせください。',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      'リクエストの結果を確認できませんでした。同じ購入を再試行するか状況を確認してください。別の支払いは開始しないでください。',
  },
  ru: {
    'Choose your subscription': 'Выберите подписку',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      'Одна покупка на ссылку. Итоговый статус оплаты и выдачи указан на странице оплаты.',
    'Loading purchase options…': 'Загрузка вариантов покупки…',
    'Purchase access expires': 'Срок доступа к покупке',
    'An order already exists for this purchase':
      'Для этой покупки уже есть заказ',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      'Продолжите этот заказ, не создавайте новую покупку. Если вы уже оплатили, дождитесь проверки.',
    'Resume checkout / view order': 'Продолжить оплату / открыть заказ',
    'No purchase options are available': 'Нет доступных вариантов покупки',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      'Сейчас у продавца нет доступных тарифов или способов оплаты. Вернитесь к продавцу или проверьте позже.',
    'One calendar month': 'Один календарный месяц',
    'Unlimited quota': 'Неограниченная квота',
    'Internal quota units: {{amount}}': 'Внутренние единицы квоты: {{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      'Лимит тарифа: {{rpm}} запросов/мин',
    'Payment method': 'Способ оплаты',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      'Исходные параметры зафиксированы для безопасного повтора. Новую покупку нужно начинать у продавца.',
    'Original plan {{plan}} · payment {{method}}':
      'Исходный тариф {{plan}} · оплата {{method}}',
    'Opening checkout…': 'Открытие страницы оплаты…',
    'Retry original purchase': 'Повторить исходную покупку',
    'Continue to checkout': 'Перейти к оплате',
    'Check purchase status': 'Проверить статус покупки',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      'Хранилище браузера недоступно. Восстановление после обновления ограничено; если страница закроется, проверьте заказ у продавца.',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      'Доступ недействителен, отозван или уже использован в другом окне. Проверьте покупку у продавца.',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      'Срок доступа истёк. Проверьте заказ у продавца, прежде чем начинать заново.',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      'Для этой покупки уже выбраны другие параметры. Проверьте статус или вернитесь к продавцу; не платите дважды.',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      'Эти варианты покупки недоступны. Прежде чем начать заново, проверьте статус или свяжитесь с продавцом.',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      'Не удалось подтвердить результат запроса. Повторите ту же покупку или проверьте её статус; не начинайте вторую оплату.',
  },
  vi: {
    'Choose your subscription': 'Chọn gói đăng ký',
    'One purchase per link. Final payment and delivery status are shown in the checkout.':
      'Mỗi liên kết chỉ cho một lần mua. Trạng thái thanh toán và cấp gói cuối cùng được hiển thị tại trang thanh toán.',
    'Loading purchase options…': 'Đang tải tùy chọn mua…',
    'Purchase access expires': 'Thời hạn truy cập mua',
    'An order already exists for this purchase': 'Lần mua này đã có đơn hàng',
    'Resume this order, not a new purchase. If you already paid, wait for verified confirmation.':
      'Tiếp tục đơn hàng này, không mua mới. Nếu đã trả tiền, hãy chờ xác minh.',
    'Resume checkout / view order': 'Tiếp tục thanh toán / xem đơn',
    'No purchase options are available': 'Không có tùy chọn mua',
    'The merchant has no payable plans or payment methods right now. Return to the merchant or check again later.':
      'Hiện người bán không có gói hoặc phương thức thanh toán khả dụng. Hãy quay lại người bán hoặc kiểm tra sau.',
    'One calendar month': 'Một tháng theo lịch',
    'Unlimited quota': 'Hạn mức không giới hạn',
    'Internal quota units: {{amount}}': 'Đơn vị hạn mức nội bộ: {{amount}}',
    'Plan rate limit: {{rpm}} requests/min':
      'Giới hạn gói: {{rpm}} yêu cầu/phút',
    'Payment method': 'Phương thức thanh toán',
    'Your original options are locked for safe retry. A new purchase must start from the merchant.':
      'Tùy chọn ban đầu đã được khóa để thử lại an toàn. Mua mới phải bắt đầu từ người bán.',
    'Original plan {{plan}} · payment {{method}}':
      'Gói ban đầu {{plan}} · thanh toán {{method}}',
    'Opening checkout…': 'Đang mở trang thanh toán…',
    'Retry original purchase': 'Thử lại lần mua ban đầu',
    'Continue to checkout': 'Tiếp tục đến thanh toán',
    'Check purchase status': 'Kiểm tra trạng thái mua',
    'Browser storage is unavailable. Refresh recovery is limited; return to the merchant to check your order if this page closes.':
      'Bộ nhớ trình duyệt không khả dụng. Khả năng khôi phục sau khi tải lại bị hạn chế; nếu trang đóng, hãy kiểm tra đơn tại người bán.',
    'Purchase access is invalid, revoked or already used in another window. Return to the merchant to check your purchase.':
      'Quyền mua không hợp lệ, đã bị thu hồi hoặc đã dùng ở cửa sổ khác. Hãy quay lại người bán để kiểm tra.',
    'Purchase access has expired. Return to the merchant to check your order before starting again.':
      'Quyền mua đã hết hạn. Hãy kiểm tra đơn tại người bán trước khi bắt đầu lại.',
    'This purchase already uses different options. Check its status or return to the merchant; do not pay twice.':
      'Lần mua này đã dùng tùy chọn khác. Hãy kiểm tra trạng thái hoặc quay lại người bán; không trả tiền hai lần.',
    'These purchase options are unavailable. Check purchase status or contact the merchant before starting again.':
      'Các tùy chọn mua này không khả dụng. Hãy kiểm tra trạng thái hoặc liên hệ người bán trước khi bắt đầu lại.',
    'The request could not be confirmed. Retry the same purchase or check its status; do not start a second payment.':
      'Không thể xác nhận kết quả yêu cầu. Hãy thử lại cùng lần mua hoặc kiểm tra trạng thái; không tạo thanh toán thứ hai.',
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

  const additions = process.argv.includes('--partner-purchase')
    ? purchaseKeys
    : Object.fromEntries(
        Object.entries(newKeys).map(([locale, values]) => [
          locale,
          { ...values, ...purchaseKeys[locale] },
        ])
      )
  for (const [locale, trans] of Object.entries(additions)) {
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
