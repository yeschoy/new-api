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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import { Button, ConfirmButton, Panel, Tag, toast } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { errorMessage } from '@/lib/api'
import { useAuthStatus } from '@/pages/auth/auth-status'
import { ProviderMark } from '@/pages/auth/brand-icons'
import { redirectProviders, type RedirectProvider } from '@/pages/auth/oauth-providers'
import { WeChatCodeModal } from '@/pages/auth/wechat-code-modal'
import { useConsoleKey } from '@/pages/console/console-hooks'

import type { AccountUser } from './account-api'
import { bindWeChat, listOAuthBindings, unbindOAuth } from './bindings-api'
import { TelegramBindModal } from './telegram-bind-modal'
import { useOAuthBind } from './use-oauth-bind'

/** The user field holding each built-in provider's account id. */
const ID_FIELDS: Record<string, keyof AccountUser> = {
  github: 'github_id',
  discord: 'discord_id',
  oidc: 'oidc_id',
  linuxdo: 'linux_do_id',
}

/** Third-party accounts linked to this one, for each sign-in the site switched on. */
export function BindingsPanel(props: { user: AccountUser | null }) {
  const { t } = useI18n()
  const status = useAuthStatus()
  const queryClient = useQueryClient()
  const providers = redirectProviders(status)
  const hasCustom = providers.some((provider) => provider.custom)
  const bindingsKey = useConsoleKey('oauth-bindings')
  const bindings = useQuery({ queryKey: bindingsKey, queryFn: listOAuthBindings, enabled: hasCustom })
  const [dialog, setDialog] = useState<'wechat' | 'telegram' | null>(null)
  const refresh = useCallback(() => void queryClient.invalidateQueries({ queryKey: ['console'] }), [queryClient])
  const startBind = useOAuthBind(refresh)
  const unbind = useMutation({
    mutationFn: unbindOAuth,
    onSuccess: () => {
      toast.success(t('已解绑'))
      refresh()
    },
    onError: (err) => toast.error(errorMessage(err, t('解绑失败'))),
  })

  const user = props.user
  const telegramOn = Boolean(status?.telegram_oauth && status.telegram_bot_name)
  if (!user || (!status?.wechat_login && !telegramOn && providers.length === 0)) return null

  const linkButton = (name: string, onClick: () => void) => (
    <Button size='sm' ariaLabel={t('绑定 {provider}', { provider: name })} onClick={onClick}>
      {t('绑定')}
    </Button>
  )
  const linked = <Tag tone='success'>{t('已绑定')}</Tag>

  const builtIn = (provider: RedirectProvider) => {
    const id = user[ID_FIELDS[provider.id]] as string | undefined
    return (
      <BindingRow key={provider.id} mark={provider.id} name={provider.name} value={id}>
        {id ? linked : linkButton(provider.name, () => void startBind(provider))}
      </BindingRow>
    )
  }

  const custom = (provider: RedirectProvider) => {
    const binding = bindings.data?.find((item) => item.provider_id === provider.customId)
    return (
      <BindingRow key={provider.id} mark='custom' name={provider.name} value={binding?.provider_user_id}>
        {binding ? (
          <ConfirmButton
            question={t('解绑后将无法再用 {provider} 登录，确认？', { provider: provider.name })}
            busy={unbind.isPending && unbind.variables === binding.provider_id}
            onConfirm={() => unbind.mutate(binding.provider_id)}
          >
            {t('解绑')}
          </ConfirmButton>
        ) : (
          linkButton(provider.name, () => void startBind(provider))
        )}
      </BindingRow>
    )
  }

  return (
    <Panel title={t('第三方账号')} flush>
      {status?.wechat_login ? (
        <BindingRow mark='wechat' name={t('微信')} value={user.wechat_id ? t('已绑定') : undefined}>
          {user.wechat_id ? linked : linkButton(t('微信'), () => setDialog('wechat'))}
        </BindingRow>
      ) : null}
      {providers.filter((provider) => !provider.custom).map(builtIn)}
      {telegramOn ? (
        <BindingRow mark='telegram' name='Telegram' value={user.telegram_id}>
          {user.telegram_id ? linked : linkButton('Telegram', () => setDialog('telegram'))}
        </BindingRow>
      ) : null}
      {providers.filter((provider) => provider.custom).map(custom)}

      {dialog === 'wechat' ? (
        <WeChatCodeModal
          title={t('绑定微信')}
          qrcode={status?.wechat_qrcode ?? ''}
          submitLabel={t('绑定')}
          onSubmit={async (code) => {
            await bindWeChat(code)
            toast.success(t('绑定成功'))
            refresh()
            setDialog(null)
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === 'telegram' ? <TelegramBindModal botName={status?.telegram_bot_name ?? ''} onBound={refresh} onClose={() => setDialog(null)} /> : null}
    </Panel>
  )
}

function BindingRow(props: { mark: string; name: string; value?: string; children: React.ReactNode }) {
  const { t } = useI18n()
  return (
    <div className='border-or-line flex items-center gap-3 border-t px-5 py-3.5 first:border-t-0'>
      <span className='bg-or-fill flex size-9 shrink-0 items-center justify-center rounded-[8px]'>
        <ProviderMark id={props.mark} className='size-4' />
      </span>
      <div className='min-w-0 flex-1'>
        <div className='text-or-fg text-[14px] font-medium'>{props.name}</div>
        <div className='text-or-muted truncate text-[13px]'>{props.value || t('未绑定')}</div>
      </div>
      <div className='flex shrink-0 items-center gap-2'>{props.children}</div>
    </div>
  )
}
