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

/** English for the account area: sign-in extras, password recovery, profile and security. */
const EN_ACCOUNT: Record<string, string> = {
  // Shared auth pieces
  或: 'or',
  请先完成人机验证: 'Complete the human check first',

  // Password recovery
  '输入注册邮箱，我们会发送一封重置密码的邮件。': 'Enter the email you signed up with and we’ll send you a link to reset your password.',
  '想起密码了？': 'Remembered your password?',
  '如果该邮箱已注册，重置邮件已发出，请查收。': 'If this email is registered, a reset link is on its way. Check your inbox.',
  '{seconds} 秒后可重新发送': 'Resend in {seconds}s',
  发送重置邮件: 'Send reset email',
  重置失败: 'Could not reset the password',
  '重置链接无效，请重新找回密码。': 'This reset link is invalid. Please request a new one.',
  重新找回密码: 'Request a new link',
  '密码已重置，请用新密码登录，并尽快在账户安全中修改。':
    'Your password has been reset. Sign in with the new password and change it soon under Security.',
  新密码: 'New password',
  已自动复制到剪贴板: 'Copied to your clipboard',
  '确认后会为你生成一个新密码。': 'Confirm and a new password will be generated for you.',
  账户邮箱: 'Account email',
  确认重置: 'Confirm reset',
}

export default EN_ACCOUNT
