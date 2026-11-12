const $ = (id) => document.getElementById(id);
let config;
let draft;
let storageKey;
let checkoutOrderNo;
let timer;
let creating = false;
let pollGeneration = 0;
let pollUntil = 0;

async function api(path, method = 'GET', body, key) {
  const response = await fetch(`/demo${path}`, {
    method, cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(20_000),
    headers: { ...(body ? { 'Content-Type': 'application/json', 'X-Demo-CSRF': config.csrf_token } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${response.status} ${data.error?.code}: ${data.error?.message}`);
  return data;
}

function result(data) {
  // A checkout capability belongs only in the explicit checkout link, never the debug panel/storage.
  const safe = { ...data };
  for (const key of ['checkout_url', 'csrf_token', 'api_key']) delete safe[key];
  $('result').textContent = JSON.stringify(safe, null, 2);
}
function error(err) { $('result').textContent = err.message || '请求失败，请检查本地服务'; }
function saveDraft() {
  try { sessionStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Browser storage may be disabled. */ }
}
function lockDraft() {
  $('plan').disabled = Boolean(draft) || !config.allow_writes;
  $('method').disabled = Boolean(draft) || !config.allow_writes;
  $('idempotency').value = draft?.key || '';
}
function stopPolling() {
  clearTimeout(timer);
  pollGeneration += 1;
}
function clearCheckout() {
  checkoutOrderNo = undefined;
  $('checkout').hidden = true;
  $('checkout').removeAttribute('href');
}
function showOrder(order) {
  if (checkoutOrderNo !== order.order_no || order.payment_status !== 'pending') clearCheckout();
  $('order-no').value = order.order_no;
  const delivered = order.payment_status === 'paid' && order.fulfillment_status === 'fulfilled';
  $('order-status').textContent = delivered ? '已付款 · 套餐已交付，可查询订阅额度。'
    : order.payment_status === 'paid' ? `已付款 · ${order.fulfillment_status}；等待平台恢复交付，不要再次付款。`
    : `付款：${order.payment_status} / 交付：${order.fulfillment_status}`;
  $('mock-pay').hidden = config.mode !== 'mock';
  $('mock-pay').disabled = order.payment_status !== 'pending';
  result(order);
  return delivered || ['expired', 'failed'].includes(order.payment_status);
}

async function queryOrder(generation, orderNo) {
  try {
    const order = await api(`/orders/${encodeURIComponent(orderNo)}`);
    if (generation !== pollGeneration) return;
    if (showOrder(order) || Date.now() >= pollUntil || document.hidden) return;
    timer = setTimeout(() => queryOrder(generation, orderNo), 5000);
  } catch (err) {
    if (generation === pollGeneration) error(err); // Manual retry; no overlapping/error loop.
  }
}
function startPolling() {
  stopPolling();
  const orderNo = $('order-no').value.trim();
  if (checkoutOrderNo !== orderNo) clearCheckout();
  pollUntil = Date.now() + 15 * 60_000;
  queryOrder(pollGeneration, orderNo);
}

async function loadPlans() {
  const data = await api('/plans');
  if (!Array.isArray(data.plans)) throw new Error('平台未返回 plans 数组，请确认部署版本');
  $('plans').replaceChildren();
  $('plan').replaceChildren(new Option('请选择套餐', ''));
  for (const plan of data.plans) {
    const supported = plan.currency === 'CNY' && Number(plan.price_amount) > 0;
    const card = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = plan.title;
    const price = document.createElement('p');
    price.className = 'price';
    price.textContent = `${plan.currency} ${Number(plan.price_amount).toFixed(2)} / 月`;
    const desc = document.createElement('p');
    desc.className = 'muted';
    desc.textContent = `${plan.total_amount === 0 ? '不限量' : `${plan.total_amount} 额度单位`} · ${plan.requests_per_minute || '不设套餐级'} RPM`;
    const note = document.createElement('p');
    note.className = supported ? 'muted' : 'warning';
    note.textContent = supported ? `套餐 ID ${plan.id} · 每月重置` : '当前收银台仅支持 CNY，请联系平台重新定价，不能自动换算。';
    card.append(title, price, desc, note);
    $('plans').append(card);
    const option = new Option(`${plan.title}（${plan.currency} ${plan.price_amount}）`, plan.id);
    option.disabled = !supported;
    $('plan').append(option);
  }
  if (!data.plans.length) $('plans').textContent = '暂无可用套餐，请联系平台为本商户配置套餐。';
  if (draft) {
    if (![...$('plan').options].some((item) => item.value === String(draft.plan_id))) {
      $('plan').append(new Option(`原购买套餐 #${draft.plan_id}`, draft.plan_id));
    }
    $('plan').value = String(draft.plan_id);
  }
  result(data);
}

$('purchase').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (creating || !config?.allow_writes) return;
  if (config.mode === 'live' && !confirm('将为当前用户创建真实待付款订单（不会自动付款），确定继续？')) return;
  if (!draft) {
    draft = { key: `demo_${crypto.randomUUID().replaceAll('-', '')}`,
      plan_id: Number($('plan').value), payment_method: $('method').value.trim() };
    saveDraft();
  }
  const purchase = draft;
  lockDraft();
  stopPolling();
  clearCheckout();
  creating = true;
  $('create').disabled = true;
  $('new-attempt').disabled = true;
  try {
    const order = await api('/orders', 'POST', { plan_id: purchase.plan_id, payment_method: purchase.payment_method }, purchase.key);
    if (draft !== purchase) return;
    // Only the create/replay response can associate an order with this intent.
    purchase.order_no = order.order_no;
    saveDraft();
    stopPolling();
    showOrder(order);
    if (order.payment_status === 'pending' && order.checkout_url) {
      checkoutOrderNo = order.order_no;
      $('checkout').href = order.checkout_url;
      $('checkout').hidden = false;
    }
    startPolling();
  } catch (err) { error(err); } finally {
    creating = false;
    $('create').disabled = !config.allow_writes;
    $('new-attempt').disabled = false;
  }
});
$('new-attempt').addEventListener('click', () => {
  if (draft && !confirm('这不会取消原订单。请先核对原单，确认是新的购买需求而非超时重试。继续？')) return;
  stopPolling();
  draft = null;
  saveDraft();
  lockDraft();
  clearCheckout();
  $('mock-pay').hidden = true;
  $('order-no').value = '';
  $('order-status').textContent = '已开始新的购买意图；原订单不会被取消。';
});
$('reload').addEventListener('click', () => loadPlans().catch(error));
$('query').addEventListener('click', startPolling);
$('order-no').addEventListener('input', () => {
  stopPolling();
  clearCheckout();
});
$('stop').addEventListener('click', stopPolling);
$('account').addEventListener('click', async () => {
  if (config.mode === 'live' && !confirm('将创建真实账号并在本地后端内存保存 Key；不会赠送套餐，确定继续？')) return;
  try { result(await api('/account', 'PUT', {})); } catch (err) { error(err); }
});
$('quota').addEventListener('click', async () => {
  try {
    const data = await api('/quota');
    $('quota-result').textContent = data.subscriptions.length ? data.subscriptions.map((item) =>
      `${item.plan_title}：${item.quota_unlimited ? '不限量' : `剩余 ${item.quota_remaining} / ${item.quota_total}`}，到期 ${new Date(item.end_time * 1000).toLocaleString()}`
    ).join('\n') : '账号存在，但当前没有有效订阅。';
    result(data);
  } catch (err) { error(err); }
});
$('mock-pay').addEventListener('click', async () => {
  try { showOrder(await api('/mock-pay', 'POST', { order_no: $('order-no').value.trim() })); } catch (err) { error(err); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopPolling(); });
window.addEventListener('pagehide', stopPolling);

try {
  config = await api('/config');
  storageKey = `partner-demo:${config.mode}:${config.origin}:${config.external_user_id}`;
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey));
    if (saved && /^[A-Za-z0-9_-]{16,64}$/.test(saved.key) && Number.isSafeInteger(saved.plan_id) &&
        typeof saved.payment_method === 'string') draft = saved;
  } catch { /* Ignore unavailable storage or invalid local drafts. */ }
  $('mode').textContent = config.mode === 'mock' ? 'MOCK · 无真实支付' : config.allow_writes ? 'LIVE · 已开启真实写入' : 'LIVE · 只读';
  $('notice').textContent = config.mode === 'mock' ? '模拟演示：套餐、订单、付款和额度均为内存数据，不调用真实接口。重启后模拟数据清空。'
    : config.allow_writes ? '已连接真实平台：开户、下单会写入真实数据，操作前需要确认；付款仍须用户在平台收银台完成。'
    : '已连接真实平台，只允许读操作。开户与下单默认关闭；要联调真实写入，需显式配置并重启。';
  $('user').textContent = config.external_user_id;
  $('origin').textContent = config.mode === 'mock' ? '模拟数据 · 不访问平台' : config.origin;
  $('account').disabled = !config.allow_writes;
  $('create').disabled = !config.allow_writes;
  if (draft) {
    $('method').value = draft.payment_method;
    $('order-no').value = draft.order_no || '';
    $('order-status').textContent = draft.order_no
      ? '已恢复原订单号，请查询订单状态；需要恢复收银台链接时使用原键重试。'
      : '已恢复原购买参数与幂等键；结果不确定时请原键重试，不要新建另一笔购买。';
  }
  lockDraft();
  await loadPlans();
} catch (err) {
  error(err);
  $('notice').textContent = '初始化失败，请检查请求结果及本地服务配置。';
}
