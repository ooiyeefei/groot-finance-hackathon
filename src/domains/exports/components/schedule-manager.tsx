'use client';

/**
 * Schedule Manager Component
 *
 * Form for creating and editing export schedules.
 */

import { useState } from 'react';
import { Calendar, Clock, CalendarDays, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { ExportFrequency } from '../types';
import type { Id } from '../../../../convex/_generated/dataModel';

interface Template {
  id: string;
  name: string;
  type: 'prebuilt' | 'custom';
}

interface ScheduleManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: Template[];
  onSubmit: (schedule: {
    templateId?: Id<'export_templates'>;
    prebuiltTemplateId?: string;
    frequency: ExportFrequency;
    hourUtc: number;
    minuteUtc?: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
  }) => Promise<void>;
  isSubmitting?: boolean;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: `${i.toString().padStart(2, '0')}:00 UTC`,
}));

const DAYS_OF_MONTH = Array.from({ length: 28 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}${getOrdinalSuffix(i + 1)}`,
}));

function getOrdinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export function ScheduleManager({
  open,
  onOpenChange,
  templates,
  onSubmit,
  isSubmitting,
}: ScheduleManagerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [frequency, setFrequency] = useState<ExportFrequency>('daily');
  const [hourUtc, setHourUtc] = useState<number>(9);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);

  const handleSubmit = async () => {
    if (!selectedTemplate) return;

    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return;

    const scheduleData: Parameters<typeof onSubmit>[0] = {
      frequency,
      hourUtc,
      minuteUtc: 0,
    };

    if (template.type === 'custom') {
      scheduleData.templateId = selectedTemplate as Id<'export_templates'>;
    } else {
      scheduleData.prebuiltTemplateId = selectedTemplate;
    }

    if (frequency === 'weekly') {
      scheduleData.dayOfWeek = dayOfWeek;
    } else if (frequency === 'monthly') {
      scheduleData.dayOfMonth = dayOfMonth;
    }

    await onSubmit(scheduleData);
    resetForm();
  };

  const resetForm = () => {
    setSelectedTemplate('');
    setFrequency('daily');
    setHourUtc(9);
    setDayOfWeek(1);
    setDayOfMonth(1);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-lg w-full max-w-md overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Create Export Schedule
            </h2>
            <p className="text-sm text-muted-foreground">
              Set up automatic exports to run on a schedule.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Template Selection */}
          <div className="space-y-2">
            <Label>Export Template</Label>
            <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Select a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                    {template.type === 'prebuilt' && (
                      <span className="ml-2 text-xs text-muted-foreground">(Pre-built)</span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Frequency Selection */}
          <div className="space-y-2">
            <Label>Frequency</Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={frequency === 'daily' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setFrequency('daily')}
              >
                <Clock className="mr-2 h-4 w-4" />
                Daily
              </Button>
              <Button
                type="button"
                variant={frequency === 'weekly' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setFrequency('weekly')}
              >
                <Calendar className="mr-2 h-4 w-4" />
                Weekly
              </Button>
              <Button
                type="button"
                variant={frequency === 'monthly' ? 'default' : 'outline'}
                className="w-full"
                onClick={() => setFrequency('monthly')}
              >
                <CalendarDays className="mr-2 h-4 w-4" />
                Monthly
              </Button>
            </div>
          </div>

          {/* Day Selection (for weekly/monthly) */}
          {frequency === 'weekly' && (
            <div className="space-y-2">
              <Label>Day of Week</Label>
              <Select
                value={dayOfWeek.toString()}
                onValueChange={(val) => setDayOfWeek(parseInt(val))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_WEEK.map((day) => (
                    <SelectItem key={day.value} value={day.value.toString()}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === 'monthly' && (
            <div className="space-y-2">
              <Label>Day of Month</Label>
              <Select
                value={dayOfMonth.toString()}
                onValueChange={(val) => setDayOfMonth(parseInt(val))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_OF_MONTH.map((day) => (
                    <SelectItem key={day.value} value={day.value.toString()}>
                      {day.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Time Selection */}
          <div className="space-y-2">
            <Label>Time (UTC)</Label>
            <Select
              value={hourUtc.toString()}
              onValueChange={(val) => setHourUtc(parseInt(val))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HOURS.map((hour) => (
                  <SelectItem key={hour.value} value={hour.value.toString()}>
                    {hour.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Times are in UTC. Your local time may differ.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedTemplate || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Schedule'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
