# 总体执行与集成门禁

状态：待用户批准最新完整规划；以下全部未执行。当前及三个子任务保持 planning。

## 0. 进入执行前

- [ ] 完整规划摘要展示 Goal / Scope / Non-goals / AC / Decisions / Risks；取得用户随后明确批准并记录批准对应的版本。
- [ ] 读取 trellis-before-dev、目标层 specs；前端实现还需 shadcn-ui、vercel-react-best-practices，新增文案必须 i18n-translate。
- [ ] 复核 git baseline、四任务父子关系和 implement/check 清单；保留既有私钥/报告/Demo/临时清单，不读取秘密、不 blanket stage。
- [ ] 仅 start 当前实际交付子任务；父任务不作为默认实现目标。若派发子代理必须先满足工具授权，prompt 第一行是 task.py current 得到的 Active task 路径；同 cwd 不并发写入。

## 1. 顺序与依赖

1. [ ] `usage-logs`：交付安全 owner / batch owner / safe options 契约，固化无秘密、禁用/过期不改身份、查错不当普通的测试。
2. [ ] `quota-cny`：在无需新表的条件下实现 converter、三个兼容接口与文档。独立通过精度/终态/配置门禁；之后日志页可调用它。
3. [ ] `usage-logs`：完成新表、两种迁移、三入口分流、管理员读取和所有 self/token 兼容；随后接入 CNY、页面、导航与七语言。
4. [ ] `user-classification`：只消费已交付 owner/options，补 list/search 共用过滤、count、列及 UI，不改 OAuth 合作方协议。
5. [ ] 回到父级做全交付集成检查。不提前归档仍有跨交付或运行阻塞的子任务。

## 2. 验证命令与证据

规划记录检查（可在 planning 运行，不是业务验收）：

```bash
for name in usage-isolation usage-logs quota-cny user-classification; do
  python3 ./.trellis/scripts/task.py validate .trellis/tasks/11-17-partner-$name
done
git diff --check
```

批准后的具体命令由各子 implement 承接。Go 选择器预期为 `^TestPartnerTenant(Usage|QuotaCNY|UserClassification)`，仅在已登记的任务自有 Docker runner 中执行 `go test -mod=readonly ... -count=1 -v`，显式 DSN 指向空的隔离 PostgreSQL。记录实际选择/执行/skip 数和升级/重复迁移证据，禁止宿主机 go test。

前端目标检查采用现有 `bun run test -- <目标路径>`、typecheck、目标 oxlint、build:check、脚本式七语言添加/同步；目标列表见各子计划。不得为规划下载依赖或启动运行资源。

## 3. 父级验收矩阵

| 验收 | 集成证据 |
| --- | --- |
| AC1 | 商户成功/零额/失败单写，普通订阅不误分流，原抑制/收费 consume 不变 |
| AC2/AC4 | 两页同一商户关系，筛选/count/分页/聚合一致，OAuth 旧标签保留 |
| AC3 | 大整数与微额 CNY、无限/终态/无效配置，旧协议快照不变 |
| AC5 | 默认旧历史仍可查，新页切换提示；共享/独立 pq 迁移、清理不扩范围 |
| AC6 | 默认顶部无新商户，全站 quota_data 仍计一次 |
| AC7 | self 列表/stat/requests/summary/export/token 全覆盖；越权负例、跨表 ID 与重试 |
| AC8 | 真实路由匿名/user/admin/root/PAT，安全 options，root-only 管理保持 |

## 4. 检查、提交与交付

- [ ] 每轮实现后按 trellis-check 做目标验证及全差异复核；缺 Docker/pq 不能声称迁移/完整验收通过，不生产兜底。
- [ ] 将真正验证的契约写入对应 spec，区分源码/静态/DOM/真实 pq/浏览器证据；planning 提案不能冒充已实现 spec。
- [ ] 按明确路径提交业务代码、测试、文档及 Trellis 记录；当前 .trellis 被忽略，新规划文件须精确路径 force-add，绝不加入 runtime/secret/reports 等无关内容。
- [ ] 资源创建前登记 TEMPORARY_ARTIFACTS.md；结束只汇报实际产物/运行状态。清理等待用户同意，Trellis 记录永不清理。npm/pnpm 缓存/日志保持 ignore。
- [ ] 本地提交不等于推送/部署；后者没有授权。完成且质量门禁真实满足后再按 finish-work 记录/归档。

## 5. 停止与回滚点

Owner 出现假普通、日志误混写、跨表自身越权、旧 quota 类型改变、迁移不兼容或缺 pq 运行证据均阻塞交付。保留已创建日志表/记录，回滚应用时保留兼容读者；不删除历史、不重发计费、不恢复旧密钥、不启动生产变更。
