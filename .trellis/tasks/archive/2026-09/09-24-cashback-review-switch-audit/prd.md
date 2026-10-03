# 核查充值返现审核要求与免审开关

## Goal

回答当前分支中邀请充值返现是否必须人工审核，以及是否已有可配置的免审开关。

## Confirmed Facts

- 支付完成创建返现奖励时，`model/cashback_rewards.go` 中 `ReviewStatus` 固定为 `pending`，奖励处于 `frozen`（无可发额度或欠额可被取消）。
- `model/cashback_state.go` 中管理员审核批准才会使待审核奖励变为 `approved`；到期结算扫描和发放均要求 `approved`，并仍受 T+N、硬阻断、对账等条件限制。
- `setting/operation_setting/cashback_setting.go`、`controller/cashback_config.go` 和 `web/src/features/system-settings/types.ts` 的配置字段均没有审核模式或免审开关；设置表单明确提示每笔奖励都需人工审核。
- `docs/referral-cashback-operations.md` 也说明发放需人工审核通过。上述结论是代码与文档的只读核查，未验证生产环境部署版本。

## Requirements

- 只读说明目前返现奖励的审核与结算条件，区分“充值到账”与“返现发放”。
- 明确回答是否存在免审开关；不将此问题视为已经授权新增功能。

## Acceptance Criteria

- [x] 能依据当前代码路径指出奖励创建时和发放前的审核状态要求。
- [x] 能依据配置定义、API 与管理端表单确认目前没有免审开关。
- [x] 不修改业务代码或实际生产配置。

## Out of Scope

- 新增免审、自动审核功能或更改风控/结算策略。
- 核查线上实际部署版本及实时配置。
