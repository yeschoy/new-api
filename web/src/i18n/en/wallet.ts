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
  价格: 'Price',
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

  // Invitations (API errors)
  获取邀请码失败: 'Could not load your invite code',
  转入失败: 'Could not transfer',
}

export default EN_WALLET
