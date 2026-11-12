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
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AxiosAdapter } from 'axios'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import { IQTestsPage } from '..'
import {
  artifactRevision,
  type IQArtifact,
  type IQConfig,
  type IQResult,
  type IQResults,
} from '../types'

const originalAdapter = api.defaults.adapter
let client: QueryClient
let requests: string[]
let results: IQResults
let staleArtifact = false
let deletions: { group: string; version: number }[]
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

function login(id = 1, role = 1): void {
  useAuthStore.getState().auth.setBundle({
    access_token: 'fixture-token',
    token_type: 'Bearer',
    access_expires_at: 4_000_000_000,
    user: { id, username: `viewer-${id}`, role, group: 'public' },
    session: {
      sid: `session-${id}`,
      current: true,
      login_method: 'password',
      ip: '',
      user_agent: '',
      created_at: 1,
      last_active_at: 1,
      expires_at: 4_000_000_000,
    },
  })
}

function latest(index: number): IQResult {
  return {
    id: `pair-${index}`,
    group: 'public',
    model: `model-${index}`,
    task_id: 'previous-run',
    config_version: 2,
    status: 'success',
    started_at: 1_794_211_200,
    completed_at: 1_794_211_212,
    duration_ms: 12_000,
    artifact_kind: 'html',
    error_code: '',
    error_message: '',
  }
}

class VisibilityObserver {
  static current: VisibilityObserver
  elements = new Set<Element>()
  callback: IntersectionObserverCallback
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback
    VisibilityObserver.current = this
  }
  observe(element: Element) {
    this.elements.add(element)
  }
  unobserve(element: Element) {
    this.elements.delete(element)
  }
  disconnect() {
    this.elements.clear()
  }
  show(visible: Element[]) {
    this.callback(
      [...this.elements].map(
        (target) =>
          ({
            target,
            isIntersecting: visible.includes(target),
          }) as IntersectionObserverEntry
      ),
      this as unknown as IntersectionObserver
    )
  }
}

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  requests = []
  staleArtifact = false
  deletions = []
  results = {
    groups: [
      {
        group: 'public',
        task_id: 'current-run',
        created_at: 1_794_297_595,
        active_run: null,
        next_run_at: 0,
        schedule_enabled: false,
        config_version: 2,
        models: Array.from({ length: 5 }, (_, index) => ({
          model: `model-${index}`,
          latest: latest(index),
          progress: {
            status: 'running',
            started_at: 1_794_297_600,
            completed_at: 0,
          },
        })),
      },
    ],
    active_run: {
      task_id: 'current-run',
      status: 'running',
      config_version: 3,
      created_at: 1_794_297_595,
      total: 5,
      completed: 0,
      running: 2,
      pending: 3,
    },
    next_run_at: 0,
    next_cursor: 0,
    schedule_enabled: false,
    timezone: 'Asia/Shanghai',
  }
  results.groups[0].active_run = results.active_run
  vi.stubGlobal('IntersectionObserver', VisibilityObserver)
  login()
  const adapter: AxiosAdapter = async (request) => {
    requests.push(request.url ?? '')
    let data: unknown
    if (request.url === '/api/iq-tests/results') data = results
    else if (request.url === '/api/iq-tests/results?before=10') {
      data = { ...results, next_cursor: 0 }
    } else if (
      request.url === '/api/iq-tests/config' &&
      request.method === 'delete'
    ) {
      const input = JSON.parse(request.data) as {
        group: string
        version: number
      }
      deletions.push(input)
      results = {
        ...results,
        groups: results.groups.filter((row) => row.group !== input.group),
      }
      data = null
    } else if (request.url === '/api/iq-tests/config?list=true') {
      data = { tasks: [config], default_prompt: config.prompt }
    } else if (request.url?.startsWith('/api/iq-tests/run?group=')) {
      data = { task_id: 'new-run', status: 'pending', created: true }
    } else if (request.url === '/api/iq-tests/targets') {
      data = [
        { group: 'public', models: ['model-0', 'model-1'] },
        { group: 'private', models: ['model-private'] },
      ]
    } else if (request.url?.startsWith('/api/iq-tests/results/')) {
      const id = request.url.split('/').at(-1)
      const result = results.groups
        .flatMap((group) => group.models)
        .find((card) => card.latest?.id === id)?.latest
      if (!result) throw new Error('Missing fixture result')
      data = {
        ...result,
        artifact_kind: 'html',
        task_id: staleArtifact ? 'newer-run' : result.task_id,
        artifact:
          '<html><body><canvas></canvas><script>window.art = true</script></body></html>',
      } satisfies IQArtifact & IQResult
    } else throw new Error(`Unexpected request: ${request.url}`)
    return {
      data: { success: true, message: '', data },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: request,
    }
  }
  api.defaults.adapter = adapter
})

afterEach(() => {
  client.clear()
  api.defaults.adapter = originalAdapter
  useAuthStore.getState().auth.reset()
  vi.unstubAllGlobals()
})

function mount() {
  return render(
    <QueryClientProvider client={client}>
      <IQTestsPage />
    </QueryClientProvider>
  )
}

async function showCards(indices: number[]) {
  const observer = VisibilityObserver.current
  await act(async () =>
    observer.show(indices.map((index) => [...observer.elements][index]))
  )
}

describe('authenticated IQ gallery', () => {
  it('shows safe failure diagnostics from result metadata without fetching failed artifacts', async () => {
    results.groups[0].models[0].latest = {
      ...latest(0),
      status: 'error',
      error_code: 'upstream_http_429',
      error_message: 'secret-provider-error',
    }
    mount()
    expect(
      await screen.findByText('Upstream rejected the request (HTTP 429).')
    ).toBeInTheDocument()
    expect(screen.queryByText('secret-provider-error')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Preview model-0' })
    ).not.toBeInTheDocument()
    expect(requests).toEqual(['/api/iq-tests/results'])
  })

  it('keeps prior results dated during a run and exposes no member admin actions or eager artifacts', async () => {
    mount()
    await screen.findByRole('heading', { name: 'public' })
    expect(screen.getByRole('status')).toHaveTextContent('0 / 5 completed')
    expect(screen.getAllByText(/Run result/)).toHaveLength(5)
    expect(screen.getAllByText(/Current run/)).toHaveLength(6)
    expect(
      screen.queryByRole('button', { name: 'Run now' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'IQ test settings' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'New plan' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Delete plan' })
    ).not.toBeInTheDocument()
    expect(requests).toEqual(['/api/iq-tests/results'])
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('caps live cards, unmounts offscreen and closed frames, and clears all previews on account changes', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByRole('heading', { name: 'public' })
    await showCards([0, 1, 2, 3, 4])
    await waitFor(() =>
      expect(document.querySelectorAll('iframe')).toHaveLength(4)
    )
    const frame = document.querySelector('iframe')
    if (!frame) throw new Error('Expected an isolated preview')
    expect(frame).toHaveAttribute('sandbox', 'allow-scripts')
    expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(frame.srcdoc).not.toContain('fixture-token')
    expect(frame).toHaveStyle({
      width: '1280px',
      height: '960px',
      transformOrigin: 'top left',
    })
    await showCards([])
    expect(document.querySelector('iframe')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Preview model-0' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() =>
      expect(
        within(dialog).getByTitle('Artwork by model-0')
      ).toBeInTheDocument()
    )
    expect(document.querySelectorAll('iframe')).toHaveLength(1)
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(document.querySelector('iframe')).toBeNull()
    results = { ...results, groups: [], active_run: null }
    await act(async () => login(2))
    await screen.findByText('No IQ results available')
    expect(screen.queryByText('model-0')).not.toBeInTheDocument()
    expect(
      client
        .getQueryCache()
        .getAll()
        .every((query) => !JSON.stringify(query.queryKey).includes('session-1'))
    ).toBe(true)
  })

  it('rejects a newer artifact returned under a stable pair ID instead of showing it with the old time', async () => {
    staleArtifact = true
    mount()
    await screen.findByRole('heading', { name: 'public' })
    await showCards([0])
    await screen.findByText('Preview unavailable. Refresh the gallery.')
    expect(document.querySelector('iframe')).toBeNull()
    expect(artifactRevision(latest(0))).toContain('previous-run')
  })

  it('renders multiple groups as separate single horizontal model rows', async () => {
    results.groups.push({
      group: 'private',
      task_id: 'private-run',
      created_at: 1_794_297_590,
      active_run: null,
      next_run_at: 0,
      schedule_enabled: false,
      config_version: 2,
      models: [0, 1].map((index) => ({
        model: `private-${index}`,
        latest: null,
        progress: null,
      })),
    })
    mount()
    const publicRow = await screen.findByRole('region', {
      name: 'Models in public',
    })
    const privateRow = screen.getByRole('region', { name: 'Models in private' })
    expect(publicRow).toHaveAttribute('tabindex', '0')
    expect(publicRow).toHaveClass('overflow-x-auto')
    expect(within(publicRow).getByRole('list')).toHaveClass('grid-flow-col')
    expect(within(publicRow).getAllByRole('listitem')).toHaveLength(5)
    expect(within(privateRow).getAllByRole('listitem')).toHaveLength(2)
    expect(within(publicRow).queryByText('private-0')).not.toBeInTheDocument()
    expect(document.querySelector('iframe')).toBeNull()
    expect(requests).toEqual(['/api/iq-tests/results'])
  })

  it('keeps shared group ordering while showing retained cards without a history toggle', async () => {
    results.group_order = ['private', 'public']
    results.groups.push({
      ...results.groups[0],
      group: 'private',
      task_id: 'private-older-run',
      created_at: 1_794_211_000,
      models: [],
      active_run: null,
    })
    mount()
    await screen.findByRole('heading', { name: 'private' })
    const headings = () =>
      screen
        .getAllByRole('heading', { level: 2 })
        .map((heading) => heading.textContent)
    expect(headings()).toEqual(['private', 'public'])
    expect(
      screen.queryByRole('button', { name: 'Show run history' })
    ).not.toBeInTheDocument()
    expect(headings()).toEqual(['private', 'public'])
    expect(requests).toEqual(['/api/iq-tests/results'])
  })

  it('shows previous generations beside the latest under one group heading without replacing cards', async () => {
    const older = latest(0)
    results.groups.push({
      group: 'public',
      task_id: 'older-run',
      created_at: 1_794_211_000,
      active_run: null,
      next_run_at: 0,
      schedule_enabled: false,
      config_version: 2,
      models: [
        {
          model: older.model,
          latest: { ...older, id: 'older-result', task_id: 'older-run' },
          progress: null,
        },
      ],
    })
    mount()
    const rows = await screen.findAllByRole('region', {
      name: 'Models in public',
    })
    expect(rows).toHaveLength(1)
    expect(screen.getAllByRole('heading', { name: 'public' })).toHaveLength(1)
    const cards = within(rows[0]).getAllByRole('listitem')
    expect(cards).toHaveLength(6)
    expect(within(cards[0]).getByText('model-0')).toBeInTheDocument()
    expect(within(cards[5]).getByText('model-0')).toBeInTheDocument()
    expect(
      screen.getAllByRole('button', { name: 'Preview model-0' })
    ).toHaveLength(2)
    await showCards([0, 1, 2, 3, 4, 5])
    await waitFor(() =>
      expect(document.querySelectorAll('iframe')).toHaveLength(4)
    )
  })

  it('prepends a new generation without replacing the existing card and removes only expired metadata', async () => {
    const previous = {
      ...results.groups[0],
      task_id: 'run-1',
      active_run: null,
      models: [
        {
          model: 'model-0',
          latest: { ...latest(0), id: 'result-1', task_id: 'run-1' },
          progress: null,
        },
      ],
    }
    results = { ...results, groups: [previous], active_run: null }
    const user = userEvent.setup()
    mount()
    const strip = await screen.findByRole('region', {
      name: 'Models in public',
    })
    const originalCard = within(strip).getByRole('listitem')
    results = {
      ...results,
      groups: [
        {
          ...previous,
          task_id: 'run-2',
          models: [
            {
              model: 'model-0',
              latest: { ...latest(0), id: 'result-2', task_id: 'run-2' },
              progress: null,
            },
          ],
        },
        previous,
      ],
    }
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(within(strip).getAllByRole('listitem')).toHaveLength(2)
    )
    expect(screen.getAllByRole('heading', { name: 'public' })).toHaveLength(1)
    expect(within(strip).getAllByRole('listitem')[1]).toBe(originalCard)
    results = { ...results, groups: [results.groups[0]] }
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(within(strip).getAllByRole('listitem')).toHaveLength(1)
    )
    expect(originalCard).not.toBeInTheDocument()
  })

  it('deduplicates the latest plan rows when older history pages include them again', async () => {
    results.next_cursor = 10
    const user = userEvent.setup()
    mount()
    await screen.findByRole('heading', { name: 'public' })
    expect(
      screen.getByRole('button', { name: 'Load older runs' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Load older runs' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Load older runs' })
      ).not.toBeInTheDocument()
    )
    expect(requests).toContain('/api/iq-tests/results?before=10')
    expect(
      screen.getAllByRole('region', { name: 'Models in public' })
    ).toHaveLength(1)
  })

  it('runs one group independently while another group is active', async () => {
    login(1, 100)
    results.groups.push({
      group: 'private',
      task_id: 'private-run',
      created_at: 1_794_297_590,
      models: [],
      active_run: null,
      next_run_at: 0,
      schedule_enabled: false,
      config_version: 2,
    })
    mount()
    const publicGroup = await screen.findByRole('region', { name: 'public' })
    const privateGroup = screen.getByRole('region', { name: 'private' })
    expect(
      within(publicGroup).getByRole('button', { name: 'Run now' })
    ).toBeDisabled()
    const user = userEvent.setup()
    await user.click(
      within(privateGroup).getByRole('button', { name: 'Run now' })
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Run now' }))
    await waitFor(() =>
      expect(requests).toContain('/api/iq-tests/run?group=private')
    )
    expect(requests).not.toContain('/api/iq-tests/run?group=public')
  })

  it('requires explicit creation and does not display catalog groups when opening a new plan', async () => {
    login(1, 100)
    results = { ...results, groups: [], active_run: null }
    const user = userEvent.setup()
    mount()
    await screen.findByText('No IQ results available')
    await user.click(screen.getByRole('button', { name: 'New plan' }))
    const dialog = await screen.findByRole('dialog')
    const selector = await within(dialog).findByLabelText('Task group')
    expect(selector).toHaveValue('')
    expect(
      within(dialog).queryByLabelText('Test prompt')
    ).not.toBeInTheDocument()
    await user.selectOptions(selector, 'private')
    expect(within(dialog).getByLabelText('Test prompt')).toHaveValue(
      config.prompt
    )
    expect(
      screen.queryByRole('heading', { name: 'private' })
    ).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(
      screen.queryByRole('region', { name: 'private' })
    ).not.toBeInTheDocument()
    expect(deletions).toEqual([])
  })

  it('deletes only the confirmed plan with its current version and removes its row', async () => {
    login(1, 100)
    const user = userEvent.setup()
    mount()
    const row = await screen.findByRole('region', { name: 'public' })
    await user.click(within(row).getByRole('button', { name: 'Delete plan' }))
    let dialog = await screen.findByRole('alertdialog')
    expect(deletions).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.getByRole('region', { name: 'public' })).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Delete plan' }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete plan' })
    )
    await screen.findByText('No IQ results available')
    expect(deletions).toEqual([{ group: 'public', version: 2 }])
    expect(
      screen.queryByRole('region', { name: 'public' })
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'public' })
      ).not.toBeInTheDocument()
    )
  })

  it('shows settings and manual execution only to authorized administrators', async () => {
    login(1, 100)
    results = { ...results, groups: [], active_run: null }
    mount()
    await screen.findByText('No IQ results available')
    expect(
      screen.queryByRole('button', { name: 'Run now' })
    ).not.toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: 'IQ test settings' })
    )
    await screen.findByLabelText('Test prompt')
    expect(requests).toContain('/api/iq-tests/config?list=true')
    expect(requests).toContain('/api/iq-tests/targets')
    expect(screen.getByLabelText('Test prompt')).toHaveValue('Draw a pelican.')
  })
})
