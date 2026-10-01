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
import { useQuery } from '@tanstack/react-query'
import DOMPurify from 'dompurify'

import { api, type ApiEnvelope } from '@/lib/api'
import { useI18n } from '@/i18n/i18n'
import { RouterShell } from '@/sites/router/router-shell'

type ContentSource = '/api/about' | '/api/user-agreement' | '/api/privacy-policy'

function looksLikeHtml(text: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(text)
}

/** Operator-configured text page (About / agreement / privacy). */
export function ContentPage(props: { source: ContentSource; title: string }) {
  const { t } = useI18n()
  const query = useQuery({
    queryKey: ['content', props.source],
    queryFn: async () => (await api.get<ApiEnvelope<string>>(props.source)).data.data ?? '',
  })
  const text = query.data ?? ''

  let body: React.ReactNode = <p className='whitespace-pre-wrap'>{text}</p>
  if (!text) body = <p>{query.isLoading ? t('加载中…') : t('管理员还没有填写这部分内容。')}</p>
  else if (text.startsWith('http')) {
    body = <iframe src={text} title={t(props.title)} className='h-[70vh] w-full rounded-[8px] border-0' />
  } else if (looksLikeHtml(text)) {
    body = <div className='[&_a]:underline [&_p]:mb-3' dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(text) }} />
  }

  return (
    <RouterShell>
      <div className='mx-auto max-w-[860px] px-6 pt-12 pb-24'>
        <h1 className='text-[24px] font-bold'>{t(props.title)}</h1>
        <div className='text-or-muted mt-6 text-[14px] leading-[24px]'>{body}</div>
      </div>
    </RouterShell>
  )
}
