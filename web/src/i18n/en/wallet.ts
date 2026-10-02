/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

/** English for the wallet (/settings/credits): top-up, redemption, subscriptions, invitations, orders. */
const EN_WALLET: Record<string, string> = {
  // Online top-up
  在线充值: 'Add credits',
  充值数量: 'Amount',
  '最低 {min}': 'Minimum {min}',
  到账: 'You get',
  实付: 'You pay',
  '暂无可用的支付方式，请联系管理员。': 'No payment methods are available. Contact the administrator.',
  '本站未开启在线充值，可以使用兑换码充值。': 'Online top-up is off on this site. You can use a redemption code instead.',
  '本站未开启在线充值，请联系管理员。': 'Online top-up is off on this site. Contact the administrator.',
  '到账 {amount}': '{amount} credit',
  确认支付: 'Confirm payment',
  到账额度: 'Credit',
  实付金额: 'Total',
  已优惠: 'Discount',
  商品: 'Product',
  '价格|金额': 'Price',
  '已打开支付页面，支付完成后余额会自动到账': 'Checkout opened. Your balance updates once the payment goes through.',
  获取支付金额失败: 'Could not get the price',
  支付请求失败: 'Could not start the payment',
  支付地址无效: 'The payment address is not valid',

  // Top-up orders
  全站充值记录: 'All users’ top-ups',
  搜索订单号: 'Search order number',
  没有找到匹配的订单: 'No matching orders',
  复制订单号: 'Copy order number',
  '确认补单？': 'Complete this order?',
  补单: 'Complete',
  补单成功: 'Order completed',
  补单失败: 'Could not complete the order',

  // Subscriptions: the user's own
  订阅套餐: 'Subscription plans',
  我的订阅: 'My subscriptions',
  '{count} 个生效中': '{count} active',
  暂无生效的订阅: 'No active subscription',
  '{count} 个已失效': '{count} ended',
  刷新: 'Refresh',
  '还没有订阅，购买下方的套餐即可开通。': 'No subscriptions yet. Buy a plan below to start one.',
  '{plan} · 订阅 #{id}': '{plan} · Subscription #{id}',
  '订阅 #{id}': 'Subscription #{id}',
  生效中: 'Active',
  已取消: 'Cancelled',
  '有效期至 {time}': 'Valid until {time}',
  '已于 {time} 取消': 'Cancelled {time}',
  '已于 {time} 过期': 'Ended {time}',
  '下次重置 {time}': 'Next reset {time}',
  '额度 不限': 'Quota: unlimited',
  '额度 {used} / {total} · 剩余 {left}': 'Quota {used} / {total} · {left} left',
  '已用 {percent}%': '{percent}% used',
  '剩余 {days} 天': '{days} d left',
  获取订阅套餐失败: 'Could not load the plans',
  获取订阅信息失败: 'Could not load your subscriptions',

  // Subscriptions: billing preference
  扣费方式: 'Pay requests with',
  优先使用订阅: 'Subscription first',
  优先使用余额: 'Balance first',
  仅使用订阅: 'Subscription only',
  仅使用余额: 'Balance only',
  '{label}（无生效订阅）': '{label} (no active subscription)',
  '已保存为「{preference}」，但当前没有生效的订阅，将自动使用钱包余额。':
    'Saved as “{preference}”, but with no active subscription your balance pays for now.',
  已保存: 'Saved',

  // Subscriptions: plans on sale and buying one
  暂无可购买的套餐: 'No plans on sale right now',
  推荐: 'Recommended',
  '有效期 {duration}': 'Valid for {duration}',
  '额度重置 {period}': 'Quota resets {period}',
  '总额度 {amount}': 'Total quota {amount}',
  '总额度 不限': 'Total quota: unlimited',
  '限购 {count} 次': 'Limit {count} per user',
  '升级分组 {group}': 'Moves you to group {group}',
  '已购买 {count}/{limit}': 'Bought {count}/{limit}',
  已达购买上限: 'Limit reached',
  立即订阅: 'Subscribe',
  购买订阅: 'Buy a subscription',
  套餐名称: 'Plan',
  有效期: 'Duration',
  重置周期: 'Quota reset',
  套餐额度: 'Plan quota',
  不限: 'Unlimited',
  升级分组: 'Upgrade group',
  应付金额: 'Amount due',
  '已达到该套餐的购买上限（{count}/{limit}）': 'You’ve reached this plan’s purchase limit ({count}/{limit}).',
  需要: 'Needed',
  该套餐不支持用余额购买: 'This plan can’t be paid with balance',
  余额不足: 'Not enough balance',
  用余额支付: 'Pay with balance',
  其他支付方式: 'Other ways to pay',
  支付渠道: 'Payment channel',
  支付: 'Pay',
  订阅成功: 'Subscribed',
  '已打开支付页面，支付完成后订阅会自动生效': 'Checkout opened. Your subscription starts once the payment goes through.',
  购买失败: 'Could not buy the plan',
  '{count} 年': '{count} yr',
  '{count} 个月': '{count} mo',
  '{count} 天': '{count} d',
  '{count} 小时': '{count} h',
  '{count} 分钟': '{count} min',
  '{count} 秒': '{count} s',
  每天: 'daily',
  每周: 'weekly',
  每月: 'monthly',
  '每 {span}': 'every {span}',

  // Invitations (API errors)
  获取邀请码失败: 'Could not load your invite code',
  转入失败: 'Could not transfer',
}

export default EN_WALLET
