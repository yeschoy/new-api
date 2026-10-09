# Partnership ledger sync (vs New API admin APIs)

Target consumer: partnership ledger on `43` (`http://43.134.77.210:8787`), promo partner 李亦铭 → New API user `535`.

Auth (admin):

```
Authorization: Bearer <admin access_token>
New-Api-User: <admin numeric user id>
```

## Readiness matrix

| Ledger need | Endpoint | Status | Notes |
|-------------|----------|--------|-------|
| Channel list + balance + used_quota | `GET /api/channel/` | Ready | Paginate; fields include `balance` (USD), `used_quota`, `models`, `group` |
| Refresh upstream balances | `GET /api/channel/update_balance` / `/:id` | Ready | Needs `ChannelOperate`; write snapshots on ledger side |
| Users + inviter | `GET /api/user/` | Ready | `inviter_id`, `aff_code`, `used_quota`, `username` |
| Daily usage by user | `GET /api/data/users?start_timestamp=&end_timestamp=` | **Preferred** | Hourly buckets from `quota_data`; **now returns `user_id`**. Roll up to day on ledger. Optional `group_by=channel` for cost weight. |
| Usage via log sum | `GET /api/log/stat` | Awkward | Single total for filters; N×days calls if per-user — avoid for ~800 users / millions of logs |
| Successful topups | `GET /api/user/topup` | Ready+ | Paginated; **now supports** `status`, `start_timestamp`, `end_timestamp`, `user_id` |
| Station aff rebate | `GET /api/user/self/aff` etc. | Do not mix | Aff quota ≠ partnership cash share |

`QuotaPerUnit` default ≈ `500000` ($1). Ledger should keep `QUOTA_PER_USD` / FX config in sync with production.

Requires `DataExportEnabled` (default true) so `quota_data` is populated; otherwise fall back to carefully capped `log/stat`.

## Branch changes (this PR)

1. `GET /api/data/users` includes `user_id` in group key; optional `group_by=channel`.
2. `GET /api/user/topup` admin list accepts `status` / time / `user_id` filters (keyword search unchanged).

## Recommended first PR scope

- Keep this branch focused on the two additive API fixes above + this doc.
- Do **not** merge/deploy until ledger sync script switches usage path from N×`log/stat` to `GET /api/data/users` (and topups to filtered list).
- No release of New API required for channel/user sync already possible with token alone.

## Suggested ledger sync order

1. Channels (+ optional `update_balance` for drafts)
2. Users (build inviter map; bind promoters like 535)
3. `GET /api/data/users` for lookback window → `usage_daily`
4. `GET /api/user/topup?status=success&start_timestamp=&end_timestamp=` → recharge events
5. Settlement drafts on ledger only
