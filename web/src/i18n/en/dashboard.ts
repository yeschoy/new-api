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

/** English for the dashboard pages: overview, usage & costs, flow. */
const EN_DASHBOARD: Record<string, string> = {
  // Shared
  用量数据加载失败: 'Could not load usage data',
  分流数据加载失败: 'Could not load flow data',
  服务状态加载失败: 'Could not load service status',
  性能数据加载失败: 'Could not load performance data',

  // Overview
  '余额、用量、公告与服务状态一览。': 'Your balance, usage, notices and service status at a glance.',
  账户概览: 'Account overview',
  余额充足: 'Healthy balance',
  余额偏低: 'Low balance',
  余额已用完: 'Balance used up',
  近期没有用量: 'No recent usage',
  '预计可用不足 1 天': 'Lasts less than a day',
  '预计可用 999+ 天': 'Lasts 999+ days',
  '预计可用约 {days} 天': 'Lasts about {days} days',
  历史消费: 'Total spent',
  '近 24 小时消费': 'Spend, last 24 hours',
  '近 24 小时请求': 'Requests, last 24 hours',
  今日节省: 'Saved today',
  按分组倍率相对原价节省: 'Versus base prices, at your group rates',
  '订阅消耗 {amount}': 'Subscription usage: {amount}',
  开始使用: 'Get started',
  '完成 {done}/3 步': '{done} of 3 steps done',
  已完成: 'Done',
  充值余额: 'Add credit',
  '让请求可以扣费。': 'So your requests can be billed.',
  去充值: 'Add credit',
  '用密钥调用本站接口。': 'Use it to call this API.',
  发起第一次请求: 'Make your first request',
  '在对话页试试，或用密钥从你的应用调用。': 'Try it in Chat, or call the API from your app with your key.',
  去对话: 'Open Chat',
  快速接入: 'Quick connect',
  接口地址: 'Base URL',
  复制接口地址: 'Copy base URL',
  管理密钥: 'Manage keys',
  创建第一个密钥: 'Create your first key',
  公告: 'Announcements',
  平台最新动态与通知: 'Latest updates and notices',
  暂无公告: 'No announcements',
  公告详情: 'Announcement',
  '发布于 {date}': 'Published {date}',
  补充说明: 'More details',
  常见问题: 'FAQ',
  关于接入与计费的常见问题: 'Common questions about access and billing',
  暂无常见问题: 'No questions yet',
  'API 线路': 'API routes',
  已配置的接口地址与延迟测试: 'Configured endpoints, with a latency check',
  '暂无 API 线路': 'No API routes yet',
  测速: 'Test latency',
  '测速中…': 'Testing…',
  无法连接: 'Unreachable',
  外部测速: 'External speed test',
  复制地址: 'Copy URL',
  新窗口打开: 'Open in a new tab',
  服务状态: 'Service status',
  '来自 Uptime Kuma 的监控状态': 'Monitor status from Uptime Kuma',
  暂无监控: 'No monitors yet',
  刷新: 'Refresh',
  正常: 'Up',
  异常: 'Down',
  等待中: 'Pending',
  维护中: 'Maintenance',
  性能健康: 'Performance health',
  '近 24 小时': 'Last 24 hours',
  成功率: 'Success rate',
  平均延迟: 'Average latency',
  吞吐量: 'Throughput',
  流量最高的模型: 'Busiest models',
  暂无性能数据: 'No performance data yet',
}

export default EN_DASHBOARD
