# 合入 origin/main 到返现功能分支

## Goal

把已拉取的 `origin/main` 合入当前 `feat/recharge-cashback`，保留两侧已提交的业务与安全契约，并在功能分支上完成合并验证。

## Background / Confirmed Facts

- 合并前工作区干净；目标 `origin/main=d07c08dcd`，共同祖先 `c56b136e3`。主线新入七个提交，涵盖桌面 v2 通知、密钥加速链接和认证中间件测试。
- 只读 `git merge-tree` 预演显示 `.trellis/spec/backend/quality-guidelines.md` 与七语 `web/src/i18n/locales/*.json` 会发生内容冲突；系统设置类型、认证中间件/测试、桌面路由等文件会自动合并，仍须语义核对。
- 本分支先前完整 `make test` 曾有两个过期 Dashboard JWT 用例失败；主线包含修订该测试令牌夹具的提交。必须实际复测，不预设它已修好。
- `origin/main` 是 fork 的生产来源，推送 main 会触发部署。本任务只在当前功能分支进行本地合并，不推送或部署，也不混入只读 `upstream/main` 的同步。

## Requirements

1. 以独立、可追溯的合并提交整合 `origin/main`，使当前分支同时包含新主线与既有返现提交，不丢失两侧代码、规范或多语言内容。
2. 冲突按保留两侧语义解决，尤其保留质量规范既有章节与主线新增 JWT 夹具约定；七语翻译按项目脚本流程合并、同步，防止缺键和被覆盖。
3. 对自动合并的认证、桌面 v2 通知/权限、密钥页面及返现配置做跨层检查，不借合并引入无关业务改动；在受影响范围运行后端、relaykit、前端和真实数据库回归。
4. 数据库相关测试在本任务专用 Docker 容器中执行；记录实际数据库版本、命令、通过/失败/跳过。不得在宿主启动或连接数据库服务，也不得把失败测试报告为通过。
5. 不向 `origin/main` 或其他远端推送、不直接部署、不清理未经用户同意的任务资源；Trellis 记录须纳入 Git。

## Acceptance Criteria

- [ ] `git merge-base --is-ancestor origin/main HEAD` 成功；当前分支原有提交也保留，只有独立的主线合并提交，没有未解决冲突或意外工作区改动。
- [ ] 规范冲突两侧内容、七语翻译键及值被正确保留；系统设置、返现自动审核、桌面通知/权限、密钥加速链接仍能正常构建并通过聚焦回归。
- [ ] 过期 JWT 用例重新执行，完整 `make test`、relaykit 与前端验证结果逐项记录；任何失败都有明确原因，不宣称未验证的三库兼容或安全合规。

## Out of Scope

- 向生产 `main` 推送、合入 `upstream/main`、改造认证架构、修复本次合并无关的存量缺陷。
