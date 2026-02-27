'use client';

/**
 * Leave Request Form Component
 *
 * Allows employees to create and submit leave requests
 * Features:
 * - Date picker for start/end dates
 * - Leave type selector
 * - Automatic business day calculation
 * - Holiday exclusion
 * - Balance validation
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, Clock, FileText, Send, Loader2, AlertCircle, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useLeaveTypes } from '../hooks/use-leave-types';
import { useHolidayDates } from '../hooks/use-public-holidays';
import { useMyBalances } from '../hooks/use-leave-balances';
import { useCreateLeaveRequest, useSubmitLeaveRequest } from '../hooks/use-leave-requests';
import { calculateBusinessDays, parseLocalDate, formatDateForInput } from '../lib/day-calculator';

interface LeaveRequestFormProps {
  businessId: string;
  onSuccess?: (requestId: string) => void;
  onCancel?: () => void;
}

export default function LeaveRequestForm({ businessId, onSuccess, onCancel }: LeaveRequestFormProps) {
  // Form state
  const [leaveTypeId, setLeaveTypeId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [calculatedDays, setCalculatedDays] = useState<number>(0);
  const [submitAfterCreate, setSubmitAfterCreate] = useState(false);

  // Data hooks
  const leaveTypes = useLeaveTypes(businessId);
  const holidayDates = useHolidayDates(businessId);
  const balances = useMyBalances(businessId);

  // Mutation hooks
  const { createLeaveRequest, isLoading: isCreating, error: createError } = useCreateLeaveRequest();
  const { submitLeaveRequest, isLoading: isSubmitting, error: submitError } = useSubmitLeaveRequest();

  const isLoading = isCreating || isSubmitting;
  const error = createError || submitError;

  // Get selected leave type details
  const selectedLeaveType = useMemo(() => {
    if (!leaveTypeId || !leaveTypes) return null;
    return leaveTypes.find((lt: { _id: string }) => lt._id === leaveTypeId);
  }, [leaveTypeId, leaveTypes]);

  // Get balance for selected leave type
  const selectedBalance = useMemo(() => {
    if (!leaveTypeId || !balances) return null;
    return balances.find((b: { leaveTypeId: string }) => b.leaveTypeId === leaveTypeId);
  }, [leaveTypeId, balances]);

  // Calculate business days when dates change
  useEffect(() => {
    if (!startDate || !endDate) {
      setCalculatedDays(0);
      return;
    }

    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);

    if (start > end) {
      setCalculatedDays(0);
      return;
    }

    // Convert holiday date strings to Date objects
    const holidays = (holidayDates ?? []).map((d: string) => parseLocalDate(d));

    const days = calculateBusinessDays(start, end, holidays, true);
    setCalculatedDays(days);
  }, [startDate, endDate, holidayDates]);

  // Validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!leaveTypeId) {
      errors.push('Please select a leave type');
    }

    if (!startDate) {
      errors.push('Please select a start date');
    }

    if (!endDate) {
      errors.push('Please select an end date');
    }

    if (startDate && endDate) {
      const start = parseLocalDate(startDate);
      const end = parseLocalDate(endDate);

      if (start > end) {
        errors.push('End date must be after start date');
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (start < today) {
        errors.push('Start date cannot be in the past');
      }
    }

    if (calculatedDays === 0 && startDate && endDate) {
      errors.push('Selected dates result in 0 business days');
    }

    // Check balance if leave type deducts balance
    if (selectedLeaveType?.deductsBalance && selectedBalance) {
      if (calculatedDays > selectedBalance.remaining) {
        errors.push(`Insufficient balance: ${selectedBalance.remaining} days remaining`);
      }
    }

    return errors;
  }, [leaveTypeId, startDate, endDate, calculatedDays, selectedLeaveType, selectedBalance]);

  const isValid = validationErrors.length === 0;

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent, submitImmediately: boolean = false) => {
    e.preventDefault();

    if (!isValid) return;

    try {
      // Create the request first
      const requestId = await createLeaveRequest({
        businessId,
        leaveTypeId,
        startDate,
        endDate,
        totalDays: calculatedDays,
        notes: notes || undefined,
      });

      // Submit immediately if requested
      if (submitImmediately) {
        await submitLeaveRequest(requestId as string);
      }

      onSuccess?.(requestId as string);
    } catch (err) {
      console.error('Failed to create leave request:', err);
    }
  };

  // Get today's date for min attribute
  const today = formatDateForInput(new Date());

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          Apply for Leave
        </CardTitle>
        <CardDescription className="text-muted-foreground">
          Submit a leave request for approval by your manager
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Leave Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="leaveType" className="text-foreground font-medium">
              Leave Type <span className="text-destructive">*</span>
            </Label>
            <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
              <SelectTrigger className="bg-input border-border text-foreground">
                <SelectValue placeholder="Select leave type..." />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {leaveTypes?.map((type: { _id: string; name: string; color?: string }) => (
                  <SelectItem key={type._id} value={type._id} className="text-foreground">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: type.color || '#3B82F6' }}
                      />
                      {type.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBalance && (
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Info className="w-3 h-3" />
                Balance: {selectedBalance.remaining} days remaining
              </p>
            )}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-foreground font-medium">
                Start Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                min={today}
                className="bg-input border-border text-foreground"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-foreground font-medium">
                End Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
                className="bg-input border-border text-foreground"
              />
            </div>
          </div>

          {/* Business Days Preview */}
          {calculatedDays > 0 && (
            <div className="p-4 bg-muted rounded-lg border border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-foreground">
                  <Clock className="w-4 h-4" />
                  <span className="font-medium">Business Days</span>
                </div>
                <Badge className="bg-primary/10 text-primary border border-primary/30">
                  {calculatedDays} {calculatedDays === 1 ? 'day' : 'days'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Excludes weekends and public holidays
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes" className="text-foreground font-medium">
              Notes (Optional)
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional details for your manager..."
              className="bg-input border-border text-foreground resize-none"
              rows={3}
            />
          </div>

          {/* Validation Errors */}
          {validationErrors.length > 0 && startDate && endDate && (
            <Alert className="bg-destructive/10 border-destructive/30">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-destructive">
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Actions — always horizontal row, compact on mobile */}
          <div className="flex flex-row gap-2 sm:gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              disabled={isLoading}
              className="flex-1"
              size="sm"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={!isValid || isLoading}
              className="flex-1"
              size="sm"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Save as Draft</span>
                  <span className="sm:hidden">Draft</span>
                </>
              )}
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={!isValid || isLoading}
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              size="sm"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 sm:mr-2 animate-spin" />
                  <span className="hidden sm:inline">Submitting...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Submit for Approval</span>
                  <span className="sm:hidden">Submit</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
