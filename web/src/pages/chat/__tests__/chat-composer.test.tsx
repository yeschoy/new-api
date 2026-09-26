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
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ChatComposer } from '../chat-composer'

/** Stands in for the browser's SpeechRecognition. */
class FakeRecognition {
  static last: FakeRecognition | null = null
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  start = vi.fn(() => {
    FakeRecognition.last = this
  })
  stop = vi.fn(() => this.onend?.())
  abort = vi.fn(() => this.onend?.())

  hear(...parts: string[]) {
    act(() => this.onresult?.({ results: parts.map((transcript) => [{ transcript }]) }))
  }
}

afterEach(() => {
  delete (window as { SpeechRecognition?: unknown }).SpeechRecognition
  FakeRecognition.last = null
})

function renderComposer() {
  render(<ChatComposer streaming={false} onSend={() => {}} onStop={() => {}} />)
}

describe('ChatComposer voice input', () => {
  it('types what you say into the message box, in the page language', async () => {
    ;(window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeRecognition
    const user = userEvent.setup()
    renderComposer()
    await user.type(screen.getByRole('textbox', { name: '消息' }), '请帮我')

    await user.click(screen.getByRole('button', { name: '语音输入' }))
    const recognition = FakeRecognition.last!
    expect(recognition.lang).toBe('zh-CN')
    recognition.hear('写一首', '诗')
    expect(screen.getByRole('textbox', { name: '消息' })).toHaveValue('请帮我写一首诗')

    await user.click(screen.getByRole('button', { name: '停止语音输入' }))
    expect(recognition.stop).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '语音输入' })).toBeInTheDocument()
  })

  it('hides the microphone when the browser cannot listen', () => {
    renderComposer()
    expect(screen.queryByRole('button', { name: '语音输入' })).toBeNull()
  })
})
