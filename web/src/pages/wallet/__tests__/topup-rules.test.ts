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
import { creditQuota, discountOff, methodMin, minTopUp, parseWalletInfo, presetAmounts, usableMethods } from '../topup-rules'

const RAW = {
  enable_online_topup: true,
  enable_stripe_topup: true,
  enable_creem_topup: false,
  enable_waffo_topup: true,
  enable_waffo_pancake_topup: false,
  enable_redemption: true,
  payment_compliance_confirmed: true,
  pay_methods: [
    { name: '支付宝', type: 'alipay', icon: 'SiAlipay' },
    { name: '自定义1', type: 'custom1', min_topup: '50' },
    { name: 'Stripe', type: 'stripe', min_topup: '2' },
    { name: 'Waffo (Global Payment)', type: 'waffo', min_topup: '1' },
    { name: '', type: 'broken' },
  ],
  waffo_pay_methods: [{ name: 'Card', icon: 'credit-card', payMethodType: 'CREDITCARD' }, { name: '' }],
  creem_products: '[{"name":"Starter","productId":"prod_1","price":9.9,"quota":500000,"currency":"EUR"},{"name":"No id"}]',
  min_topup: 5,
  stripe_min_topup: 2,
  waffo_min_topup: 3,
  waffo_pancake_min_topup: 0,
  amount_options: '[10, 50, "x", -1]',
  discount: '{"50": 0.9, "x": 1}',
  topup_link: 'https://shop.example.com',
}

describe('top-up info from /api/user/topup/info', () => {
  it('keeps named methods, drops Waffo from the standard list and reads min_topup strings as numbers', () => {
    const info = parseWalletInfo(RAW)
    expect(info.pay_methods).toEqual([
      { name: '支付宝', type: 'alipay', icon: 'SiAlipay', min_topup: 0 },
      { name: '自定义1', type: 'custom1', icon: undefined, min_topup: 50 },
      { name: 'Stripe', type: 'stripe', icon: undefined, min_topup: 2 },
    ])
    expect(info.waffo_pay_methods).toEqual([{ name: 'Card', icon: 'credit-card' }])
  })

  it('parses Creem products, amount options and discounts that arrive as JSON strings', () => {
    const info = parseWalletInfo(RAW)
    expect(info.creem_products).toEqual([{ name: 'Starter', productId: 'prod_1', price: 9.9, quota: 500000, currency: 'EUR' }])
    expect(info.amount_options).toEqual([10, 50])
    expect(info.discount).toEqual({ 50: 0.9 })
  })

  it('offers epay methods only while the epay gateway is configured', () => {
    expect(usableMethods(parseWalletInfo(RAW)).map((method) => method.type)).toEqual(['alipay', 'custom1', 'stripe'])
    expect(usableMethods(parseWalletInfo({ ...RAW, enable_online_topup: false })).map((method) => method.type)).toEqual(['stripe'])
  })

  it('treats a missing or broken payload as everything switched off', () => {
    const info = parseWalletInfo(undefined)
    expect(info.pay_methods).toEqual([])
    expect(info.enable_online_topup).toBe(false)
    expect(info.enable_redemption).toBe(false)
    expect(info.amount_options).toEqual([])
  })
})

describe('top-up amounts', () => {
  it('starts from the gateway minimum of the first switched-on online gateway', () => {
    expect(minTopUp(parseWalletInfo(RAW))).toBe(5)
    expect(minTopUp(parseWalletInfo({ ...RAW, enable_online_topup: false }))).toBe(2)
    expect(minTopUp(parseWalletInfo({ enable_waffo_topup: true, waffo_min_topup: 0 }))).toBe(1)
  })

  it('offers the configured amounts with their discounts', () => {
    expect(presetAmounts(parseWalletInfo(RAW))).toEqual([
      { value: 10, discount: 1 },
      { value: 50, discount: 0.9 },
    ])
  })

  it('offers multiples of the minimum when no amounts are configured', () => {
    const info = parseWalletInfo({ ...RAW, amount_options: [] })
    expect(presetAmounts(info).map((preset) => preset.value)).toEqual([5, 25, 50, 150, 250, 500, 1500, 2500])
  })

  it('holds epay methods to the site minimum and other gateways to their own', () => {
    const info = parseWalletInfo(RAW)
    expect(methodMin(info, info.pay_methods[0])).toBe(5)
    expect(methodMin(info, info.pay_methods[1])).toBe(50)
    expect(methodMin(info, info.pay_methods[2])).toBe(2)
  })

  it('credits amount × quota per unit, or the amount itself when the site counts in tokens', () => {
    expect(creditQuota(10, 'USD', 500_000)).toBe(5_000_000)
    expect(creditQuota(10, 'CNY', 500_000)).toBe(5_000_000)
    expect(creditQuota(1_000, 'TOKENS', 500_000)).toBe(1_000)
  })

  it('names the share taken off by a discount, and nothing for full price', () => {
    expect(discountOff(0.85)).toBe(15)
    expect(discountOff(1)).toBeNull()
    expect(discountOff(0)).toBeNull()
  })
})
