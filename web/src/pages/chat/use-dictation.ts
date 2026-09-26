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

import { getLang, localeOf } from '@/i18n/i18n'

// The slice of the Web Speech API the message box uses (Chrome and Edge, Safari as webkitSpeechRecognition).
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionClass = new () => Recognition

function recognitionClass(): RecognitionClass | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}

/**
 * The browser's speech-to-text, in the page language. `onText` receives
 * everything heard since `start`, interim words included.
 */
export function useDictation(onText: (spoken: string) => void) {
  const [listening, setListening] = useState(false)
  const [failed, setFailed] = useState(false)
  const recognitionRef = useRef<Recognition | null>(null)
  const onTextRef = useRef(onText)

  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  useEffect(() => () => recognitionRef.current?.abort(), [])

  const start = useCallback(() => {
    const Recognition = recognitionClass()
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.lang = localeOf(getLang())
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event) => {
      let spoken = ''
      for (let i = 0; i < event.results.length; i++) spoken += event.results[i][0].transcript
      onTextRef.current(spoken)
    }
    recognition.onerror = (event) => {
      // Silence and our own cancel are not failures.
      if (event.error !== 'no-speech' && event.error !== 'aborted') setFailed(true)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
    }
    recognitionRef.current = recognition
    setFailed(false)
    setListening(true)
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setListening(false)
      setFailed(true)
    }
  }, [])

  /** Stops listening; words still being recognised are added. */
  const stop = useCallback(() => recognitionRef.current?.stop(), [])
  /** Stops at once and drops anything not yet recognised (used when the message is sent). */
  const cancel = useCallback(() => recognitionRef.current?.abort(), [])

  return { supported: !!recognitionClass(), listening, failed, start, stop, cancel }
}
