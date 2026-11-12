import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createMockAPI } from './mock.mjs';

const orderPattern = /^PTO[A-Za-z0-9]{32}$/;
const keyPattern = /^[A-Za-z0-9_-]{16,64}$/;
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
]);

class DemoError extends Error {
  constructor(status, code, message, retryAfter) {
    super(message);
    Object.assign(this, { status, code, retryAfter });
  }
}

export function readConfig(env = process.env) {
  const mode = env.DEMO_MODE || 'mock';
  if (!['mock', 'live'].includes(mode)) throw new Error('DEMO_MODE must be mock or live');
  const origin = new URL(env.PARTNER_BASE_URL || 'https://yeschoy.com');
  if (origin.protocol !== 'https:' || origin.username || origin.password ||
      origin.pathname !== '/' || origin.search || origin.hash) {
    throw new Error('PARTNER_BASE_URL must be an HTTPS origin without a path or credentials');
  }
  const secret = env.PARTNER_SECRET || '';
  if (mode === 'live' && !/^pt_[A-Za-z0-9]+$/.test(secret)) {
    throw new Error('Live mode requires PARTNER_SECRET (pt_ merchant secret)');
  }
  const externalUserId = (env.DEMO_USER_ID || 'demo-user-1001').trim();
  if (!externalUserId || [...externalUserId].length > 128 || /\p{Cc}/u.test(externalUserId)) {
    throw new Error('DEMO_USER_ID must contain 1–128 characters without control characters');
  }
  const port = Number(env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return { mode, origin: origin.origin, secret, externalUserId, port,
    allowWrites: mode === 'mock' || env.DEMO_ALLOW_WRITES === '1' };
}

async function readJSON(req) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
    throw new DemoError(415, 'invalid_request', '请求必须使用 application/json');
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk.toString('utf8');
    if (Buffer.byteLength(body) > 2048) throw new DemoError(413, 'invalid_request', '请求过大');
  }
  try {
    const value = JSON.parse(body);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new DemoError(400, 'invalid_request', '请求必须是一个 JSON 对象');
  }
}

function onlyFields(body, fields) {
  if (Object.keys(body).some((key) => !fields.includes(key))) {
    throw new DemoError(400, 'invalid_request', '包含未支持的字段');
  }
}

export function createDemoServer(config, fetchImpl = fetch) {
  const mock = createMockAPI(config.externalUserId);
  const csrfToken = randomBytes(24).toString('hex');
  // Never expose or log the returned model key. Production merchants need encrypted storage.
  let credential;

  async function upstream(method, path, body, idempotencyKey) {
    if (config.mode === 'mock') return mock.request(method, path, body, idempotencyKey);
    let response;
    try {
      response = await fetchImpl(`${config.origin}/api/partner/v1${path}`, {
        method, redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${config.secret}`, Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch {
      throw new DemoError(502, 'upstream_unavailable', '连接失败或超时；下单请使用原参数和原幂等键重试');
    }
    let data;
    try { data = await response.json(); } catch {
      throw new DemoError(502, 'invalid_upstream_response', '平台未返回 JSON；请确认部署版本与接口路径');
    }
    if (!response.ok) {
      // Do not reflect arbitrary upstream text, which could contain credentials or HTML.
      const code = /^[a-z_]{1,64}$/.test(data?.error?.code) ? data.error.code : 'upstream_error';
      const requestId = String(data?.request_id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
      const retryAfter = response.headers.get('Retry-After');
      throw new DemoError(response.status, code,
        `平台返回 ${code}${requestId ? `（request_id: ${requestId}）` : ''}`, retryAfter);
    }
    return { status: response.status, data };
  }

  function checkOwner(order) {
    if (!order || !orderPattern.test(order.order_no) || order.external_user_id !== config.externalUserId) {
      throw new DemoError(404, 'order_not_found', '当前演示用户下没有此订单');
    }
    // Explicit safe projection: status responses never return a key/payment URL/capability.
    const fields = ['order_no', 'external_user_id', 'plan_id', 'plan_title', 'amount', 'currency',
      'payment_method', 'payment_status', 'fulfillment_status', 'created_at', 'expires_at', 'subscription_id'];
    return Object.fromEntries(fields.filter((key) => order[key] !== undefined).map((key) => [key, order[key]]));
  }

  function checkCheckout(raw, orderNo) {
    let url;
    try { url = new URL(raw); } catch { throw new DemoError(502, 'invalid_checkout_url', '收银台地址无效'); }
    if (url.protocol !== 'https:' || url.username || url.password ||
        url.pathname !== '/partner/checkout' ||
        url.searchParams.getAll('order_no').length !== 1 || url.searchParams.get('order_no') !== orderNo ||
        !/^#token=pc_[A-Za-z0-9]{64}$/.test(url.hash)) {
      throw new DemoError(502, 'invalid_checkout_url', '收银台地址无效');
    }
    // A dedicated canonical callback origin can differ from the API origin. Do not rewrite it.
    return url.href;
  }

  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    function send(status, data) {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
    }
    try {
      const localOrigin = `http://127.0.0.1:${res.socket.localPort}`;
      // Loopback binding + exact Host/Origin checks prevent DNS rebinding and cross-site writes.
      if (req.headers.host !== new URL(localOrigin).host ||
          (req.headers.origin && req.headers.origin !== localOrigin) ||
          req.headers['sec-fetch-site'] === 'cross-site') {
        throw new DemoError(403, 'local_only', '请从当前进程的 127.0.0.1 地址访问');
      }
      const url = new URL(req.url, localOrigin);
      if (url.search) throw new DemoError(400, 'invalid_request', '不接受查询参数');
      const path = url.pathname;
      if (req.method === 'GET' && assets.has(path)) {
        const [file, type] = assets.get(path);
        res.writeHead(200, { 'Content-Type': type });
        res.end(await readFile(new URL(`./public/${file}`, import.meta.url)));
        return;
      }
      if (req.method === 'GET' && path === '/demo/config') {
        send(200, { mode: config.mode, origin: config.origin, external_user_id: config.externalUserId,
          allow_writes: config.allowWrites, csrf_token: csrfToken });
        return;
      }
      const mutation = !['GET', 'HEAD'].includes(req.method);
      if (mutation && req.headers['x-demo-csrf'] !== csrfToken) {
        throw new DemoError(403, 'invalid_csrf', '请刷新本地页面后重试');
      }
      if (mutation && !config.allowWrites) {
        throw new DemoError(403, 'read_only', '真实模式默认只读；开启写操作需设置 DEMO_ALLOW_WRITES=1 并重启');
      }
      if (req.method === 'GET' && path === '/demo/plans') {
        const result = await upstream('GET', '/plans');
        send(result.status, result.data);
      } else if (req.method === 'GET' && path === '/demo/quota') {
        const result = await upstream('GET', `/accounts/${encodeURIComponent(config.externalUserId)}/subscription/quota`);
        send(result.status, result.data);
      } else if (req.method === 'PUT' && path === '/demo/account') {
        onlyFields(await readJSON(req), []);
        const result = await upstream('PUT', '/accounts', { external_user_id: config.externalUserId });
        if (typeof result.data.api_key !== 'string' || !result.data.api_key.startsWith('sk-')) {
          throw new DemoError(502, 'invalid_upstream_response', '平台未返回可用的模型凭证');
        }
        credential = result.data.api_key;
        send(result.status, { external_user_id: config.externalUserId, created: result.data.created,
          credential_stored: Boolean(credential) });
      } else if (req.method === 'POST' && path === '/demo/orders') {
        const body = await readJSON(req);
        onlyFields(body, ['plan_id', 'payment_method']);
        const key = req.headers['idempotency-key'];
        if (!keyPattern.test(key || '') || !Number.isSafeInteger(body.plan_id) || body.plan_id <= 0 ||
            typeof body.payment_method !== 'string' || !/^[A-Za-z0-9_-]{1,16}$/.test(body.payment_method)) {
          throw new DemoError(400, 'invalid_request', '检查套餐、支付方式和幂等键');
        }
        const result = await upstream('POST', '/subscription-orders',
          { external_user_id: config.externalUserId, ...body }, key);
        const order = checkOwner(result.data);
        send(result.status, { ...order, ...(config.mode === 'live'
          ? { checkout_url: checkCheckout(result.data.checkout_url, order.order_no) } : { mock_checkout: true }) });
      } else if (req.method === 'GET' && path.startsWith('/demo/orders/')) {
        const orderNo = path.slice('/demo/orders/'.length);
        if (!orderPattern.test(orderNo)) throw new DemoError(400, 'invalid_request', '订单号格式错误');
        const result = await upstream('GET', `/subscription-orders/${orderNo}`);
        send(result.status, checkOwner(result.data));
      } else if (req.method === 'POST' && path === '/demo/mock-pay' && config.mode === 'mock') {
        const body = await readJSON(req);
        onlyFields(body, ['order_no']);
        send(200, checkOwner(mock.pay(body.order_no)));
      } else {
        throw new DemoError(404, 'not_found', '接口不存在');
      }
    } catch (error) {
      const status = error instanceof DemoError || error.demo ? error.status : 500;
      if (error.retryAfter && /^\d{1,6}$/.test(error.retryAfter)) res.setHeader('Retry-After', error.retryAfter);
      send(status, { error: { code: status === 500 ? 'demo_error' : error.code,
        message: status === 500 ? '本地 Demo 请求失败' : error.message } });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = readConfig();
  const server = createDemoServer(config);
  server.on('error', () => { console.error('Demo 启动失败，请检查端口是否被占用'); process.exitCode = 1; });
  server.listen(config.port, '127.0.0.1', () => {
    console.log(`商户接入 Demo: http://127.0.0.1:${config.port} (${config.mode}, ${config.allowWrites ? '允许写入' : '只读'})`);
  });
}
