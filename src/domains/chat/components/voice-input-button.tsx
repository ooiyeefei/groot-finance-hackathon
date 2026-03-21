'use client';

/**
 * VoiceInputButton — Microphone button for speech-to-text (031-chat-cross-biz-voice)
 *
 * Shows a mic icon when idle, pulsing red indicator when recording.
 * Transcribed text is passed to parent via onTranscript callback.
 * Hidden when speech recognition is not supported.
 */

import { useCallback } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { useVoiceInput } from '../hooks/use-voice-input';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const {
    startRecording,
    stopRecording,
    isRecording,
    isSupported,
    error,
    recordingDuration,
  } = useVoiceInput({ onTranscript });

  const handleClick = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Hide button if not supported
  if (!isSupported) return null;

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        title={isRecording ? 'Stop recording' : 'Start voice input'}
        aria-label={isRecording ? 'Stop recording' : 'Start voice input'}
        className={`flex items-center justify-center rounded-lg p-2 transition-colors ${
          isRecording
            ? 'bg-destructive/10 text-destructive hover:bg-destructive/20'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        {isRecording ? (
          <div className="relative">
            <MicOff className="h-5 w-5" />
            {/* Pulsing ring animation */}
            <span className="absolute -inset-1 animate-ping rounded-full bg-destructive/30" />
          </div>
        ) : (
          <Mic className="h-5 w-5" />
        )}
      </button>

      {/* Recording duration badge */}
      {isRecording && (
        <span className="ml-1 text-xs font-mono text-destructive">
          {formatDuration(recordingDuration)}
        </span>
      )}

      {/* Error tooltip */}
      {error && !isRecording && (
        <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-destructive px-2 py-1 text-xs text-destructive-foreground shadow-lg">
          {error}
        </span>
      )}
    </div>
  );
}
