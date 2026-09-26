import '@testing-library/jest-dom/vitest'

// Tests run as a visitor whose browser is set to Chinese, the site's source language.
Object.defineProperty(window.navigator, 'languages', { value: ['zh-CN'], configurable: true })
