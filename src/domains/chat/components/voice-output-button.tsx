'use client'

/**
 * VoiceOutputButton — Play/Stop TTS for a message via MiniMax
 *
 * Small icon button that speaks the given text content.
 * Shows loading spinner while fetching audio, speaker icon when ready.
 */

import { Volume2, VolumeX, Loader2 } from 'lucide-react'
import { useVoiceOutput } from '../hooks/use-voice-output'

interface VoiceOutputButtonProps {
  text: string
  className?: string
}

export function VoiceOutputButton({ text, className = '' }: VoiceOutputButtonProps) {
  const { speak, stop, isPlaying, isLoading } = useVoiceOutput()

  if (!text.trim()) return null

  return (
    <button
      type="button"
      onClick={() => (isPlaying ? stop() : speak(text))}
      disabled={isLoading}
      className={`p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50 ${className}`}
      aria-label={isPlaying ? 'Stop speaking' : 'Read aloud'}
      title={isPlaying ? 'Stop speaking' : 'Read aloud'}
    >
      {isLoading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : isPlaying ? (
        <VolumeX className="w-3.5 h-3.5" />
      ) : (
        <Volume2 className="w-3.5 h-3.5" />
      )}
    </button>
  )
}
