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
  我已阅读并同意: 'I have read and agree to the',
  和: 'and',
  '登录设备过多。请在已登录的设备上打开账户安全，退出其他设备后再试；若无法访问已登录设备，可重置密码以退出全部设备。':
    'Too many devices are signed in. On a signed-in device, open Security and sign out the others, then try again. If you can’t reach one, reset your password to sign out everywhere.',
  '近期登录次数过多，请稍后再试。': 'Too many sign-ins recently. Please try again later.',
  '登录已过期，请重新登录': 'This sign-in has expired. Please start again.',

  // Sign-in options
  '忘记密码？': 'Forgot password?',
  '管理员已关闭所有登录方式，请联系管理员。': 'Sign-in is switched off on this site. Please contact the administrator.',
  '使用 {provider} 继续': 'Continue with {provider}',
  使用微信继续: 'Continue with WeChat',
  '无法发起授权，请稍后重试': 'Could not start the authorization. Please try again later.',
  微信登录: 'Sign in with WeChat',
  '扫码关注公众号，回复“验证码”获取验证码。':
    'Scan the QR code to follow our official account, then send it “验证码” to receive your code.',
  微信公众号二维码: 'WeChat official account QR code',
  '管理员尚未上传公众号二维码。': 'The administrator hasn’t uploaded the QR code yet.',
  '{provider} 登录': 'Sign in with {provider}',
  '点击下方按钮，在 Telegram 中确认登录。': 'Click the button below and confirm in Telegram.',
  'Telegram 组件加载失败，请检查网络后重试。': 'The Telegram widget failed to load. Check your connection and try again.',
  '使用 Passkey 登录': 'Sign in with a passkey',
  '此设备不支持 Passkey': 'This device doesn’t support passkeys',
  'Passkey 登录已取消': 'Passkey sign-in was cancelled',
  'Passkey 登录失败': 'Passkey sign-in failed',
  'Passkey 操作失败': 'The passkey operation failed',
  请输入一个未使用过的备用码: 'Enter one of your unused backup codes',
  备用码: 'Backup code',
  改用备用码: 'Use a backup code',
  改用验证器验证码: 'Use an authenticator code',
  '密码最多 20 位': 'Password must be at most 20 characters',

  // Provider callback (/oauth/:provider)
  微信: 'WeChat',
  '正在通过 {provider} 登录': 'Signing you in with {provider}',
  '正在绑定 {provider} 账号': 'Linking your {provider} account',
  '完成后会自动跳转。': 'You’ll be redirected automatically.',
  '绑定完成后此窗口会自动关闭。': 'This window closes once the account is linked.',
  '正在处理授权结果…': 'Processing the authorization…',
  '授权未完成，请重新登录。': 'The authorization wasn’t completed. Please sign in again.',
  授权失败: 'Authorization failed',
  '发起绑定的页面已关闭，请回到账户安全重试。': 'The page that started the linking was closed. Go back to Security and try again.',
  '绑定超时，请重试。': 'Linking timed out. Please try again.',
  绑定失败: 'Linking failed',
  绑定成功: 'Account linked',
  '{provider} 账号已绑定。': 'Your {provider} account is linked.',
  前往账户安全: 'Go to Security',
  '管理员未开启 Telegram 绑定。': 'Telegram linking is switched off on this site.',
  'Telegram 授权无效或已过期。': 'The Telegram authorization is invalid or has expired.',
  '本次绑定请求已过期或已被使用。': 'This linking request has expired or was already used.',
  '发起绑定的登录状态已失效，请重新登录。': 'The session that started the linking has ended. Please sign in again.',
  '该 Telegram 账号已被其他账户绑定。': 'This Telegram account is already linked to another account.',
  '该账户已不存在。': 'This account no longer exists.',
  '该账户已被禁用。': 'This account has been disabled.',
  'Telegram 绑定失败，请重试。': 'Telegram linking failed. Please try again.',

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
