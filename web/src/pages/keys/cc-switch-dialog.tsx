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
import { useId, useState } from 'react'

import { Button, Field, Modal, Notice, TextInput } from '@/components/ui'
import { tk, useI18n } from '@/i18n/i18n'
import { cn } from '@/lib/format'
import { useConsoleKey } from '@/pages/console/console-hooks'

import { ccSwitchUrl, openChatLink, type CcApp } from './chat-links'
import { getUserModels } from './keys-api'

type ModelField = { key: string; label: string; required?: boolean }

// CC Switch's import fields per app, as the old keys page offered them.
const APPS: Record<CcApp, { label: string; defaultName: string; fields: ModelField[] }> = {
  claude: {
    label: 'Claude',
    defaultName: 'My Claude',
    fields: [
      { key: 'model', label: tk('主模型'), required: true },
      { key: 'haikuModel', label: tk('Haiku 模型') },
      { key: 'sonnetModel', label: tk('Sonnet 模型') },
      { key: 'opusModel', label: tk('Opus 模型') },
    ],
  },
  codex: { label: 'Codex', defaultName: 'My Codex', fields: [{ key: 'model', label: tk('主模型'), required: true }] },
  gemini: { label: 'Gemini', defaultName: 'My Gemini', fields: [{ key: 'model', label: tk('主模型'), required: true }] },
}

const APP_IDS = Object.keys(APPS) as CcApp[]

const INPUT =
  'border-or-line bg-or-bg text-or-fg placeholder:text-or-dim focus:border-or-fg/25 h-9 w-full min-w-0 rounded-[6px] border px-3 text-[14px] outline-none transition-colors'

/** Adds this site as a provider in CC Switch (Claude, Codex or Gemini) through its import link. */
export function CcSwitchDialog(props: { apiKey: string; address: string; onClose: () => void }) {
  const { t } = useI18n()
  const baseId = useId()
  const [app, setApp] = useState<CcApp>('claude')
  const [name, setName] = useState(APPS.claude.defaultName)
  const [models, setModels] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const catalog = useQuery({ queryKey: useConsoleKey('key-models'), queryFn: getUserModels, staleTime: 5 * 60_000 })
  const config = APPS[app]

  function pickApp(next: CcApp) {
    setApp(next)
    setName(APPS[next].defaultName)
    setModels({})
    setError(null)
  }

  function submit() {
    if (!models.model?.trim()) {
      setError(t('请选择主模型'))
      return
    }
    const picked = Object.fromEntries(Object.entries(models).map(([field, model]) => [field, model.trim()]))
    openChatLink(ccSwitchUrl({ app, name: name.trim() || config.defaultName, models: picked, apiKey: props.apiKey, address: props.address }), 'app')
    props.onClose()
  }

  return (
    <Modal
      title={t('填入 CC Switch')}
      onClose={props.onClose}
      footer={
        <>
          <Button onClick={props.onClose}>{t('取消')}</Button>
          <Button variant='primary' onClick={submit}>
            {t('打开 CC Switch')}
          </Button>
        </>
      }
    >
      <div className='flex flex-col gap-4'>
        <fieldset>
          <legend className='text-or-fg mb-1.5 text-[13px] font-medium'>{t('应用')}</legend>
          <div className='border-or-line inline-flex rounded-[6px] border p-0.5'>
            {APP_IDS.map((id) => (
              <label
                key={id}
                className={cn(
                  'flex h-8 cursor-pointer items-center rounded-[4px] px-3 text-[14px] font-medium transition-colors has-[:focus-visible]:outline-2',
                  app === id ? 'bg-or-primary-soft text-or-primary' : 'text-or-muted hover:text-or-fg'
                )}
              >
                <input type='radio' name={`${baseId}-app`} value={id} checked={app === id} onChange={() => pickApp(id)} className='sr-only' />
                {APPS[id].label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label={t('名称')} htmlFor={`${baseId}-name`}>
          <TextInput id={`${baseId}-name`} value={name} onChange={setName} placeholder={config.defaultName} maxLength={50} />
        </Field>
        {config.fields.map((field) => (
          <Field key={`${app}-${field.key}`} label={field.required ? `${t(field.label)} *` : t(field.label)} htmlFor={`${baseId}-${field.key}`}>
            <input
              id={`${baseId}-${field.key}`}
              list={`${baseId}-models`}
              value={models[field.key] ?? ''}
              onChange={(event) => setModels((current) => ({ ...current, [field.key]: event.target.value }))}
              placeholder={t('选择或输入模型名称')}
              aria-label={t(field.label)}
              className={INPUT}
            />
          </Field>
        ))}
        <datalist id={`${baseId}-models`}>
          {(catalog.data ?? []).map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        {error ? <Notice tone='error'>{error}</Notice> : null}
      </div>
    </Modal>
  )
}
