# 用户分类执行与验收

状态：**实现、本地隔离验收、本地提交及官方归档完成**。工作记录提交 `3b41b3e13`，官方归档完成于2026-11-18；规划于2026-11-17获批；历史source-only审阅保留，早期Docker阻塞已被后续真实运行解除。父 `final-acceptance.md` 为最终跨页证据，不代表生产部署。

## 实现

- [x] 消费日志child的single/batch safe owner与safe options，无第二套分类/缓存；来源仅主库Tenant account关系，禁用/过期不变普通。
- [x] typed `user_category` / `tenant_id` parser，非法/重复/冲突400；count与rows在同一事务、分页前用同一EXISTS/NOT EXISTS过滤，保留关键词/组/状态/角色/排序/OAuth。
- [x] 按结果页一次batch enrichment，空页0查询，查错503而不是ordinary；只添加三个安全归属字段，不新增角色或持久化身份列。
- [x] users API/schema/独立Tenant URL键/列/toolbar：选ordinary清tenant，选商户切merchant，同一次导航重置页码；不改变旧OAuth维度。
- [x] options走`/api/user/tenant-options`受控搜索/分页/selected_id，admin/root只读，不依赖root管理API；viewer/session/role+全部过滤隔离query和Tenant placeholder。
- [x] 13键七语言经sanctioned writer + i18n:sync，空/错/未知归属/键盘/移动布局覆盖；旧OAuth列/权限/断言保留。

## 验证

- [x] `^TestPartnerTenantUserClassification`：**7顶层/22子测试通过、0skip**，真实PostgreSQL+SetApiRouter权限/PAT；新测试覆盖普通订阅/伪p_/external/subscription_key/禁用/过期/软删除/OAuth双关联，过滤组合/跨页count/排序oracle、空页及每页查询计数。
- [x] 受影响旧model用户分页/OAuth过滤回归在历史Docker无DSN基线对照运行，基线通过的用例在当前仍通过；没有用新增suite替代旧回归，也未隐藏其他基线失败。
- [x] 最终5包联合重跑：CNY15+分类7+模式11+审计9+SubscriptionKey4，**46顶层/45子测试/0失败/0skip**，日志 `runtime-final-integration.log`。
- [x] 前端 `users` 8文件64用例、四目录合计48文件657用例通过；typecheck/build通过，本组定向oxlint/oxfmt通过；全局lint151错误/68警告为既有基线。
- [x] 真实后端浏览器：tenant12只列101/105且105禁用仍商户，与日志页归属一致；ordinary排除成员但保留伪p_；类别联动/后退/刷新；大ID真实请求无舍入；键盘服务端搜索商户+选择；390px无横向溢出、移动卡归属可见。
- [x] 普通管理员/root可读、root-only管理仍403；普通用户新页403且0次商户admin请求；API匿名/用户/admin/root/PAT完整矩阵由真实路由测试证明。
- [x] 原完整差异独立trellis-check已完成，spec更新；父AC2/AC4/AC8集成证据见 `final-acceptance.md`。
- [x] 本轮验收/Trellis记录纳入用户已批准的明确路径文档提交批次（已有业务提交 `9dd775cc2`）。
- [x] 文档已提交 `3b41b3e13`，官方归档至 `archive/2026-11/11-17-partner-user-classification`，task.json=completed；journal在工作/归档提交后单独保存。

## 已披露限制

HTTP组过滤只在model真实pq矩阵测试，controller/router无法直接调用包内列名初始化；并非未实现过滤。关键词`_/%`保持原LIKE通配语义。列表HTTP200 success:false与owner503错误形态、查询失败UI沿用旧空态策略，不在此任务重做通用错误系统。全笛卡尔积不可能穷尽，实际矩阵见verification，不把未执行驱动冒充验证。

## 回滚与资源

仅撤新增读取/filter/UI，不删除/重绑关系，不改角色/权益；共享owner仍被日志使用时保留。实际产物登记 `TEMPORARY_ARTIFACTS.md`，清理须用户同意、Trellis保留，不推送/部署。
