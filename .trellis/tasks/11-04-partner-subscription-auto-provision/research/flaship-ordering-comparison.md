# AdsPower / FlashIP purchasing pattern comparison

## Purpose and limits

The user provided a FlashIP purchase-dialog screenshot inside AdsPower and asked whether its workflow resembles the desired merchant integration. This is requirements research, not approval of any settlement/UI/identity design. No authenticated vendor account, live checkout, payment, network interception, or proprietary API inspection was performed.

## Direct screenshot observations

- FlashIP branding and `https://www.flaship.net` appear in the purchase dialog.
- Product choices include static datacenter, static ISP, and dynamic residential proxies; country, quantity, duration, auto-renewal, and order detail controls are visible.
- The selected example is one US static ISP proxy for 30 days. The order summary shows a $7.99 item amount, a $1.15 payment fee, and $9.14 total for Alipay.
- A checkbox offers prioritizing a USD wallet, showing $0.00 available; external methods include Alipay, WeChat Pay, Card, PayPal, and cryptocurrency options.
- This establishes an in-app third-party-product purchasing experience. It does not establish order-number ownership, final merchant of record/fund recipient, wallet ownership, supplier/host settlement or commissions, identity provisioning, OAuth/SSO, iframe versus native UI, or a specific API protocol.

## Public primary sources inspected

1. AdsPower official partner page: https://www.adspower.net/partner/flaship
   - Title: `FlashIP | AdsPower指纹浏览器`.
   - Describes FlashIP as a global proxy service for enterprises and teams and lists its products/use cases. This confirms a public partner/provider association, not its payment backend contract.
2. AdsPower official proxy help: https://help.adspower.com/docs/proxy_list
   - Buy-proxy passage: `AdsPower acts solely as a platform, enabling users to directly place orders with the proxy provider FlashID to purchase proxy and providing management capabilities.`
   - Preserve the source's spelling **FlashID**; do not silently treat that passage as proof of the FlashIP dialog's exact backend.
   - The static-proxy subsection says only USD wallet payments are supported. It mentions refunding failed purchases and retrieving assigned proxies after a delay; auto-renewal notes refer to the Team USD Wallet.
   - This wallet-only documented path differs from the supplied FlashIP screenshot's external payment choices. The paths/version/provider may differ; neither source proves the other is invalid or identifies the screenshot's final settlement mechanism.
3. AdsPower official release note: https://www.adspower.com/release/202502
   - Public text mentions seamless login integration for IPFoxy and Proxy302. This supports the general existence of integrated provider experiences, but is not proof of FlashIP's identity or checkout implementation.
4. FlashIP public partner directory: https://www.flaship.net/partners/
   - Inspected for corroboration; it did not provide a public technical contract for AdsPower ordering or settlement. Absence here is not evidence that the shown integration does not exist.

Initial broad web-search summaries did not find the named integration; later targeted searches found the official AdsPower FlashIP partner page. Search-summary absence is not an authoritative negative claim. Search result records: `mw151slc8k46he`, `mw153xv1yfnx17`.

## Applicable product pattern, not a reverse-engineered claim

The relevant pattern is **partner-hosted product discovery/purchase with supplier-backed fulfillment**, not "merchant independently creates an order and reports a paid flag". For this project the partner merchant is the storefront/integration entry and our platform is the model/subscription supplier.

Recommended project MVP, still requiring approval:

1. Merchant displays plans and identifies its end user.
2. Merchant server authenticates to our platform and submits user identity + plan ID + a retry token.
3. Our platform generates/persists its own order and returns its approved checkout result, potentially a hosted payment URL embeddable/openable from the merchant application.
4. Our platform verifies trusted payment confirmation and fulfills the correct subscription exactly once, provisioning user/key when required.
5. Merchant reads order/entitlement status and obtains the stable user model key. Outbound merchant webhooks and native embedded checkout UI are not implicitly selected.

A **wallet used to purchase an order** and a **wallet used to fund ongoing model usage** are separate product/accounting concerns. Subscription-only model usage does not itself decide whether order payments can use a buyer wallet, payment gateway, or merchant settlement account. Do not introduce a merchant wallet merely because a competitor screenshot shows a wallet option.

## Follow-up hypothesis and project review

The user explicitly requested a best-guess FlashIP implementation and current-project assessment. See `architecture-assessment.md` for hypotheses labeled as unverified and a source-backed correction: the project already has PartnerServer QR/pay-URL ordering and query APIs, but they create wallet top-ups and are separate from Tenant subscription grants. Reuse existing capabilities; do not repeat the earlier overly broad assertion that the project has no merchant order API. This review does not authorize implementation or select a vendor-matching UI/settlement design.

## Remaining decisions

The user has not yet selected the platform payment-link flow, wallet/settlement ownership, hosted versus merchant-built purchase UI, exact identity name/scope/transport, or notification contracts. Ask whether the intended result is merchant-in-app purchase while our platform owns order creation, payment confirmation, and subscription fulfillment; do not move the task to implementation from this screenshot alone.

## Artifacts and safety

Only public pages were read; no purchase buttons, payment submissions, login, or account mutations were performed. Browser-managed snapshot/output spill files are inventoried in the project's `TEMPORARY_ARTIFACTS.md` and require approval before cleanup. This Trellis research document is a retained task record, not a temporary artifact.
