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
import axios from 'axios'

import { useI18n } from '@/i18n/i18n'

import { BackActions, ErrorScreen, ExternalAction } from './error-screen'

const ISSUES_URL = 'https://github.com/QuantumNous/new-api/issues'

/** 401: the page needs an account with the right access. */
export function UnauthorizedPage() {
  const { t } = useI18n()
  return (
    <ErrorScreen
      code={401}
      title={t('未经授权的访问')}
      lines={[t('请使用有相应权限的账号登录后再访问。')]}
      actions={<BackActions />}
    />
  )
}

/** 403: signed in, but not allowed here. */
export function ForbiddenPage() {
  const { t } = useI18n()
  return <ErrorScreen code={403} title={t('禁止访问')} lines={[t('你没有打开这个页面的权限。')]} actions={<BackActions />} />
}

function httpStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined
}

/**
 * 500, or the page shown when something failed: pass the error to show its
 * HTTP status, with a gentler message when it was a 429 rate limit.
 */
export function ServerErrorPage(props: { error?: unknown }) {
  const { t } = useI18n()
  const status = httpStatus(props.error)
  const limited = status === 429
  return (
    <ErrorScreen
      code={status ?? 500}
      title={limited ? t('请求过于频繁') : t('糟糕！出错了')}
      lines={[
        t('对于由此造成的不便，我们深表歉意。'),
        limited ? t('请稍等片刻再试。') : t('请稍后再试。'),
        t('如果问题持续出现，请到 GitHub Issues 反馈。'),
      ]}
      actions={
        <BackActions>
          <ExternalAction href={ISSUES_URL}>{t('反馈问题')}</ExternalAction>
        </BackActions>
      }
    />
  )
}

/** 503: the site is down for maintenance; nothing to click until it is back. */
export function MaintenancePage() {
  const { t } = useI18n()
  return <ErrorScreen code={503} title={t('网站正在维护中')} lines={[t('网站暂时无法访问，我们很快就会恢复。')]} />
}
