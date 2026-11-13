/*
Copyright (C) 2023-2026 QuantumNous
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
  act,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { createPartnerTenant, listPartnerTenants } from '../api'
import { PartnerTenantsManager } from '../index'

const requestVerification = vi.hoisted(() => vi.fn())

const originalAuth = useAuthStore.getState().auth

vi.mock('../api', () => ({
  listPartnerTenants: vi.fn().mockResolvedValue([
    {
      id: 4,
      name: 'Partner A',
      group: 'partner-a',
      integration_mode: 'hosted_h5',
      status: 1,
      created_at: 10,
      updated_at: 10,
    },
  ]),
  createPartnerTenant: vi.fn(),
  rotatePartnerTenantSecret: vi.fn(),
  updatePartnerTenantStatus: vi.fn(),
}))

vi.mock('@/features/auth/secure-verification', () => ({
  SecureVerificationDialog: () => null,
  useSecureVerification: () => ({
    requestVerification,
    dialogProps: {},
  }),
}))

function renderManager() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={client}>
      <PartnerTenantsManager />
    </QueryClientProvider>
  )
  return { ...view, client }
}

describe('partner tenant management', () => {
  beforeEach(() => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: ['default', 'partner-a', 'partner-b', '可得财务', 'auto'],
      },
    })
    requestVerification.mockResolvedValue({ proof_token: 'proof-test' })
    useAuthStore.setState({
      auth: {
        ...originalAuth,
        user: { id: 1, username: 'root', role: ROLE.SUPER_ADMIN },
      },
    })
  })

  afterEach(() => {
    cleanup()
    useAuthStore.setState({ auth: originalAuth })
    vi.clearAllMocks()
    vi.restoreAllMocks()
  })

  it('shows each partner with its dedicated group', async () => {
    renderManager()

    expect(await screen.findByText('Partner A')).toBeVisible()
    expect(screen.getByText('partner-a')).toBeVisible()
    expect(screen.getByText('Hosted H5')).toBeVisible()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(vi.mocked(listPartnerTenants)).toHaveBeenCalledOnce()
  })

  it('offers only unused dedicated groups when creating a partner', async () => {
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Partner A')
    await user.click(
      screen.getByRole('button', { name: 'Create partner tenant' })
    )
    await screen.findByRole('dialog', { name: 'Create partner tenant' })
    await user.click(
      screen.getByRole('combobox', { name: 'Dedicated model group' })
    )

    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).getByText('partner-b')).toBeVisible()
    expect(within(listbox).getByText('可得财务')).toBeVisible()
    expect(api.get).toHaveBeenCalledWith('/api/group')
    expect(within(listbox).queryByText('partner-a')).not.toBeInTheDocument()
    expect(within(listbox).queryByText('default')).not.toBeInTheDocument()
    expect(within(listbox).queryByText('auto')).not.toBeInTheDocument()
  })

  it('keeps disabled tenant groups occupied, including Chinese names', async () => {
    vi.mocked(listPartnerTenants).mockResolvedValueOnce([
      {
        id: 8,
        name: 'Disabled merchant',
        group: '可得财务',
        integration_mode: 'subscription_key',
        status: 2,
        created_at: 1,
        updated_at: 1,
      },
    ])
    const user = userEvent.setup()
    renderManager()
    await screen.findByText('Disabled merchant')
    await user.click(
      screen.getByRole('button', { name: 'Create partner tenant' })
    )
    await user.click(
      await screen.findByRole('combobox', { name: 'Dedicated model group' })
    )
    const listbox = await screen.findByRole('listbox')
    expect(within(listbox).queryByText('可得财务')).not.toBeInTheDocument()
    expect(within(listbox).getByText('partner-b')).toBeVisible()
  })

  it('defaults and resets on cancel/reopen without resetting H5 on async queries', async () => {
    const user = userEvent.setup()
    const { client } = renderManager()
    await screen.findByText('Partner A')
    await user.click(
      screen.getByRole('button', { name: 'Create partner tenant' })
    )
    let dialog = await screen.findByRole('dialog', {
      name: 'Create partner tenant',
    })
    expect(
      within(dialog).getByRole('combobox', { name: 'Integration mode' })
    ).toHaveTextContent('Subscription Key API')
    await user.click(
      within(dialog).getByRole('combobox', { name: 'Integration mode' })
    )
    await user.click(
      within(await screen.findByRole('listbox')).getByText('Hosted H5')
    )
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['admin', 'partner-tenants'] })
      await client.invalidateQueries({
        queryKey: ['admin', 'partner-tenant-groups'],
      })
    })
    expect(api.get).toHaveBeenCalledWith('/api/group')
    expect(
      within(dialog).getByRole('combobox', { name: 'Integration mode' })
    ).toHaveTextContent('Hosted H5')
    await user.type(within(dialog).getByLabelText('Partner name'), 'Cancelled')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(
      screen.getByRole('button', { name: 'Create partner tenant' })
    )
    dialog = await screen.findByRole('dialog', {
      name: 'Create partner tenant',
    })
    expect(
      within(dialog).getByRole('combobox', { name: 'Integration mode' })
    ).toHaveTextContent('Subscription Key API')
    expect(within(dialog).getByLabelText('Partner name')).toHaveValue('')
  })

  it.each(['subscription_key', 'hosted_h5'] as const)(
    'binds %s to both proof and create request',
    async (mode) => {
      vi.mocked(createPartnerTenant).mockResolvedValueOnce({
        tenant: {
          id: 9,
          name: 'New',
          group: '可得财务',
          integration_mode: mode,
          status: 1,
          created_at: 1,
          updated_at: 1,
        },
        secret: 'pt_test_only',
      })
      const user = userEvent.setup()
      renderManager()
      await screen.findByText('Partner A')
      await user.click(
        screen.getByRole('button', { name: 'Create partner tenant' })
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'Create partner tenant',
      })
      await user.type(within(dialog).getByLabelText('Partner name'), 'New')
      await user.click(
        within(dialog).getByRole('combobox', { name: 'Dedicated model group' })
      )
      await user.click(
        within(await screen.findByRole('listbox')).getByText('可得财务')
      )
      if (mode === 'hosted_h5') {
        await user.click(
          within(dialog).getByRole('combobox', { name: 'Integration mode' })
        )
        await user.click(
          within(await screen.findByRole('listbox')).getByText('Hosted H5')
        )
      }
      await user.click(within(dialog).getByRole('button', { name: /^Create$/ }))
      await waitFor(() =>
        expect(createPartnerTenant).toHaveBeenCalledWith(
          { name: 'New', group: '可得财务', integration_mode: mode },
          'proof-test'
        )
      )
      expect(requestVerification).toHaveBeenCalledWith(
        expect.objectContaining({
          context: {
            action: 'create',
            group: '可得财务',
            integration_mode: mode,
          },
        })
      )
    }
  )

  it('does not expose tenant management to non-root administrators', () => {
    useAuthStore.setState({
      auth: {
        ...originalAuth,
        user: { id: 2, username: 'admin', role: ROLE.ADMIN },
      },
    })
    renderManager()

    expect(screen.queryByText('Partner tenants')).not.toBeInTheDocument()
    expect(listPartnerTenants).not.toHaveBeenCalled()
  })
})
