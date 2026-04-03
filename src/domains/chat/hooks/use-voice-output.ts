'use client'

/**
 * useVoiceOutput — Text-to-Speech via MiniMax API
 *
 * Sends text to /api/v1/tts, receives MP3 audio, plays it in the browser.
 * Provides play/stop controls and loading state.
 */

import { useState, useCallback, useRef } from 'react'

interface UseVoiceOutputReturn {
  speak: (text: string) => Promise<void>
  stop: () => void
  isPlaying: boolean
  isLoading: boolean
  error: string | null
}

export function useVoiceOutput(): UseVoiceOutputReturn {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    cleanup()
    setIsPlaying(false)
    setIsLoading(false)
  }, [cleanup])

  const speak = useCallback(async (text: string) => {
    // Stop any current playback
    cleanup()
    setError(null)
    setIsLoading(true)

    try {
      // Strip markdown formatting for cleaner speech
      const cleanText = text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [link](url) → link
        .replace(/[*_~`#]/g, '') // Remove markdown chars
        .replace(/\n{2,}/g, '. ') // Paragraph breaks → pause
        .replace(/\n/g, ' ')
        .trim()

      if (!cleanText) {
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/v1/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'TTS failed' }))
        throw new Error(err.error || 'TTS generation failed')
      }

      const audioBlob = await response.blob()
      const blobUrl = URL.createObjectURL(audioBlob)
      blobUrlRef.current = blobUrl

      const audio = new Audio(blobUrl)
      audioRef.current = audio

      audio.onended = () => {
        setIsPlaying(false)
        cleanup()
      }

      audio.onerror = () => {
        setError('Audio playback failed')
        setIsPlaying(false)
        cleanup()
      }

      setIsLoading(false)
      setIsPlaying(true)
      await audio.play()
    } catch (err) {
      setIsLoading(false)
      setIsPlaying(false)
      setError(err instanceof Error ? err.message : 'TTS failed')
    }
  }, [cleanup])

  return { speak, stop, isPlaying, isLoading, error }
}
