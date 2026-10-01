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
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'

import { ConfirmButton, Modal, Select, Switch, Tabs, Toaster, toast } from '..'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Modal', () => {
  it('is a dialog named by its title that closes on Escape and on its close button', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal title='编辑渠道' onClose={onClose}>
        body
      </Modal>
    )
    expect(screen.getByRole('dialog', { name: '编辑渠道' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})

describe('Switch', () => {
  it('reports the flipped value', async () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Switch checked={on} onChange={setOn} label='启用' />
    }
    const user = userEvent.setup()
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: '启用' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-checked', 'true')
  })
})

describe('Select', () => {
  it('picks an option by its value', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Select ariaLabel='分组' value='a' onChange={onChange} options={[{ value: 'a', label: '默认' }, { value: 'b', label: 'VIP' }]} />)
    await user.selectOptions(screen.getByRole('combobox', { name: '分组' }), 'VIP')
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('Tabs', () => {
  it('marks the current tab and reports a new one', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<Tabs ariaLabel='设置分区' value='site' onChange={onChange} items={[{ id: 'site', label: '站点' }, { id: 'auth', label: '登录' }]} />)
    expect(screen.getByRole('tab', { name: '站点' })).toHaveAttribute('aria-selected', 'true')
    await user.click(screen.getByRole('tab', { name: '登录' }))
    expect(onChange).toHaveBeenCalledWith('auth')
  })
})

describe('ConfirmButton', () => {
  it('asks once before acting', async () => {
    const onConfirm = vi.fn()
    const user = userEvent.setup()
    render(
      <ConfirmButton question='确认删除？' onConfirm={onConfirm}>
        删除
      </ConfirmButton>
    )
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByText('确认删除？')).toBeInTheDocument()
    expect(onConfirm).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '确认' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})

describe('toast', () => {
  it('shows a message for a few seconds', () => {
    vi.useFakeTimers()
    render(<Toaster />)
    act(() => toast.success('已保存'))
    expect(screen.getByRole('status')).toHaveTextContent('已保存')
    act(() => vi.advanceTimersByTime(5000))
    expect(screen.queryByText('已保存')).toBeNull()
  })

  it('reads errors out as alerts', () => {
    render(<Toaster />)
    act(() => toast.error('保存失败'))
    expect(screen.getByRole('alert')).toHaveTextContent('保存失败')
  })
})
