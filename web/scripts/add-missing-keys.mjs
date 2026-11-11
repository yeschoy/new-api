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
