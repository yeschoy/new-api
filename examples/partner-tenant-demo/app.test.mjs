import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Execute the actual browser module, with only DOM/network/storage/timers replaced.
const source = await readFile(new URL('./public/app.js', import.meta.url), 'utf8');
const buyer = 'demo-user-1001';
const orderA = `PTO${'a'.repeat(32)}`;
const orderB = `PTO${'b'.repeat(32)}`;
const checkoutA = `https://cashier.example/partner/checkout?order_no=${orderA}#token=pc_${'c'.repeat(64)}`;
const storageKey = `partner-demo:live:https://platform.example:${buyer}`;
const order = (orderNo, extra = {}) => ({ order_no: orderNo, external_user_id: buyer,
  plan_id: 101, payment_method: 'alipay', payment_status: 'pending', fulfillment_status: 'not_ready', ...extra });
const flush = () => new Promise((resolve) => setImmediate(resolve));

class Element {
  value = '';
  hidden = false;
  disabled = false;
  textContent = '';
  href = '';
  options = [];
  handlers = new Map();

  addEventListener(name, handler) { this.handlers.set(name, handler); }
  replaceChildren(...items) { this.options = [...items]; }
  append(...items) { this.options.push(...items); }
  removeAttribute(name) { if (name === 'href') this.href = ''; }
}

async function boot({ saved = new Map(), create, query } = {}) {
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  node('method').value = 'alipay';
  node('checkout').hidden = true;
  node('mock-pay').hidden = true;
  const requests = [];
  const timers = new Map();
  let timerId = 0;
  const fetch = async (path, options = {}) => {
    requests.push({ path, options });
    if (path === '/demo/config') return Response.json({ mode: 'live', origin: 'https://platform.example',
      external_user_id: buyer, allow_writes: true, csrf_token: 'test-only-csrf' });
    if (path === '/demo/plans') return Response.json({ plans: [{ id: 101, title: 'Test',
      currency: 'CNY', price_amount: 99, total_amount: 100, requests_per_minute: 60 }] });
    if (path === '/demo/orders' && options.method === 'POST') {
      return create ? create(options) : Response.json(order(orderA, { checkout_url: checkoutA }), { status: 201 });
    }
    if (path.startsWith('/demo/orders/')) {
      const orderNo = path.slice('/demo/orders/'.length);
      return query ? query(orderNo) : Response.json(order(orderNo));
    }
    throw new Error(`Unexpected fixture request: ${path}`);
  };
  const context = {
    document: { getElementById: node, createElement: () => new Element(), hidden: false, addEventListener() {} },
    window: { addEventListener() {} },
    sessionStorage: { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
    Option: function Option(text, value) { return { text, value: String(value), disabled: false }; },
    fetch, Response, AbortSignal,
    crypto: { randomUUID: () => '12345678-1234-1234-1234-123456789abc' },
    confirm: () => true,
    setTimeout: (callback) => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: (id) => timers.delete(id),
  };
  await vm.runInNewContext(`(async () => {${source}\n})()`, context);
  node('plan').value = '101';
  async function fire(id, event = 'click') {
    const handler = node(id).handlers.get(event);
    assert.equal(typeof handler, 'function', `${id} must handle ${event}`);
    await handler({ preventDefault() {} });
    await flush();
  }
  return { node, saved, requests, timers, fire };
}

function assertNoCheckout(app) {
  assert.equal(app.node('checkout').hidden, true);
  assert.equal(app.node('checkout').href, '');
}

test('querying a different order clears the original checkout before the response arrives', async () => {
  let release;
  const app = await boot({ query: (id) => id === orderB
    ? new Promise((resolve) => { release = resolve; }) : Response.json(order(id)) });
  await app.fire('purchase', 'submit');
  assert.equal(app.node('checkout').hidden, false);
  assert.equal(app.node('checkout').href, checkoutA);
  // A same-order pending status response must preserve the valid checkout link.
  await app.fire('query');
  assert.equal(app.node('checkout').hidden, false);
  app.node('order-no').value = orderB;
  await app.fire('query');
  assertNoCheckout(app);
  release(Response.json(order(orderB)));
  await flush();
  assert.equal(app.node('order-no').value, orderB);
  assertNoCheckout(app);
});

test('editing the order number invalidates checkout and cancels old polling responses', async () => {
  let release;
  let delayed = false;
  const app = await boot({ query: (id) => delayed
    ? new Promise((resolve) => { release = resolve; }) : Response.json(order(id)) });
  await app.fire('purchase', 'submit');
  delayed = true;
  await app.fire('query');
  app.node('order-no').value = orderB;
  await app.fire('order-no', 'input');
  assertNoCheckout(app);
  assert.equal(app.timers.size, 0);
  release(Response.json(order(orderA)));
  await flush();
  assert.equal(app.node('order-no').value, orderB);
  assertNoCheckout(app);
});

test('a failed query for another order cannot leave the original checkout available', async () => {
  const app = await boot({ query: (id) => id === orderB
    ? Response.json({ error: { code: 'order_not_found', message: 'Not found' } }, { status: 404 })
    : Response.json(order(id)) });
  await app.fire('purchase', 'submit');
  app.node('order-no').value = orderB;
  await app.fire('query');
  assertNoCheckout(app);
  assert.match(app.node('result').textContent, /order_not_found/);
});

test('non-pending payment states clear checkout for the same order', async (t) => {
  for (const state of [
    { payment_status: 'paid', fulfillment_status: 'pending' },
    { payment_status: 'paid', fulfillment_status: 'fulfilled' },
    { payment_status: 'expired' },
    { payment_status: 'failed' },
  ]) {
    await t.test(`${state.payment_status}/${state.fulfillment_status || 'not_ready'}`, async () => {
      let current = {};
      const app = await boot({ query: (id) => Response.json(order(id, current)) });
      await app.fire('purchase', 'submit');
      current = state;
      await app.fire('query');
      assertNoCheckout(app);
    });
  }
});

test('replaying an already-paid order does not re-enable its checkout', async () => {
  const paid = order(orderA, { payment_status: 'paid', fulfillment_status: 'fulfilled' });
  const app = await boot({ create: () => Response.json({ ...paid, checkout_url: checkoutA }),
    query: () => Response.json(paid) });
  await app.fire('purchase', 'submit');
  assertNoCheckout(app);
  assert.match(app.node('order-status').textContent, /套餐已交付/);
});

test('a query cannot bind another order to a failed purchase intent; same-key retry and reload restore A', async () => {
  let creates = 0;
  const app = await boot({ create: () => ++creates === 1
    ? Response.json({ error: { code: 'payment_unavailable', message: 'Prepare failed' } }, { status: 503 })
    : Response.json(order(orderA, { checkout_url: checkoutA })) });
  await app.fire('purchase', 'submit');
  const original = JSON.parse(app.saved.get(storageKey));
  assert.equal(original.order_no, undefined);
  app.node('order-no').value = orderB;
  await app.fire('query');
  assert.equal(app.node('order-no').value, orderB);
  assert.deepEqual(JSON.parse(app.saved.get(storageKey)), original);
  await app.fire('purchase', 'submit');
  const restored = JSON.parse(app.saved.get(storageKey));
  assert.equal(restored.order_no, orderA);
  assert.equal(restored.key, original.key);
  const posts = app.requests.filter((item) => item.options.method === 'POST');
  assert.equal(posts.length, 2);
  assert.equal(posts[0].options.body, posts[1].options.body);
  assert.equal(posts[0].options.headers['Idempotency-Key'], posts[1].options.headers['Idempotency-Key']);
  const reloaded = await boot({ saved: app.saved });
  assert.equal(reloaded.node('order-no').value, orderA);
  assert.equal(reloaded.node('idempotency').value, original.key);
  assert.equal(reloaded.node('checkout').href, '');
});

test('create replay repairs an old mismatched draft, while queries leave the binding unchanged', async () => {
  const saved = new Map([[storageKey, JSON.stringify({ key: 'demo_purchase_00000001',
    plan_id: 101, payment_method: 'alipay', order_no: orderB })]]);
  const app = await boot({ saved });
  await app.fire('purchase', 'submit');
  assert.equal(JSON.parse(saved.get(storageKey)).order_no, orderA);
  app.node('order-no').value = orderB;
  await app.fire('query');
  assert.equal(JSON.parse(saved.get(storageKey)).order_no, orderA);
});

test('a create response invalidates an older manual query started while creation was pending', async () => {
  let finishCreate;
  let finishQuery;
  const app = await boot({
    create: () => new Promise((resolve) => { finishCreate = resolve; }),
    query: (id) => id === orderB ? new Promise((resolve) => { finishQuery = resolve; }) : Response.json(order(id)),
  });
  const creating = app.fire('purchase', 'submit');
  await flush();
  app.node('order-no').value = orderB;
  await app.fire('query');
  finishCreate(Response.json(order(orderA, { checkout_url: checkoutA })));
  await creating;
  finishQuery(Response.json(order(orderB)));
  await flush();
  assert.equal(app.node('order-no').value, orderA);
  assert.equal(app.node('checkout').href, checkoutA);
  assert.equal(app.node('checkout').hidden, false);
  assert.equal(JSON.parse(app.saved.get(storageKey)).order_no, orderA);
});

test('starting a new purchase clears checkout and its association', async () => {
  const app = await boot();
  await app.fire('purchase', 'submit');
  await app.fire('new-attempt');
  assertNoCheckout(app);
  assert.equal(app.node('order-no').value, '');
  assert.equal(JSON.parse(app.saved.get(storageKey)), null);
});
