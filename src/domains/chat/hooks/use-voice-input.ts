'use client';

/**
 * useVoiceInput — Speech-to-text hook (031-chat-cross-biz-voice)
 *
 * Web: Uses SpeechRecognition / webkitSpeechRecognition API
 * Mobile (Capacitor): Uses @capacitor-community/speech-recognition plugin
 *
 * Returns transcribed text for the user to review before sending.
 * English-only for initial release.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

// Web Speech API type declarations (not in all TS libs)
type SpeechRecognitionType = typeof window extends { SpeechRecognition: infer T } ? T : never;
interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; [j: number]: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface UseVoiceInputOptions {
  onTranscript?: (text: string) => void;
  language?: string;
}

interface UseVoiceInputReturn {
  startRecording: () => void;
  stopRecording: () => void;
  isRecording: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  recordingDuration: number;
}

export function useVoiceInput(options: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const { onTranscript, language = 'en-US' } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isSupported, setIsSupported] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isNativeRef = useRef(false);

  // Check support on mount
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // On native, we'll check when starting
      isNativeRef.current = true;
      setIsSupported(true);
    } else {
      // Web: check for SpeechRecognition API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      setIsSupported(!!(win.SpeechRecognition || win.webkitSpeechRecognition));
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    setRecordingDuration(0);
    durationIntervalRef.current = setInterval(() => {
      setRecordingDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript('');

    if (isNativeRef.current) {
      // Capacitor native speech recognition
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');

        const { available } = await SpeechRecognition.available();
        if (!available) {
          setError('Speech recognition not available on this device');
          return;
        }

        const permResult = await SpeechRecognition.requestPermissions();
        if (permResult.speechRecognition !== 'granted') {
          setError('Microphone permission denied');
          return;
        }

        setIsRecording(true);
        startDurationTimer();

        SpeechRecognition.addListener('partialResults', (data: { matches?: string[] }) => {
          if (data.matches && data.matches[0]) {
            setTranscript(data.matches[0]);
          }
        });

        await SpeechRecognition.start({
          language,
          partialResults: true,
          popup: false,
        });

        // Listen for completion
        SpeechRecognition.addListener('listeningState', (state: { status?: string }) => {
          if (state.status === 'stopped') {
            setIsRecording(false);
            stopDurationTimer();
          }
        });
      } catch (err) {
        setIsRecording(false);
        stopDurationTimer();
        setError(err instanceof Error ? err.message : 'Failed to start speech recognition');
      }
    } else {
      // Web Speech API
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const win = window as any;
      const SpeechRecognitionClass = win.SpeechRecognition || win.webkitSpeechRecognition;

      if (!SpeechRecognitionClass) {
        setError('Speech recognition not supported in this browser');
        return;
      }

      const recognition: SpeechRecognitionInstance = new SpeechRecognitionClass();
      recognition.lang = language;
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
          } else {
            interimTranscript += result[0].transcript;
          }
        }

        const text = finalTranscript || interimTranscript;
        setTranscript(text);

        if (finalTranscript) {
          onTranscript?.(finalTranscript);
        }
      };

      recognition.onend = () => {
        setIsRecording(false);
        stopDurationTimer();
        recognitionRef.current = null;
      };

      recognition.onerror = (event) => {
        setIsRecording(false);
        stopDurationTimer();

        if (event.error === 'not-allowed') {
          setError('Microphone permission denied. Please allow microphone access in your browser settings.');
        } else if (event.error === 'no-speech') {
          setError('No speech detected. Please try again.');
        } else {
          setError(`Speech recognition error: ${event.error}`);
        }
      };

      recognitionRef.current = recognition;
      setIsRecording(true);
      startDurationTimer();

      try {
        recognition.start();
      } catch (err) {
        setIsRecording(false);
        stopDurationTimer();
        setError('Failed to start speech recognition');
      }
    }
  }, [language, onTranscript, startDurationTimer, stopDurationTimer]);

  const stopRecording = useCallback(async () => {
    if (isNativeRef.current) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
      } catch {
        // Ignore stop errors
      }
    } else if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    setIsRecording(false);
    stopDurationTimer();

    // Notify parent with final transcript
    if (transcript) {
      onTranscript?.(transcript);
    }
  }, [transcript, onTranscript, stopDurationTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDurationTimer();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [stopDurationTimer]);

  return {
    startRecording,
    stopRecording,
    isRecording,
    isSupported,
    transcript,
    error,
    recordingDuration,
  };
}
