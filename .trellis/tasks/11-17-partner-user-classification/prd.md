# 用户列表商户归属与分类筛选

## 目标与归属

父任务 `../11-17-partner-usage-isolation/`，承接 R4/R6；AC2/AC4/AC8。在现有管理员用户列表识别真实 Tenant 用户，不新增角色/权限。状态 planning，待完整规划的后续实施批准。

## 需求

- **V1**：新增全部/普通/商户分类、所属商户列及具体商户过滤。
- **V2**：依据真实 Tenant 用户关系，不按 p_ 前缀、用户名、组、余额或有效期猜测；保留禁用/过期商户身份，以及映射尚在的软删除用户归属。
- **V3**：既有 Partner OAuth/Server 合作方列/筛选保持，client_id 不充当 Tenant ID。
- **V4**：分类/商户过滤与 total/count、分页、关键词、组、角色、状态和排序组合一致，过滤在分页前生效。
- **V5**：与商户用量页共用归属语义，不创建账号、重绑历史身份或改变 VIP/角色/禁用/订阅权益。
- **V6**：用户已确认普通管理员/root 均能只读查看归属和商户选项；选项不含密钥/hash/配置，Tenant 管理 API 不因此放宽。

## 证据

`model/partner_tenant.go:48`（唯一 user_id）；`model/user.go:425-515`（列表/count 与 OAuth 过滤）；`controller/user.go:395-435`（现有合作方字段）；`web/src/features/users/components/users-table.tsx:96-192`（OAuth URL/选项）；父研究 `research/current-boundaries.md` 第 5 节及 `research/contract-decisions.md`。

## 验收标准

- **A-V1（AC2/AC4）**：外部/H5 与订阅 Key 用户、禁用/过期以及可见软删除用户正确归属；伪造 p_ 和普通订阅不误分类。
- **A-V2（AC4）**：分类/具体商户与既有过滤组合的 count/行数据一致，排序跨页不重复/漏行；非法/矛盾参数给可解释错误。
- **A-V3（AC2/AC8）**：按页批量安全归属 enrichment，无秘密/N+1/空页全表扫描，日志页和用户页 ID 语义一致。
- **A-V4（AC4）**：保留 partner_client_id/name 及旧合作方筛选，不静默忽略新类别/错误 ID。
- **A-V5（AC4/AC8）**：键盘操作、URL/刷新、筛选重置分页、总数/空态、会话缓存与七语言覆盖；匿名/普通用户不获取管理员归属入口，admin/root 可读，密钥管理仍 root-only。

## 不在范围

新注册/导入、历史身份重绑、角色/VIP/权限修改、商户账户搬迁、OAuth 管理或通用表格系统重做。

## 显式依赖与阶段

先由日志子任务交付安全 Tenant 所属 primitive 和管理员安全选项，再消费同一契约；不能另建不同缓存/按组推断。CNY 子任务不是本任务的前置。实际顺序、验证与回滚见 implement；产品边界已收敛，最终完整摘要获后续明确批准前不 start/修改业务代码。
