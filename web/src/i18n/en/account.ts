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

  // Security page
  '管理登录密码、两步验证、第三方账号与登录设备。': 'Manage your password, two-step verification, linked accounts and signed-in devices.',
  登录密码: 'Password',
  修改登录密码: 'Change your password',
  '修改后，其他设备上的登录会全部退出。': 'Changing it signs you out on every other device.',
  修改密码: 'Change password',
  请输入当前密码: 'Enter your current password',
  新密码不能与当前密码相同: 'The new password must differ from the current one',
  密码已修改: 'Password changed',
  修改失败: 'Could not change the password',
  当前密码: 'Current password',
  '8–20 个字符': '8–20 characters',
  确认新密码: 'Confirm new password',
  获取两步验证状态失败: 'Could not load two-step verification',
  无法开始设置两步验证: 'Could not start setting up two-step verification',
  启用失败: 'Could not turn it on',
  关闭失败: 'Could not turn it off',
  生成失败: 'Could not generate',
  '登录时除密码外，还需输入验证器 App 生成的动态验证码。': 'Signing in also asks for a code from your authenticator app.',
  '验证码错误次数过多，已暂时锁定，请稍后再试。': 'Too many wrong codes, so it is locked for now. Try again in a few minutes.',
  '剩余备用码 {count} 个。': '{count} backup codes left.',
  '验证器 App': 'Authenticator app',
  已启用: 'On',
  未启用: 'Off',
  已锁定: 'Locked',
  重新生成备用码: 'Regenerate backup codes',
  关闭两步验证: 'Turn off two-step verification',
  启用两步验证: 'Turn on two-step verification',
  两步验证已启用: 'Two-step verification is on',
  添加到验证器: 'Add to your authenticator',
  保存备用码: 'Save your backup codes',
  输入验证码: 'Enter a code',
  '第 {step} / 3 步': 'Step {step} of 3',
  上一步: 'Back',
  下一步: 'Next',
  '在验证器 App（如 Google Authenticator、Microsoft Authenticator）中添加账户，手动输入下面的密钥：':
    'In your authenticator app (such as Google Authenticator or Microsoft Authenticator), add an account and enter this key:',
  '也可以复制完整的配置链接，在支持的 App 中打开：': 'Or copy the full setup link and open it in an app that supports it:',
  '每个备用码只能使用一次。请把它们保存在安全的地方，手机不在身边时可以用来登录。':
    'Each backup code works once. Keep them somewhere safe: they let you sign in without your phone.',
  '输入验证器 App 显示的 6 位数字。': 'Enter the 6-digit code your authenticator shows.',
  '正在生成密钥…': 'Generating your key…',
  复制全部备用码: 'Copy all backup codes',
  '新的备用码已生成，请立即保存。': 'Your new backup codes are ready. Save them now.',
  '重新生成后，原有的备用码将全部失效。': 'Your current backup codes stop working once new ones are made.',
  '输入验证器 App 中的验证码。': 'Enter the code from your authenticator app.',
  生成新备用码: 'Generate new codes',
  两步验证已关闭: 'Two-step verification is off',
  '关闭后，登录将不再需要验证码，账户安全性会降低。': 'Signing in will no longer ask for a code, which makes your account less secure.',
  验证码或备用码: 'Code or backup code',
  我了解关闭后所有备用码也会失效: 'I understand all backup codes will stop working too',
  访问令牌: 'Access token',
  系统访问令牌: 'System access token',
  '用于通过接口管理账户，与调用模型的 API 密钥不同。出于安全考虑，令牌只在生成时显示一次。':
    'Lets scripts manage your account through the API; it is not an API key for calling models. For security it is shown only once, when generated.',
  '旧令牌将立即失效，确认？': 'The old token stops working at once. Continue?',
  重新生成: 'Regenerate',
  '请立即复制保存，离开页面后将无法再次查看。': 'Copy it now: you won’t see it again after leaving this page.',
  已退出其他设备: 'Other devices signed out',
  已移除: 'Device removed',
  获取登录设备失败: 'Could not load devices',
  暂无登录设备: 'No signed-in devices',
  登录设备: 'Signed-in devices',
  '其他设备将立即退出，确认？': 'All other devices will be signed out. Continue?',
  退出其他设备: 'Sign out other devices',
  当前设备: 'This device',
  'IP：{ip} · {method}': 'IP {ip} · {method}',
  '最近活动：{time} · {expires} 过期': 'Last active {time} · Expires {expires}',
  '确认退出这台设备？': 'Sign out this device?',
  '确认移除这台设备？': 'Remove this device?',
  退出: 'Sign out',
  移除: 'Remove',
  未知设备: 'Unknown device',
  浏览器: 'Browser',
  第三方登录: 'Third-party sign-in',
  删除账户: 'Delete account',
  永久删除账户: 'Delete your account permanently',
  '账户及其数据将被删除，且无法恢复。': 'Your account and its data will be removed and can’t be recovered.',
  账户已删除: 'Account deleted',
  '此操作无法撤销。': 'This can’t be undone.',
  '输入用户名 {username} 以确认': 'Type your username {username} to confirm',

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
