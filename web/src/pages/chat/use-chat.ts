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
import { useCallback, useEffect, useRef, useState } from 'react'

import { t } from '@/i18n/i18n'
import { streamChatCompletion, type ChatCompletionBody } from '@/lib/chat-stream'

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** Model that produced an assistant reply. */
  model?: string
  reasoning?: string
  error?: string
}

export type Conversation = {
  id: string
  title: string
  model: string
  messages: ChatMessage[]
  updatedAt: number
}

export type ChatSettings = {
  temperature: number
  /** null = let the model decide. */
  maxTokens: number | null
  systemPrompt: string
}

export const DEFAULT_SETTINGS: ChatSettings = { temperature: 1, maxTokens: null, systemPrompt: '' }

const STORAGE_KEY = 'chat-conversations'

function loadConversations(): Conversation[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return (parsed as Conversation[])
      .filter((c) => c && typeof c.id === 'string' && Array.isArray(c.messages))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } catch {
    return []
  }
}

function saveConversations(list: Conversation[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // Quota exceeded or storage disabled: history just won't survive a reload.
  }
}

// crypto.randomUUID is missing on plain-http deployments, so roll our own.
function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function buildBody(model: string, settings: ChatSettings, history: ChatMessage[]): ChatCompletionBody {
  const messages: ChatCompletionBody['messages'] = []
  if (settings.systemPrompt.trim()) messages.push({ role: 'system', content: settings.systemPrompt.trim() })
  for (const m of history) {
    if (m.error || !m.content) continue
    messages.push({ role: m.role, content: m.content })
  }
  const body: ChatCompletionBody = { model, messages, stream: true, temperature: settings.temperature }
  if (settings.maxTokens && settings.maxTokens > 0) body.max_tokens = settings.maxTokens
  return body
}

/**
 * Conversation state for the chat page: history in localStorage, the
 * active thread, model + sampling settings, and a cancellable stream.
 */
export function useChat(defaultModel: string) {
  const [conversations, setConversations] = useState<Conversation[]>(loadConversations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [pickedModel, setPickedModel] = useState<string | null>(null)
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const latestRef = useRef(conversations)

  const model = pickedModel || defaultModel
  const active = conversations.find((c) => c.id === activeId) ?? null

  // Persist once a reply settles rather than on every streamed token.
  useEffect(() => {
    latestRef.current = conversations
    if (!streaming) saveConversations(conversations)
  }, [conversations, streaming])

  useEffect(
    () => () => {
      abortRef.current?.abort()
      saveConversations(latestRef.current)
    },
    []
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const newChat = useCallback(() => {
    abortRef.current?.abort()
    setActiveId(null)
  }, [])

  const select = useCallback((id: string) => {
    abortRef.current?.abort()
    setActiveId(id)
    const found = latestRef.current.find((c) => c.id === id)
    if (found?.model) setPickedModel(found.model)
  }, [])

  const remove = useCallback((id: string) => {
    if (id === activeId) {
      abortRef.current?.abort()
      setActiveId(null)
    }
    setConversations((list) => list.filter((c) => c.id !== id))
  }, [activeId])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || streaming || !model) return
      const id = active?.id ?? newId()
      const history: ChatMessage[] = [...(active?.messages ?? []), { role: 'user', content }]
      const conversation: Conversation = {
        id,
        title: active?.title ?? content.slice(0, 40),
        model,
        messages: [...history, { role: 'assistant', content: '', model }],
        updatedAt: Date.now(),
      }
      setConversations((list) => [conversation, ...list.filter((c) => c.id !== id)])
      setActiveId(id)

      const patchReply = (update: (reply: ChatMessage) => ChatMessage) =>
        setConversations((list) =>
          list.map((c) => {
            if (c.id !== id) return c
            const messages = c.messages.slice()
            messages[messages.length - 1] = update(messages[messages.length - 1])
            return { ...c, messages, updatedAt: Date.now() }
          })
        )

      const controller = new AbortController()
      abortRef.current = controller
      setStreaming(true)
      let received = false
      try {
        await streamChatCompletion({
          body: buildBody(model, settings, history),
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === 'content' || event.type === 'reasoning') received = true
            if (event.type === 'content') patchReply((r) => ({ ...r, content: r.content + event.text }))
            if (event.type === 'reasoning') patchReply((r) => ({ ...r, reasoning: (r.reasoning ?? '') + event.text }))
            if (event.type === 'error') patchReply((r) => ({ ...r, error: event.message }))
          },
        })
        if (!received) patchReply((r) => (r.error ? r : { ...r, error: t('模型没有返回任何内容') }))
      } catch (error) {
        if (controller.signal.aborted) {
          if (!received) patchReply((r) => ({ ...r, error: t('已停止生成') }))
        } else {
          const message = error instanceof Error && error.message ? error.message : t('网络异常，请稍后重试')
          patchReply((r) => ({ ...r, error: message }))
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null
        setStreaming(false)
      }
    },
    [active, model, settings, streaming]
  )

  return {
    conversations,
    active,
    activeId,
    model,
    setModel: setPickedModel,
    settings,
    setSettings,
    streaming,
    send,
    stop,
    newChat,
    select,
    remove,
  }
}

export type ChatController = ReturnType<typeof useChat>
