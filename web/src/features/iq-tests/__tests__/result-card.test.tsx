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
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { IQResultCard } from '../result-card'
import type { IQResult } from '../types'

const result: IQResult = {
  id: 'failed-result',
  group: 'public',
  model: 'model',
  task_id: 'run',
  config_version: 1,
  status: 'error',
  started_at: 1_794_211_200,
  completed_at: 1_794_211_212,
  duration_ms: 12_000,
  artifact_kind: '',
  error_code: 'execution_failed',
  error_message: 'secret-provider-body https://secret-key@provider.invalid',
}

function mount(overrides: Partial<IQResult> = {}) {
  return render(
    <IQResultCard
      scope='viewer'
      card={{
        model: 'model',
        latest: { ...result, ...overrides },
        progress: null,
      }}
      live={false}
      onOpen={vi.fn()}
    />
  )
}

describe('IQ failure explanations', () => {
  it.each([
    ['upstream_http_429', 'Upstream rejected the request (HTTP 429).'],
    ['upstream_http_502', 'Upstream rejected the request (HTTP 502).'],
    ['upstream_http_504', 'Upstream rejected the request (HTTP 504).'],
    ['transport_timeout', 'The upstream connection timed out.'],
    [
      'transport_error',
      'The upstream request failed before a response was received.',
    ],
    ['response_read_failed', 'Could not read the upstream response.'],
    ['request_setup_failed', 'The IQ request could not be prepared.'],
    [
      'execution_failed',
      'The request failed. Detailed diagnostics are not available for this run.',
    ],
    [
      'upstream_http_200',
      'The request failed. Detailed diagnostics are not available for this run.',
    ],
    [
      'upstream_http_999',
      'The request failed. Detailed diagnostics are not available for this run.',
    ],
    [
      'upstream_http_429-secret-key',
      'The request failed. Detailed diagnostics are not available for this run.',
    ],
  ])('shows safe copy for %s without raw provider details', (code, message) => {
    const { container } = mount({ error_code: code })
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(container.textContent).not.toContain('secret-')
    expect(container.textContent).not.toContain('provider.invalid')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(container.querySelector('iframe')).toBeNull()
  })

  it.each([
    ['timeout', 'The IQ request timed out.'],
    ['interrupted', 'Execution was interrupted and was not retried.'],
    ['unavailable', 'No compatible enabled route is available.'],
    [
      'invalid_artifact',
      'The model did not return a complete HTML or SVG artwork within the size limit.',
    ],
  ] as const)(
    'explains historical %s records from their status',
    (status, copy) => {
      mount({ status, error_code: '' })
      expect(screen.getByText(copy)).toBeInTheDocument()
    }
  )

  it.each(['pending', 'running', 'success'] as const)(
    'does not label a %s result as a failure',
    (status) => {
      const { container } = mount({ status })
      expect(
        screen.queryByText(
          'The request failed. Detailed diagnostics are not available for this run.'
        )
      ).not.toBeInTheDocument()
      expect(container.textContent).not.toContain('secret-')
    }
  )
})
