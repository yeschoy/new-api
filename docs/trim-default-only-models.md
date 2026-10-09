# Trim default-only upstream models from user catalogs

## Problem

`/api/pricing` and `/v1/models` (default group) were exposing ~600 models because
channels on the `default` group had full upstream `/v1/models` dumps applied as
abilities. Specialty selling groups already list the models we actually open.

Live snapshot before this change (2026-10-09, `https://yeschoy.com/api/pricing`):

| Metric | Count |
|--------|------:|
| Pricing rows | 596 |
| Only on `default` (upstream residue) | 566 |
| Also on a named selling group (open set) | 30 |
| Desktop client claimed models | ~591 |

## Behavior

When `model.HideDefaultOnlyModels` is `true` (default):

1. `GetGroupEnabledModels("default")` only returns models that are also enabled
   on at least one non-`default` group (and whose channel is enabled when present).
2. `updatePricing` skips models whose enable groups are only `default`.
3. Ability lookups ignore disabled channels.

Named selling groups (`DeepSeek Flash`, `限时国模特价渠道`, `gpt pro纯真自建号池`, …)
are unchanged.

Expected after deploy (same data): **pricing ≈ 30**, default-token `/v1/models` ≈ **30**.

To intentionally publish a model on default alone, also attach it to a named
selling group, or set `HideDefaultOnlyModels = false` (not exposed in admin UI yet).
