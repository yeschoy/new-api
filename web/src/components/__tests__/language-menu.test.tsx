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
import userEvent from '@testing-library/user-event'

import { getLang, setLang, useI18n } from '@/i18n/i18n'

import { LanguageMenu } from '../language-menu'

function Probe() {
  const { t } = useI18n()
  return <span>{t('模型')}</span>
}

afterEach(() => {
  setLang('zh')
  window.localStorage.clear()
})

describe('LanguageMenu', () => {
  it('switches the page to English and back to Chinese', async () => {
    const user = userEvent.setup()
    render(
      <>
        <LanguageMenu />
        <Probe />
      </>
    )
    expect(screen.getByText('模型')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '切换语言' }))
    await user.click(screen.getByRole('menuitemradio', { name: 'English' }))
    expect(getLang()).toBe('en')
    expect(screen.getByText('Models')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Language' }))
    expect(screen.getByRole('menuitemradio', { name: 'English' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('menuitemradio', { name: '简体中文' }))
    expect(screen.getByText('模型')).toBeInTheDocument()
  })
})
