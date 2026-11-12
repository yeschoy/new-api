import { randomBytes } from 'node:crypto';

// In-memory teaching fixture only. This module never contacts a payment provider.
export function createMockAPI(externalUserId) {
  const plans = [
    { id: 101, title: '标准月套餐 · 模拟', price_amount: 99, currency: 'CNY',
      duration_unit: 'month', duration_value: 1, applicable_group: 'demo-exclusive',
      total_amount: 5000000, requests_per_minute: 60, quota_reset_period: 'monthly', max_purchase_per_user: 0 },
    { id: 102, title: '不限量月套餐 · 模拟', price_amount: 199, currency: 'CNY',
      duration_unit: 'month', duration_value: 1, applicable_group: 'demo-exclusive',
      total_amount: 0, requests_per_minute: 120, quota_reset_period: 'monthly', max_purchase_per_user: 0 },
  ];
  const orders = new Map();
  const attempts = new Map();
  const subscriptions = new Map();
  let accountExists = false;
  const fail = (status, code, message) => {
    throw Object.assign(new Error(message), { demo: true, status, code });
  };
  const view = (order) => ({ ...order,
    payment_status: order.payment_status === 'pending' && order.expires_at <= Date.now() / 1000
      ? 'expired' : order.payment_status });

  return {
    request(method, path, body, key) {
      if (method === 'GET' && path === '/plans') return { status: 200, data: { plans } };
      if (method === 'PUT' && path === '/accounts') {
        const created = !accountExists;
        accountExists = true;
        return { status: created ? 201 : 200,
          data: { external_user_id: externalUserId, api_key: 'sk-demo-not-a-real-credential', created } };
      }
      if (method === 'GET' && path.endsWith('/subscription/quota')) {
        if (!accountExists) fail(404, 'account_not_found', '尚未开户；可先模拟购买交付或独立开户');
        return { status: 200, data: { external_user_id: externalUserId,
          subscriptions: [...subscriptions.values()].filter((item) => item.end_time > Date.now() / 1000) } };
      }
      if (method === 'POST' && path === '/subscription-orders') {
        const hash = JSON.stringify(body);
        if (attempts.has(key)) {
          const prior = attempts.get(key);
          if (prior.hash !== hash) fail(409, 'idempotency_conflict', '同一个幂等键不能更换用户、套餐或支付方式');
          return { status: 200, data: view(orders.get(prior.orderNo)) };
        }
        const plan = plans.find((item) => item.id === body.plan_id);
        if (!plan) fail(404, 'plan_not_found', '套餐不存在');
        if (!['alipay', 'wxpay'].includes(body.payment_method)) fail(503, 'payment_unavailable', '模拟仅支持 alipay / wxpay');
        const now = Math.floor(Date.now() / 1000);
        const order = { order_no: `PTO${randomBytes(16).toString('hex')}`, external_user_id: externalUserId,
          plan_id: plan.id, plan_title: plan.title, amount: plan.price_amount.toFixed(2), currency: plan.currency,
          payment_method: body.payment_method, payment_status: 'pending', fulfillment_status: 'not_ready',
          created_at: now, expires_at: now + 1800 };
        orders.set(order.order_no, order);
        attempts.set(key, { hash, orderNo: order.order_no });
        return { status: 201, data: view(order) };
      }
      if (method === 'GET' && path.startsWith('/subscription-orders/')) {
        const order = orders.get(path.slice('/subscription-orders/'.length));
        if (!order) fail(404, 'order_not_found', '订单不存在');
        return { status: 200, data: view(order) };
      }
      fail(404, 'not_found', '模拟接口不存在');
    },
    pay(orderNo) {
      const order = orders.get(orderNo);
      if (!order) fail(404, 'order_not_found', '订单不存在');
      if (order.fulfillment_status !== 'fulfilled') {
        const plan = plans.find((item) => item.id === order.plan_id);
        const now = Math.floor(Date.now() / 1000);
        const previous = subscriptions.get(plan.id);
        const end = new Date(Math.max(now, previous?.end_time || 0) * 1000);
        // Simplified calendar fixture; the platform is authoritative for real renewal dates.
        end.setUTCMonth(end.getUTCMonth() + 1);
        const subscription = previous || { plan_id: plan.id, plan_title: plan.title, start_time: now,
          status: 'active', quota_total: plan.total_amount, quota_used: 0,
          quota_remaining: plan.total_amount, quota_unlimited: plan.total_amount === 0,
          next_reset_time: Math.floor(end.getTime() / 1000) };
        subscription.end_time = Math.floor(end.getTime() / 1000);
        subscriptions.set(plan.id, subscription);
        accountExists = true;
        Object.assign(order, { payment_status: 'paid', fulfillment_status: 'fulfilled', subscription_id: plan.id });
      }
      return view(order);
    },
  };
}
