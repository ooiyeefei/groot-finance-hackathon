'use client';

/**
 * Milestone Subscription Hook
 * Feature: 001-surface-automation-rate (User Story 3)
 *
 * Subscribes to business milestone changes and triggers toast notifications
 */

import { useEffect, useRef } from 'react';
import { useMilestones } from './use-automation-rate';
import { toast } from 'sonner';
import type { Id } from '@/convex/_generated/dataModel';

export interface UseMilestoneSubscriptionOptions {
  businessId: Id<"businesses">;
  enabled?: boolean;
}

interface MilestoneConfig {
  key: 'milestone_90' | 'milestone_95' | 'milestone_99';
  threshold: number;
  title: string;
  description: string;
  duration: number;
}

const MILESTONE_CONFIGS: MilestoneConfig[] = [
  {
    key: 'milestone_90',
    threshold: 90,
    title: 'AI Automation Rate Hit 90%!',
    description: 'Only 1 in 10 documents needs your review. Your AI is learning fast.',
    duration: 8000,
  },
  {
    key: 'milestone_95',
    threshold: 95,
    title: 'AI Automation Rate Hit 95%!',
    description: 'Only 1 in 20 documents needs your review. Exceptional accuracy.',
    duration: 8000,
  },
  {
    key: 'milestone_99',
    threshold: 99,
    title: 'AI Automation Rate Hit 99%!',
    description: 'Only 1 in 100 documents needs your review! Near-perfect automation.',
    duration: 10000,
  },
];

const SESSION_STORAGE_KEY = 'groot_milestone_toasts_shown';

function getShownMilestones(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function markMilestoneShown(key: string) {
  if (typeof window === 'undefined') return;
  try {
    const shown = getShownMilestones();
    shown.add(key);
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([...shown]));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Subscribe to milestone changes and trigger toast notifications
 */
export function useMilestoneSubscription(options: UseMilestoneSubscriptionOptions) {
  const { businessId, enabled = true } = options;
  const { milestones, isLoading } = useMilestones({ businessId });
  const prevMilestones = useRef<typeof milestones>(undefined);

  useEffect(() => {
    if (!enabled || isLoading || !milestones) return;

    // Skip first render (no previous to compare)
    if (prevMilestones.current === undefined) {
      prevMilestones.current = milestones;
      return;
    }

    const shown = getShownMilestones();

    // Check for newly achieved milestones
    for (const config of MILESTONE_CONFIGS) {
      const wasAchieved = prevMilestones.current?.[config.key];
      const isAchieved = milestones[config.key];

      // New milestone: wasn't set before, is set now, and not shown in this session
      if (!wasAchieved && isAchieved && !shown.has(config.key)) {
        toast.success(config.title, {
          description: config.description,
          duration: config.duration,
        });
        markMilestoneShown(config.key);
      }
    }

    prevMilestones.current = milestones;
  }, [milestones, isLoading, enabled]);
}
