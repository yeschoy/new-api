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

/**
 * English for the site pages: the desktop client download and authorization
 * pages, the guides and the error pages. Keys are the Chinese text exactly as
 * written in the code; `{name}` placeholders must match.
 */
const EN_SITE: Record<string, string> = {
  // Desktop client download page
  客户端: 'Client',
  桌面客户端: 'Desktop client',
  '{brand}客户端': '{brand} Client',
  'AI 工作台，现在就在桌面': 'AI workspace, now on your desktop',
  '一个客户端，完成应用接入、模型选择与价格查看。': 'Use one client to connect apps, choose models, and understand every price.',
  下载桌面客户端: 'Download desktop client',
  '下载 Windows 版': 'Download for Windows',
  '下载 macOS 版': 'Download for macOS',
  选择其他版本: 'Choose another version',
  '{brand}客户端深色主题下的“我的应用”总览': '{brand} Client application overview in dark theme',
  '{brand}客户端浅色主题下的“我的应用”总览': '{brand} Client application overview in light theme',
  '你的应用，随时接入': 'Your apps, ready to connect',
  '自动发现支持的桌面应用，无需手动复制设置即可完成接入。': 'Find supported desktop apps and finish setup without copying settings by hand.',
  '{brand}客户端应用接入设置': '{brand} Client application access setup',
  '看清全貌，再做选择': 'Choose with the full picture',
  '接入前即可比较完整模型 ID、线路与计费分组。': 'Compare complete model IDs, routes, and billing groups before connecting.',
  '产品预览中的价格仅作示意，可能随时调整。': 'Pricing shown in the product preview is illustrative and may change.',
  '{brand}客户端的模型与价格选择': '{brand} Client model and pricing choices',
  '浅色或深色，都能舒适专注': 'Comfortable in light or dark',
  '跟随系统主题，始终保持同样清晰的应用工作台。': 'Follow your system theme while keeping the same clear application workspace.',
  浅色: 'Light',
  深色: 'Dark',
  主题: 'Theme',
  选择下载版本: 'Choose your download',
  '无法识别受支持的桌面系统，请在下方选择 Windows 或 macOS 版本。': 'We could not detect a supported desktop system. Choose Windows or macOS below.',
  'Windows 安装程序': 'Windows installer',
  'Windows 10 或更高版本': 'Windows 10 or later',
  'macOS 通用版 DMG': 'Universal macOS DMG',
  'Intel 与 Apple 芯片': 'Intel and Apple silicon',

  // Desktop app authorization page
  官方桌面端连接: 'Official desktop connection',
  '连接{brand}桌面助手': 'Connect {brand} Desktop',
  '桌面助手正在请求在这台电脑上使用你的{brand}账号。': 'The desktop app is asking to use your {brand} account on this computer.',
  '只有当这个连接由你在官方桌面助手中发起时，才继续操作。': 'Only continue if you started this connection in the official desktop app.',
  桌面助手显示的验证码: 'Code shown in the app',
  '连接前，请确认验证码与桌面助手中显示的一致。': 'Make sure this code matches before you connect.',
  查看余额与用量: 'View balance and usage',
  '配置你的 AI 应用': 'Configure your AI apps',
  创建可随时撤销的登录: 'Create a revocable session',
  缺少连接验证码: 'The connection code is missing',
  '请从桌面助手重新打开此页面。': 'Open this page again from the desktop app to continue.',
  这次连接请求已经过期: 'This connection request has expired',
  '请回到桌面助手，重新发起连接。': 'Return to the desktop app and start the connection again.',
  暂时无法确认连接: 'Could not confirm this connection',
  '请检查网络后重试，目前没有授予任何访问权限。': 'Check your connection and try again. No access was granted.',
  暂不连接: 'Do not connect',
  '正在连接…': 'Connecting…',
  连接这台电脑: 'Connect this computer',
  已同意连接: 'Connection approved',
  已拒绝连接: 'Connection declined',
  '现在可以关闭此页面，回到桌面助手继续使用。': 'You can close this page and return to the desktop app.',
  '没有授予任何访问权限，可以关闭此页面。': 'No access was granted. You can close this page.',
  '此次授权允许桌面助手读取和管理你的 API 密钥，但不会透露你的密码。':
    'This approval lets the desktop app read and manage your API keys, but never reveals your password.',
}

export default EN_SITE
