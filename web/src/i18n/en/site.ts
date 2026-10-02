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
}

export default EN_SITE
