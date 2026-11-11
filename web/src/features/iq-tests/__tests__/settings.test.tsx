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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AxiosError, type AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { iqConfigSchema } from '../config-schema'
import { useIQViewerScope } from '../queries'
import { IQConfigForm, IQSettings } from '../settings'
import type { IQConfig, IQConfigInput } from '../types'

const config: IQConfig = {
  group: 'public',
  prompts: [],
  version: 2,
  prompt: 'Draw a pelican.',
  reasoning_effort: '',
  targets: [{ group: 'public', models: ['model-0'] }],
  enabled: false,
  schedule_mode: 'interval',
  interval_hours: 24,
  daily_time: '09:00',
  timezone: 'Asia/Shanghai',
  next_run_at: 0,
  updated_at: 1,
  updated_by: 1,
}
const originalAdapter = api.defaults.adapter
let client: QueryClient
let saved: IQConfigInput[]
let conflict: boolean
let tasks: IQConfig[]
let groupOrders: { groups: string[]; previous: string[] }[]

beforeEach(() => {
  client = new QueryClient()
  saved = []
  conflict = false
  tasks = [config]
  groupOrders = []
  useAuthStore.getState().auth.setBundle({
    access_token: 'fixture-token',
    token_type: 'Bearer',
    access_expires_at: 4_000_000_000,
    user: { id: 1, username: 'admin', role: 100, group: 'public' },
    session: {
      sid: 'settings-session',
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: 4_000_000_000,
    },
  })
  const adapter: AxiosAdapter = async (request) => {
    if (
      request.url === '/api/iq-tests/targets' ||
      request.url === '/api/iq-tests/config?list=true'
    ) {
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
        data: {
          success: true,
          message: '',
          data: request.url.endsWith('targets')
            ? [
                { group: 'public', models: ['model-0'] },
                { group: 'private', models: ['model-private'] },
              ]
            : { tasks, default_prompt: config.prompt },
        },
      }
    }
    if (request.url === '/api/iq-tests/group-order') {
      const input = JSON.parse(request.data) as (typeof groupOrders)[number]
      groupOrders.push(input)
      const response = {
        status: 200,
        statusText: 'OK',
        headers: {},
        config: request,
        data: { success: true, message: '', data: null },
      }
      if (conflict) {
        throw new AxiosError(
          'Conflict',
          'ERR_BAD_REQUEST',
          request,
          undefined,
          {
            ...response,
            status: 409,
          }
        )
      }
      tasks = input.groups.map((group) => {
        const task = tasks.find((task) => task.group === group)
        if (!task) throw new Error(`Missing fixture group: ${group}`)
        return task
      })
      return response
    }
    if (!request.url?.startsWith('/api/iq-tests/config')) {
      throw new Error('Unexpected API request')
    }
    const response = {
      status: 200,
      statusText: 'OK',
      headers: {},
      config: request,
      data: { success: true, message: '', data: { ...config, version: 3 } },
    }
    if (request.method === 'put') {
      const input = JSON.parse(request.data) as IQConfigInput
      saved.push(input)
      if (conflict) {
        throw new AxiosError(
          'Conflict',
          'ERR_BAD_REQUEST',
          request,
          undefined,
          { ...response, status: 409 }
        )
      }
      response.data.data = { ...config, ...input, version: 3 }
    }
    return response
  }
  api.defaults.adapter = adapter
})

afterEach(() => {
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
})

function SettingsFixture() {
  const scope = useIQViewerScope()
  if (!scope) return null
  return (
    <IQConfigForm
      scope={scope}
      config={config}
      catalog={[
        { group: 'public', models: ['model-0', 'model-1'] },
        { group: 'private', models: ['model-private'] },
      ]}
      canWrite
    />
  )
}
function mount() {
  render(
    <QueryClientProvider client={client}>
      <SettingsFixture />
    </QueryClientProvider>
  )
}

function mountSettings(canWrite = true) {
  function Fixture() {
    const scope = useIQViewerScope()
    return (
      scope && (
        <IQSettings scope={scope} canWrite={canWrite} onClose={() => {}} />
      )
    )
  }
  return render(
    <QueryClientProvider client={client}>
      <Fixture />
    </QueryClientProvider>
  )
}
function addPrivatePlan() {
  tasks.push({
    ...config,
    group: 'private',
    targets: [{ group: 'private', models: ['model-private'] }],
  })
}
function orderedNames() {
  return [
    ...screen.getByRole('list', { name: 'Group display order' }).children,
  ].map((item) => item.querySelector('span[title]')?.textContent)
}

describe('IQ configuration editing', () => {
  it('saves shared group order independently using arrows and keyboard, retaining it on reopen', async () => {
    addPrivatePlan()
    const user = userEvent.setup()
    const view = mountSettings()
    const saveOrder = await screen.findByRole('button', {
      name: 'Save group order',
    })
    expect(saveOrder).toBeDisabled()
    expect(orderedNames()).toEqual(['public', 'private'])
    await user.type(screen.getByLabelText('Test prompt'), ' Unsaved edit.')
    expect(
      screen.queryByRole('button', { name: 'Remove public' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Move public down' }))
    expect(orderedNames()).toEqual(['private', 'public'])
    expect(groupOrders).toEqual([])
    expect(saved).toEqual([])
    screen.getByRole('button', { name: 'Drag public to reorder' }).focus()
    await user.keyboard('{ArrowUp}')
    expect(orderedNames()).toEqual(['public', 'private'])
    expect(saveOrder).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Move private up' }))
    await user.click(saveOrder)
    await waitFor(() => expect(saveOrder).toBeDisabled())
    expect(groupOrders).toEqual([
      { groups: ['private', 'public'], previous: ['public', 'private'] },
    ])
    expect(screen.getByLabelText('Task group')).toHaveValue('public')
    expect(screen.getByLabelText('Test prompt')).toHaveValue(
      'Draw a pelican. Unsaved edit.'
    )
    expect(saved).toEqual([])
    view.unmount()
    mountSettings()
    await screen.findByRole('list', { name: 'Group display order' })
    expect(orderedNames()).toEqual(['private', 'public'])
  })

  it('preserves a conflicting order until an explicit reload and blocks read-only edits', async () => {
    addPrivatePlan()
    conflict = true
    const user = userEvent.setup()
    const view = mountSettings()
    await screen.findByRole('list', { name: 'Group display order' })
    await user.click(screen.getByRole('button', { name: 'Move private up' }))
    await user.click(screen.getByRole('button', { name: 'Save group order' }))
    await screen.findByRole('alert')
    expect(orderedNames()).toEqual(['private', 'public'])
    expect(
      screen.getByRole('button', { name: 'Save group order' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Move public up' })
    ).toBeDisabled()
    await user.click(
      screen.getByRole('button', {
        name: 'Reload configuration (discard edits)',
      })
    )
    await waitFor(() =>
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    )
    expect(orderedNames()).toEqual(['public', 'private'])
    view.unmount()
    mountSettings(false)
    await screen.findByRole('list', { name: 'Group display order' })
    expect(
      screen.queryByRole('button', { name: 'Save group order' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Move public down' })
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Drag public to reorder' })
    ).toBeDisabled()
  })

  it('keeps the original baseline when configuration refetches during an order draft', async () => {
    addPrivatePlan()
    const user = userEvent.setup()
    mountSettings()
    await screen.findByRole('list', { name: 'Group display order' })
    await user.click(screen.getByRole('button', { name: 'Move private up' }))
    tasks = [...tasks, { ...config, group: 'default', targets: [] }]
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['iq-tests'] })
    })
    expect(orderedNames()).toEqual(['private', 'public'])
    conflict = true
    await user.click(screen.getByRole('button', { name: 'Save group order' }))
    await screen.findByRole('alert')
    expect(groupOrders).toEqual([
      { groups: ['private', 'public'], previous: ['public', 'private'] },
    ])
    await user.click(
      screen.getByRole('button', {
        name: 'Reload configuration (discard edits)',
      })
    )
    await waitFor(() =>
      expect(orderedNames()).toEqual(['public', 'private', 'default'])
    )
  })

  it('only offers saved plans in settings and creates a new group only after an explicit save', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    function PlanFixture(props: { creating: boolean }) {
      const scope = useIQViewerScope()
      return (
        scope && (
          <IQSettings
            scope={scope}
            canWrite
            creating={props.creating}
            onClose={onClose}
          />
        )
      )
    }
    const view = render(
      <QueryClientProvider client={client}>
        <PlanFixture creating={false} />
      </QueryClientProvider>
    )
    const selector = await screen.findByLabelText('Task group')
    expect(selector).toHaveValue('public')
    expect(
      screen.queryByRole('option', { name: 'private' })
    ).not.toBeInTheDocument()
    view.unmount()
    render(
      <QueryClientProvider client={client}>
        <PlanFixture creating />
      </QueryClientProvider>
    )
    const createSelector = await screen.findByLabelText('Task group')
    expect(createSelector).toHaveValue('')
    expect(
      screen.queryByRole('option', { name: 'public' })
    ).not.toBeInTheDocument()
    expect(saved).toEqual([])
    await user.selectOptions(createSelector, 'private')
    expect(saved).toEqual([])
    await user.click(screen.getByRole('checkbox', { name: 'model-private' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(saved).toHaveLength(1)
    expect(saved[0].group).toBe('private')
    expect(saved[0].version).toBe(0)
    expect(saved[0].targets).toEqual([
      { group: 'private', models: ['model-private'] },
    ])
  })

  it('round-trips exact prompts, one group and daily Beijing schedule without server fields', async () => {
    const user = userEvent.setup()
    mount()
    await user.clear(screen.getByLabelText('Test prompt'))
    await user.type(
      screen.getByLabelText('Test prompt'),
      '  Finished artwork.  '
    )
    await user.selectOptions(screen.getByLabelText('Thinking level'), 'xhigh')
    await user.click(screen.getByRole('checkbox', { name: 'model-1' }))
    expect(
      screen.queryByRole('checkbox', { name: 'model-private' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add prompt' }))
    await user.type(screen.getByLabelText('Prompt 2'), '  Another scene.\n')
    await user.click(screen.getByRole('switch', { name: 'Enable schedule' }))
    await user.selectOptions(screen.getByLabelText('Schedule'), 'daily')
    expect(screen.queryByLabelText('Interval (hours)')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Daily time (Beijing)')).toHaveValue('09:00')
    fireEvent.change(screen.getByLabelText('Daily time (Beijing)'), {
      target: { value: '23:30' },
    })
    await user.selectOptions(screen.getByLabelText('Schedule'), 'interval')
    expect(screen.getByLabelText('Interval (hours)')).toHaveValue(24)
    await user.selectOptions(screen.getByLabelText('Schedule'), 'daily')
    expect(screen.getByLabelText('Daily time (Beijing)')).toHaveValue('23:30')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0]).toEqual({
      group: 'public',
      prompts: ['  Finished artwork.  ', '  Another scene.\n'],
      version: 2,
      prompt: '  Finished artwork.  ',
      reasoning_effort: 'xhigh',
      history_limit: 30,
      targets: [{ group: 'public', models: ['model-0', 'model-1'] }],
      enabled: true,
      schedule_mode: 'daily',
      interval_hours: 24,
      daily_time: '23:30',
      timezone: 'Asia/Shanghai',
    })
    expect(
      iqConfigSchema.safeParse({
        ...saved[0],
        targets: [{ group: 'private', models: ['model-private'] }],
      }).success
    ).toBe(false)
    expect(
      iqConfigSchema.safeParse({ ...saved[0], enabled: true, targets: [] })
        .success
    ).toBe(false)
  })

  it('preserves edits on 409, blocks stale resubmission, and reloads only on explicit discard', async () => {
    conflict = true
    const user = userEvent.setup()
    mount()
    await user.type(screen.getByLabelText('Test prompt'), ' Extra detail.')
    await user.selectOptions(screen.getByLabelText('Thinking level'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Test prompt')).toHaveValue(
      'Draw a pelican. Extra detail.'
    )
    expect(screen.getByLabelText('Thinking level')).toHaveValue('high')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(saved).toHaveLength(1)
    await user.click(
      screen.getByRole('button', {
        name: 'Reload configuration (discard edits)',
      })
    )
    await waitFor(() =>
      expect(screen.getByLabelText('Test prompt')).toHaveValue(
        'Draw a pelican.'
      )
    )
    expect(screen.getByLabelText('Thinking level')).toHaveValue('')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('defaults to 30 retained rounds, saves a custom limit and rejects invalid counts', async () => {
    const user = userEvent.setup()
    mount()
    const limit = screen.getByLabelText('Retained runs per group')
    expect(limit).toHaveValue(30)
    await user.clear(limit)
    await user.type(limit, '12')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].history_limit).toBe(12)
    for (const history_limit of [0, -1, 1.5, 1001, Number.NaN]) {
      expect(
        iqConfigSchema.safeParse({ ...saved[0], history_limit }).success
      ).toBe(false)
    }
    for (const history_limit of [1, 30, 1000]) {
      expect(
        iqConfigSchema.safeParse({ ...saved[0], history_limit }).success
      ).toBe(true)
    }
  })

  it('keeps the default optional and validates all supported thinking levels', async () => {
    mount()
    expect(screen.getByLabelText('Thinking level')).toHaveValue('')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].reasoning_effort).toBe('')
    expect(saved[0].prompts).toEqual(['Draw a pelican.'])
    for (const reasoning_effort of [
      '',
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ]) {
      expect(
        iqConfigSchema.safeParse({ ...saved[0], reasoning_effort }).success
      ).toBe(true)
    }
    expect(
      iqConfigSchema.safeParse({ ...saved[0], reasoning_effort: 'invalid' })
        .success
    ).toBe(false)
  })
})
