import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get as httpGet } from 'node:http';
import { createDemoServer, readConfig } from './server.mjs';

const secret = 'pt_TESTONLYnotarealmerchantsecret';
const orderNo = `PTO${'a'.repeat(32)}`;
const buyer = 'demo-user-1001';
const body = { plan_id: 101, payment_method: 'alipay' };
const idempotencyKey = 'demo_purchase_00000001';
const order = { order_no: orderNo, external_user_id: buyer, plan_id: 101, plan_title: 'Test',
  amount: '99.00', currency: 'CNY', payment_method: 'alipay', payment_status: 'pending',
  fulfillment_status: 'not_ready', created_at: 1800000000, expires_at: 1800001800 };
const liveConfig = (extra = {}) => readConfig({ DEMO_MODE: 'live', PARTNER_SECRET: secret, ...extra });
const response = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...headers },
});

async function boot(t, config = readConfig({}), fetchImpl = () => { throw new Error('Unexpected real network'); }) {
  const server = createDemoServer(config, fetchImpl);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cfg = await (await fetch(`${base}/demo/config`)).json();
  async function call(path, method = 'GET', data, headers = {}) {
    const res = await fetch(`${base}${path}`, {
      method, headers: { 'Content-Type': 'application/json', 'X-Demo-CSRF': cfg.csrf_token, ...headers },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { /* Static asset or deliberately invalid JSON. */ }
    return { status: res.status, headers: res.headers, data: json, text };
  }
  return { call, cfg, base };
}

function createOrder(call, value = body, key = idempotencyKey) {
  return call('/demo/orders', 'POST', value, { 'Idempotency-Key': key });
}

test('configuration is mock by default; live writes are opt-in and secret is required', () => {
  assert.equal(readConfig({}).mode, 'mock');
  assert.equal(liveConfig().allowWrites, false);
  assert.equal(liveConfig({ DEMO_ALLOW_WRITES: 'true' }).allowWrites, false);
  assert.equal(liveConfig({ DEMO_ALLOW_WRITES: '1' }).allowWrites, true);
  assert.throws(() => readConfig({ DEMO_MODE: 'live' }), /PARTNER_SECRET/);
  assert.throws(() => readConfig({ DEMO_MODE: 'other' }), /DEMO_MODE/);
  for (const value of ['http://example.com', 'https://example.com/v1', 'https://user:pass@example.com',
    'https://example.com?secret=x', 'https://example.com/#token=x']) {
    assert.throws(() => readConfig({ PARTNER_BASE_URL: value }));
  }
  for (const value of [' ', 'a\nb', 'x'.repeat(129)]) assert.throws(() => readConfig({ DEMO_USER_ID: value }));
  assert.throws(() => readConfig({ PORT: '0' }));
});

test('mock flow: no account before payment, idempotent creation, delivery, quota, duplicate payment', async (t) => {
  const { call } = await boot(t);
  const plans = await call('/demo/plans');
  assert.equal(plans.status, 200);
  assert.equal(plans.data.plans.length, 2);
  assert.equal((await call('/demo/quota')).data.error.code, 'account_not_found');
  const first = await createOrder(call);
  assert.equal(first.status, 201);
  assert.equal(first.data.payment_status, 'pending');
  assert.equal(first.data.fulfillment_status, 'not_ready');
  assert.equal(first.data.mock_checkout, true);
  assert.equal(first.data.checkout_url, undefined);
  assert.equal((await call('/demo/quota')).status, 404);
  const replay = await createOrder(call);
  assert.equal(replay.status, 200);
  assert.equal(replay.data.order_no, first.data.order_no);
  assert.equal(replay.data.expires_at, first.data.expires_at);
  assert.equal((await createOrder(call, { ...body, plan_id: 102 })).status, 409);
  const paid = await call('/demo/mock-pay', 'POST', { order_no: first.data.order_no });
  assert.equal(paid.data.payment_status, 'paid');
  assert.equal(paid.data.fulfillment_status, 'fulfilled');
  const quota = await call('/demo/quota');
  assert.equal(quota.data.subscriptions[0].quota_remaining, 5000000);
  await call('/demo/mock-pay', 'POST', { order_no: first.data.order_no });
  assert.deepEqual((await call('/demo/quota')).data, quota.data);
  assert.equal((await call(`/demo/orders/${first.data.order_no}`)).data.fulfillment_status, 'fulfilled');
});

test('mock unlimited plan reports true unlimited with zero remaining; renewal does not add quota', async (t) => {
  const { call } = await boot(t);
  const first = await createOrder(call, { ...body, plan_id: 102 });
  await call('/demo/mock-pay', 'POST', { order_no: first.data.order_no });
  const quota = (await call('/demo/quota')).data.subscriptions[0];
  assert.equal(quota.quota_unlimited, true);
  assert.equal(quota.quota_remaining, 0);
  const renewal = await createOrder(call, { ...body, plan_id: 102 }, 'demo_purchase_00000002');
  await call('/demo/mock-pay', 'POST', { order_no: renewal.data.order_no });
  const renewed = (await call('/demo/quota')).data.subscriptions;
  assert.equal(renewed.length, 1);
  assert.ok(renewed[0].end_time > quota.end_time);
  assert.equal(renewed[0].quota_total, quota.quota_total);
});

test('independent account creation is stable, never exposes a key, and grants no subscription', async (t) => {
  const { call } = await boot(t);
  const first = await call('/demo/account', 'PUT', {});
  assert.equal(first.status, 201);
  assert.equal(first.data.credential_stored, true);
  assert.equal(first.data.api_key, undefined);
  assert.equal(first.text.includes('sk-'), false);
  assert.equal((await call('/demo/account', 'PUT', {})).data.created, false);
  assert.deepEqual((await call('/demo/quota')).data.subscriptions, []);
});

test('live mode defaults to read-only and never sends writes upstream', async (t) => {
  const calls = [];
  const { call, cfg } = await boot(t, liveConfig(), async (...args) => {
    calls.push(args);
    return response({ plans: [] });
  });
  assert.equal(cfg.allow_writes, false);
  assert.equal(JSON.stringify(cfg).includes(secret), false);
  assert.equal((await call('/demo/plans')).status, 200);
  for (const [path, method, data] of [['/demo/orders', 'POST', body], ['/demo/account', 'PUT', {}],
    ['/demo/mock-pay', 'POST', { order_no: orderNo }]]) {
    const result = await call(path, method, data);
    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'read_only');
  }
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].method, 'GET');
});

test('live requests keep secret server-side, disable redirects, and preserve idempotency', async (t) => {
  const calls = [];
  const checkout = `https://cashier.example/partner/checkout?order_no=${orderNo}#token=pc_${'b'.repeat(64)}`;
  const { call } = await boot(t, liveConfig({ DEMO_ALLOW_WRITES: '1' }), async (url, options) => {
    calls.push({ url, options });
    return response({ ...order, checkout_url: checkout, api_key: 'sk-should-not-leak', qr_code: 'secret-qr' }, 201);
  });
  const result = await createOrder(call);
  assert.equal(result.status, 201);
  assert.equal(result.data.checkout_url, checkout);
  assert.equal(result.data.api_key, undefined);
  assert.equal(result.data.qr_code, undefined);
  const request = calls[0];
  assert.equal(request.url, 'https://yeschoy.com/api/partner/v1/subscription-orders');
  assert.equal(request.options.redirect, 'error');
  assert.equal(request.options.headers.Authorization, `Bearer ${secret}`);
  assert.equal(request.options.headers['Idempotency-Key'], idempotencyKey);
  assert.deepEqual(JSON.parse(request.options.body), { external_user_id: buyer, ...body });
});

test('live order status strips payment capability and enforces current user ownership', async (t) => {
  let foreign = false;
  const { call } = await boot(t, liveConfig(), async () => response({ ...order,
    external_user_id: foreign ? 'another-user' : buyer,
    checkout_url: 'secret-link', pay_url: 'secret-pay', api_key: 'sk-secret' }));
  const own = await call(`/demo/orders/${orderNo}`);
  assert.equal(own.status, 200);
  assert.equal(own.text.includes('secret'), false);
  foreign = true;
  const rejected = await call(`/demo/orders/${orderNo}`);
  assert.equal(rejected.status, 404);
  assert.equal(rejected.text.includes('another-user'), false);
});

test('external identity cannot be supplied by the browser; malformed writes never reach upstream', async (t) => {
  let count = 0;
  const { call } = await boot(t, liveConfig({ DEMO_ALLOW_WRITES: '1' }), () => { count++; });
  assert.equal((await createOrder(call, { ...body, external_user_id: 'victim' })).status, 400);
  assert.equal((await call('/demo/account', 'PUT', { external_user_id: 'victim' })).status, 400);
  assert.equal((await createOrder(call, body, 'short')).status, 400);
  assert.equal((await createOrder(call, { ...body, plan_id: '101' })).status, 400);
  assert.equal((await createOrder(call, { ...body, payment_method: '../bad' })).status, 400);
  assert.equal((await call('/demo/orders/../../anything')).status, 404);
  assert.equal((await call('/demo/plans?secret=test')).status, 400);
  assert.equal(count, 0);
});

test('server-derived Unicode user identity is encoded as one upstream path segment', async (t) => {
  let seen;
  const { call } = await boot(t, liveConfig({ DEMO_USER_ID: '顾客 / A' }), async (url) => {
    seen = url;
    return response({ external_user_id: '顾客 / A', subscriptions: [] });
  });
  assert.equal((await call('/demo/quota')).status, 200);
  assert.ok(seen.endsWith(`/accounts/${encodeURIComponent('顾客 / A')}/subscription/quota`));
});

test('CSRF, cross-origin and DNS rebinding requests are denied before mutations', async (t) => {
  const { call, base } = await boot(t);
  assert.equal((await call('/demo/account', 'PUT', {}, { 'X-Demo-CSRF': '' })).status, 403);
  assert.equal((await call('/demo/account', 'PUT', {}, { Origin: 'https://attacker.example' })).status, 403);
  // Node fetch normalizes Host; use the HTTP client to send the actual hostile header.
  const hostileHostStatus = await new Promise((resolve, reject) => {
    httpGet(`${base}/demo/plans`, { headers: { Host: 'attacker.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal((await call('/demo/plans', 'GET', undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
});

test('real mode never offers simulated payment, even when writes are enabled', async (t) => {
  const { call } = await boot(t, liveConfig({ DEMO_ALLOW_WRITES: '1' }));
  assert.equal((await call('/demo/mock-pay', 'POST', { order_no: orderNo })).status, 404);
});

test('upstream errors retain code, request ID and Retry-After without reflecting sensitive text', async (t) => {
  const { call } = await boot(t, liveConfig(), async () => response({ error: {
    code: 'rate_limited', message: `sensitive ${secret}` }, request_id: 'request-123' }, 429, { 'Retry-After': '60' }));
  const result = await call('/demo/plans');
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('Retry-After'), '60');
  assert.equal(result.data.error.code, 'rate_limited');
  assert.match(result.data.error.message, /request-123/);
  assert.equal(result.text.includes(secret), false);
});

test('network failure advises same-key retry; non-JSON response is not reflected', async (t) => {
  let html = false;
  const { call } = await boot(t, liveConfig(), async () => {
    if (html) return new Response(`<html>${secret}</html>`);
    throw new Error(`network diagnostic containing ${secret}`);
  });
  const failure = await call('/demo/plans');
  assert.equal(failure.status, 502);
  assert.match(failure.data.error.message, /原幂等键/);
  assert.equal(failure.text.includes(secret), false);
  html = true;
  const nonJSON = await call('/demo/plans');
  assert.equal(nonJSON.data.error.code, 'invalid_upstream_response');
  assert.equal(nonJSON.text.includes(secret), false);
});

test('invalid checkout URL is never delivered to the browser', async (t) => {
  const { call } = await boot(t, liveConfig({ DEMO_ALLOW_WRITES: '1' }), async () => response({ ...order,
    checkout_url: 'javascript:alert(1)' }, 201));
  const result = await createOrder(call);
  assert.equal(result.status, 502);
  assert.equal(result.data.error.code, 'invalid_checkout_url');
});

test('static page has privacy headers; no injected secret or embedded third-party assets', async (t) => {
  const { call } = await boot(t, liveConfig());
  for (const path of ['/', '/app.js', '/style.css']) {
    const result = await call(path);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(result.headers.get('Referrer-Policy'), 'no-referrer');
    assert.equal(result.headers.get('X-Frame-Options'), 'DENY');
    assert.match(result.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.equal(result.text.includes(secret), false);
  }
});
