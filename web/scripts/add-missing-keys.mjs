import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

const LOCALES_DIR = path.resolve('src/i18n/locales')

function stableStringify(obj) {
  return `${JSON.stringify(obj, null, 2)}\n`
}

const newKeys = {
  en: {
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
