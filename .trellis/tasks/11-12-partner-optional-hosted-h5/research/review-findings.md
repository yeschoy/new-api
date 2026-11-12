# Whole-feature review and accepted corrections

## Evidence and current status

The first sequential implementation/review workflow completed successfully (run `146ccba0-a3aa-460f-83a1-7bf639c6dc68`). Backend and frontend code/tests/docs are written; no commit or production operation occurred. Independent review returned needs-fixes. Parent read the reports and actual model/controller/frontend source and confirmed all three concrete findings. Fixes below restore the already-approved behavior, not a scope expansion. Follow-up workflow `959024e1-4c69-4a88-85b7-458d24b97c23` implemented them and independently marked F1/F2/F3 RESOLVED, no new concrete P0/P1/P2. Parent frontend/static/local-browser passes and outstanding runtime gates are recorded in verification-2026-11-12.md.

Authoritative external review: `/Users/lyh_god/.pi/agent/sessions/--Users-lyh_god-GolandProjects-new-api--/subagent-artifacts/outputs/146ccba0-a3aa-460f-83a1-7bf639c6dc68/review/hosted-h5-whole-feature.md`.

## F1 — P1, accepted: failed preparation -> refresh recovery dead end

- Source: H5 suppresses POST whenever `catalog.order` exists and directly links to the read-only cashier. Backend persists the pending order before gateway preparation; after a 503 the original order can therefore exist without QR/payment URL.
- Correct behavior: an explicit resume/retry of an unexpired pending order POSTs the original order's authoritative plan/method through the same session order endpoint before navigation. Freeze identity, not a dead-end link. No new purchase, no mutating GET, no arbitrary option changes.
- Required regression: preparation failure -> persisted pending order -> status refresh/remount -> explicit resume -> exact original POST -> prepared same order/amount/deadline. Also retain prepared/paid/expired paths.

## F2 — P1, accepted: purchase authority not checked at order mutation time

- Source: H5 authorizes before reading JSON, then calls the existing order creator without session context. A delayed body or tenant-lock wait can cross expiry/secret rotation. The order transaction checks enabled tenant, but not session deadline or snapshot.
- Correct behavior: guarded H5 order entry must re-read/validate session capability, redemption/nonce, tenant binding/current secret and a fresh clock under the transaction's tenant lock, before new order insertion or capability-bearing replay return. Preserve original merchant API and keep gateway I/O outside transactions.
- A check immediately after body reading is insufficient for lock-wait races. The existing fast prior-order return must not bypass the H5 guarded transaction.
- Required regression: controlled body read and/or transaction lock gate rotates secret or expires session before order creation; rejected response and no new order/preparation. Already issued pc_ and durable payment/fulfillment remain independent.

## F3 — P2, accepted: public quota DTO range mismatch

- Source: backend accepts nonnegative signed int64 quotas, but frontend accepts only safe JS integers. A valid plan with 9007199254740992 poisons the entire catalog.
- Correct behavior: represent **new public H5** `total_amount` as a canonical nonnegative decimal string up to signed int64 max. Backend emits it exactly; decoder validates full range and unlimited consistency; rendering uses BigInt/string, never Number rounding. Legacy merchant DTOs and billing limits remain unchanged.
- Required regression: backend-output fixture consumed by frontend, covering zero, MAX_SAFE_INTEGER, 2^53 and int64 max plus invalid/negative/overrange strings. Other plans and resume must remain usable.

## Already observed checks and limitations

- Independent pre-fix frontend suite: 12 files / 216 tests passed; deployment-config tests 4 passed; read-only typechecks, scoped lint, Go formatting and diff whitespace passed. These green tests miss F1/F2/F3's complete cases.
- Backend implementer ran cached Go 1.26.10 offline build/vet successfully, but no Go runtime tests.
- Parent rechecked `docker info` after workflow completion: daemon still unreachable. No host Go tests, daemon startup, new Docker resources or production fallback permitted/performed.
- Parent completed real local mock browser checks and spec/task verification; the user subsequently approved the exact scoped commit/checkpoint with “提交”. The pre-existing dirty guide/private key/reports/Demo/inventory stay excluded.
