# 父任务执行计划（无直接产品代码）

1. 核对三个子任务 PRD/设计/执行计划与本任务 Requirements 一致，配置各自 `implement.jsonl` / `check.jsonl`、验证后逐一 `task.py start`，不直接启动父任务写业务代码。
2. 先实现 `09-30-payer-manual-issue`，确保历史已批准记录安全领取并修正文案；再实现 `09-30-payer-review-zero-state`，使取消记录不再误导待审核；最后实现 `09-30-payer-topup-preview`，预估要匹配最终计提且不授信。顺序用于减少交叉文件冲突，不表示子任务树自动依赖。
3. 各子任务均按代码变更前检查规约、聚焦回归、`trellis-check`、三库相关验证、规范更新及提交；父任务检查合并后的 UI 术语、历史 API 兼容、支付账务/安全边界、订单 #395/#396 等同等回归。
4. 检查版本与实际运行命令、`git diff --check`、Git 状态和提交；新建的 `.trellis/tasks/` 目录被仓库 `.gitignore` 覆盖，提交本次 Trellis 文件时须明确 `git add -f` 对应任务目录，不能因普通 `git status` 看不到就漏提。完成跨子任务验收后提交父任务规划/整体验收记录并归档。任何不可运行的必需数据库验证都阻塞“完成”声明。
