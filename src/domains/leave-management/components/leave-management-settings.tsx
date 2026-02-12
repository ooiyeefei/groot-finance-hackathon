'use client';

/**
 * Leave Management Settings Component
 *
 * Admin interface for configuring leave management:
 * - Leave types (Annual, Sick, Personal, etc.)
 * - Public holidays by country
 * - Default entitlements
 */

import React, { useState } from 'react';
import {
  Calendar,
  Plus,
  Edit2,
  Trash2,
  Loader2,
  CheckCircle,
  AlertCircle,
  CalendarDays,
  Globe,
  Settings,
  RefreshCw,
  Users,
  UserPlus,
  Sparkles,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useBusinessContext } from '@/contexts/business-context';
import { useAllLeaveTypes, useLeaveTypeOperations } from '../hooks/use-leave-types';
import { useBusinessHolidays, useHolidayOperations } from '../hooks/use-public-holidays';
import { useAllEmployeeBalances, useBalanceOperations, useUpdateLeaveEntitlements } from '../hooks/use-leave-balances';

// Predefined colors for leave types
const LEAVE_TYPE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

// SEA Countries for public holidays
const SEA_COUNTRIES = [
  { code: 'MY', name: 'Malaysia' },
  { code: 'SG', name: 'Singapore' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'TH', name: 'Thailand' },
  { code: 'VN', name: 'Vietnam' },
];

export default function LeaveManagementSettings() {
  const { activeContext } = useBusinessContext();
  const businessId = activeContext?.businessId;

  const [activeSettingsTab, setActiveSettingsTab] = useState('leave-types');

  // Leave types
  const leaveTypes = useAllLeaveTypes(businessId);
  const { createLeaveType, updateLeaveType, isLoading: isLeaveTypeLoading } = useLeaveTypeOperations();

  // Public holidays
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const holidays = useBusinessHolidays(businessId, selectedYear);
  const { addCustomHoliday, removeCustomHoliday, updateCustomHoliday, isLoading: isHolidayLoading } = useHolidayOperations();

  // Employee balances
  const [balanceYear, setBalanceYear] = useState(currentYear);
  const employeeBalances = useAllEmployeeBalances(businessId, balanceYear);
  const { initializeAll, isLoading: isBalanceLoading } = useBalanceOperations();
  const [initResult, setInitResult] = useState<{ created: number; skipped: number } | null>(null);

  // System holidays now come from date-holidays library automatically

  // Leave type dialog state
  const [leaveTypeDialog, setLeaveTypeDialog] = useState(false);
  const [editingLeaveType, setEditingLeaveType] = useState<string | null>(null);
  const [leaveTypeForm, setLeaveTypeForm] = useState({
    name: '',
    code: '',
    color: LEAVE_TYPE_COLORS[0],
    defaultDays: 14,
    deductsBalance: true,
    requiresApproval: true,
    isActive: true,
    carryoverPolicy: 'none' as 'none' | 'cap' | 'unlimited',
    carryoverCap: 0,
  });

  // Holiday dialog state
  const [holidayDialog, setHolidayDialog] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState<string | null>(null);
  const [holidayForm, setHolidayForm] = useState({
    name: '',
    date: '',
    countryCode: 'MY',
  });

  // Clear holidays confirmation dialog

  // Entitlement editing dialog state
  const [entitlementDialog, setEntitlementDialog] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<{
    userId: string;
    membershipId: string;
    name: string;
    currentEntitlements: Record<string, number>;
  } | null>(null);
  const [entitlementForm, setEntitlementForm] = useState<Record<string, number>>({});
  const { updateLeaveEntitlements, isLoading: isUpdatingEntitlements } = useUpdateLeaveEntitlements();

  // Bulk entitlement editing state
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [bulkEntitlementDialog, setBulkEntitlementDialog] = useState(false);
  const [bulkEntitlementForm, setBulkEntitlementForm] = useState<Record<string, number>>({});
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [bulkUpdateProgress, setBulkUpdateProgress] = useState({ current: 0, total: 0 });

  const openLeaveTypeDialog = (leaveType?: {
    _id: string;
    name: string;
    code: string;
    color?: string;
    defaultDays: number;
    deductsBalance: boolean;
    requiresApproval: boolean;
    isActive: boolean;
    carryoverPolicy?: 'none' | 'cap' | 'unlimited';
    carryoverCap?: number;
  }) => {
    if (leaveType) {
      setEditingLeaveType(leaveType._id);
      setLeaveTypeForm({
        name: leaveType.name,
        code: leaveType.code,
        color: leaveType.color || LEAVE_TYPE_COLORS[0],
        defaultDays: leaveType.defaultDays,
        deductsBalance: leaveType.deductsBalance,
        requiresApproval: leaveType.requiresApproval,
        isActive: leaveType.isActive,
        carryoverPolicy: leaveType.carryoverPolicy || 'none',
        carryoverCap: leaveType.carryoverCap || 0,
      });
    } else {
      setEditingLeaveType(null);
      setLeaveTypeForm({
        name: '',
        code: '',
        color: LEAVE_TYPE_COLORS[0],
        defaultDays: 14,
        deductsBalance: true,
        requiresApproval: true,
        isActive: true,
        carryoverPolicy: 'none',
        carryoverCap: 0,
      });
    }
    setLeaveTypeDialog(true);
  };

  const handleSaveLeaveType = async () => {
    if (!businessId || !leaveTypeForm.name || !leaveTypeForm.code) return;

    try {
      if (editingLeaveType) {
        await updateLeaveType(editingLeaveType, leaveTypeForm);
      } else {
        await createLeaveType({
          businessId,
          ...leaveTypeForm,
        });
      }
      setLeaveTypeDialog(false);
    } catch (error) {
      console.error('Failed to save leave type:', error);
    }
  };

  const openHolidayDialog = (holiday?: {
    _id: string;
    name: string;
    date: string;
    countryCode?: string;
  }) => {
    if (holiday) {
      setEditingHoliday(holiday._id);
      setHolidayForm({
        name: holiday.name,
        date: holiday.date,
        countryCode: holiday.countryCode || 'MY',
              });
    } else {
      setEditingHoliday(null);
      setHolidayForm({
        name: '',
        date: '',
        countryCode: 'MY',
              });
    }
    setHolidayDialog(true);
  };

  const handleSaveHoliday = async () => {
    if (!businessId || !holidayForm.name || !holidayForm.date) return;

    try {
      if (editingHoliday) {
        await updateCustomHoliday(editingHoliday, {
          date: holidayForm.date,
          name: holidayForm.name,
        });
      } else {
        await addCustomHoliday(businessId, holidayForm.date, holidayForm.name);
      }
      setHolidayDialog(false);
      setEditingHoliday(null);
      setHolidayForm({
        name: '',
        date: '',
        countryCode: 'MY',
              });
    } catch (error) {
      console.error('Failed to save holiday:', error);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    try {
      await removeCustomHoliday(holidayId);
    } catch (error) {
      console.error('Failed to delete holiday:', error);
    }
  };

  const openEntitlementDialog = (employee: {
    user: { _id: string; fullName?: string | null; email: string };
    membership: { _id: string; leaveEntitlements?: Record<string, number> };
  }) => {
    // Build form with current entitlements or defaults from leave types
    const form: Record<string, number> = {};
    const currentEntitlements = employee.membership.leaveEntitlements || {};

    // Initialize form with leave type defaults, then override with custom values
    if (leaveTypes) {
      leaveTypes.forEach((lt: { _id: string; defaultDays: number }) => {
        form[lt._id] = currentEntitlements[lt._id] ?? lt.defaultDays;
      });
    }

    setEditingEmployee({
      userId: employee.user._id,
      membershipId: employee.membership._id,
      name: employee.user.fullName || employee.user.email,
      currentEntitlements,
    });
    setEntitlementForm(form);
    setEntitlementDialog(true);
  };

  const handleSaveEntitlements = async () => {
    if (!editingEmployee) return;

    try {
      await updateLeaveEntitlements(editingEmployee.membershipId, entitlementForm);
      setEntitlementDialog(false);
      setEditingEmployee(null);
    } catch (error) {
      console.error('Failed to save entitlements:', error);
    }
  };

  // Bulk operations
  const toggleEmployeeSelection = (membershipId: string) => {
    setSelectedEmployees((prev) =>
      prev.includes(membershipId)
        ? prev.filter((id) => id !== membershipId)
        : [...prev, membershipId]
    );
  };

  const selectAllEmployees = () => {
    if (!employeeBalances) return;
    const allIds = employeeBalances.map((e) => e.membership._id);
    setSelectedEmployees(
      selectedEmployees.length === allIds.length ? [] : allIds
    );
  };

  const openBulkEntitlementDialog = () => {
    // Initialize form with leave type defaults
    const form: Record<string, number> = {};
    if (leaveTypes) {
      leaveTypes.forEach((lt: { _id: string; defaultDays: number }) => {
        form[lt._id] = lt.defaultDays;
      });
    }
    setBulkEntitlementForm(form);
    setBulkEntitlementDialog(true);
  };

  const handleBulkSaveEntitlements = async () => {
    if (selectedEmployees.length === 0) return;

    setIsBulkUpdating(true);
    setBulkUpdateProgress({ current: 0, total: selectedEmployees.length });

    try {
      for (let i = 0; i < selectedEmployees.length; i++) {
        await updateLeaveEntitlements(selectedEmployees[i], bulkEntitlementForm);
        setBulkUpdateProgress({ current: i + 1, total: selectedEmployees.length });
      }
      setBulkEntitlementDialog(false);
      setSelectedEmployees([]);
    } catch (error) {
      console.error('Failed to bulk update entitlements:', error);
    } finally {
      setIsBulkUpdating(false);
      setBulkUpdateProgress({ current: 0, total: 0 });
    }
  };

  if (!businessId) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Please select a business to configure leave management.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Leave Management Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure leave types, public holidays, and entitlements for your organization
        </p>
      </div>

      <Tabs value={activeSettingsTab} onValueChange={setActiveSettingsTab}>
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border">
          <TabsTrigger value="leave-types" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Calendar className="w-4 h-4 mr-2" />
            Leave Types
          </TabsTrigger>
          <TabsTrigger value="holidays" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Globe className="w-4 h-4 mr-2" />
            Public Holidays
          </TabsTrigger>
          <TabsTrigger value="balances" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-4 h-4 mr-2" />
            Employee Balances
          </TabsTrigger>
        </TabsList>

        {/* Leave Types Tab */}
        <TabsContent value="leave-types" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-foreground">Leave Types</h3>
              <p className="text-sm text-muted-foreground">
                Define the types of leave available to employees
              </p>
            </div>
            <Button onClick={() => openLeaveTypeDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Leave Type
            </Button>
          </div>

          {leaveTypes === undefined ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="bg-muted/50 border-border">
                  <CardContent className="pt-6">
                    <Skeleton className="h-5 w-32 mb-2" />
                    <Skeleton className="h-4 w-24" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : leaveTypes.length === 0 ? (
            <Card className="bg-muted/50 border-border">
              <CardContent className="py-8 text-center">
                <Calendar className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No leave types configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add leave types like Annual Leave, Sick Leave, etc.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {leaveTypes.map((leaveType: {
                _id: string;
                name: string;
                code: string;
                color?: string;
                defaultDays: number;
                deductsBalance: boolean;
                requiresApproval: boolean;
                isActive: boolean;
              }) => (
                <Card key={leaveType._id} className="bg-muted/50 border-border">
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: leaveType.color || '#3B82F6' }}
                        />
                        <div>
                          <h4 className="font-medium text-foreground">{leaveType.name}</h4>
                          <p className="text-sm text-muted-foreground">{leaveType.code}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {leaveType.isActive ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-gray-500/10 text-gray-600 border-gray-500/20">
                            Inactive
                          </Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openLeaveTypeDialog(leaveType)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Default Days</p>
                        <p className="font-medium text-foreground">{leaveType.defaultDays} days/year</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Deducts Balance</p>
                        <p className="font-medium text-foreground">{leaveType.deductsBalance ? 'Yes' : 'No'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Public Holidays Tab */}
        <TabsContent value="holidays" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-lg font-medium text-foreground">Public Holidays</h3>
                <p className="text-sm text-muted-foreground">
                  Configure public holidays for your region
                </p>
              </div>
              <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => openHolidayDialog()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Custom
              </Button>
            </div>
          </div>

          {holidays === undefined ? (
            <div className="space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-5 w-24" />
                </div>
              ))}
            </div>
          ) : holidays.length === 0 ? (
            <Card className="bg-muted/50 border-border">
              <CardContent className="py-8 text-center">
                <CalendarDays className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No public holidays configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add holidays like New Year, Chinese New Year, Hari Raya, etc.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {holidays.map((holiday: {
                _id?: string;
                name: string;
                date: string;
                countryCode?: string;
                isCustom?: boolean;
              }) => {
                const country = SEA_COUNTRIES.find(c => c.code === holiday.countryCode);
                return (
                  <div
                    key={holiday._id || holiday.date}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-foreground">
                          {holiday.name}
                          {holiday.isCustom && (
                            <span className="ml-2 text-xs text-orange-500 font-normal">(custom)</span>
                          )}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(holiday.date + 'T00:00:00').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {country && ` · ${country.name}`}
                        </p>
                      </div>
                    </div>
                    {holiday.isCustom && holiday._id && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openHolidayDialog(holiday as any)}
                          className="text-muted-foreground hover:text-foreground hover:bg-muted"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteHoliday(holiday._id!)}
                          className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Employee Balances Tab */}
        <TabsContent value="balances" className="space-y-4 mt-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div>
                <h3 className="text-lg font-medium text-foreground">Employee Balances</h3>
                <p className="text-sm text-muted-foreground">
                  View and manage leave entitlements for all employees
                </p>
              </div>
              <Select value={balanceYear.toString()} onValueChange={(val) => setBalanceYear(parseInt(val))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              {selectedEmployees.length > 0 && (
                <Button
                  variant="outline"
                  onClick={openBulkEntitlementDialog}
                  className="border-purple-500/30 text-purple-600 hover:bg-purple-500/10"
                >
                  <UsersRound className="w-4 h-4 mr-2" />
                  Bulk Edit ({selectedEmployees.length})
                </Button>
              )}
              <Button
                onClick={async () => {
                  if (!businessId) return;
                  try {
                    const result = await initializeAll(businessId, balanceYear);
                    setInitResult({ created: result.created, skipped: result.skipped });
                  } catch (error) {
                    console.error('Failed to initialize balances:', error);
                  }
                }}
                disabled={isBalanceLoading}
              >
                {isBalanceLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Initialize All Balances
                </>
              )}
              </Button>
            </div>
          </div>

          {initResult && (
            <Card className="bg-green-500/10 border-green-500/30">
              <CardContent className="py-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-green-700 dark:text-green-400">
                  Initialized {initResult.created} balances ({initResult.skipped} already existed)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => setInitResult(null)}
                >
                  Dismiss
                </Button>
              </CardContent>
            </Card>
          )}

          {employeeBalances === undefined ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="bg-card border-border">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-48 mb-2" />
                    <Skeleton className="h-4 w-32" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : employeeBalances.length === 0 ? (
            <Card className="bg-muted/50 border-border">
              <CardContent className="py-8 text-center">
                <Users className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">No employees found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Employee balances will appear here once team members are added.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {/* Select All Bar */}
              <div className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg border border-border">
                <Checkbox
                  checked={employeeBalances.length > 0 && selectedEmployees.length === employeeBalances.length}
                  onCheckedChange={() => selectAllEmployees()}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedEmployees.length === 0
                    ? 'Select all employees'
                    : `${selectedEmployees.length} of ${employeeBalances.length} selected`}
                </span>
                {selectedEmployees.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedEmployees([])}
                    className="text-xs ml-auto"
                  >
                    Clear selection
                  </Button>
                )}
              </div>

              {employeeBalances.map((employee) => {
                const hasCustomEntitlements = employee.membership.leaveEntitlements &&
                  Object.keys(employee.membership.leaveEntitlements).length > 0;
                const isSelected = selectedEmployees.includes(employee.membership._id);

                return (
                <Card
                  key={employee.user._id}
                  className={`bg-card border-border transition-colors ${isSelected ? 'ring-2 ring-purple-500/50 border-purple-500/30' : ''}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleEmployeeSelection(employee.membership._id)}
                        />
                        <div>
                          <p className="font-medium text-foreground">{employee.user.fullName || 'Unknown'}</p>
                          <p className="text-sm text-muted-foreground">{employee.user.email}</p>
                        </div>
                        {hasCustomEntitlements && (
                          <Badge className="bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 text-xs">
                            <Sparkles className="w-3 h-3 mr-1" />
                            Custom
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEntitlementDialog(employee)}
                          className="text-xs"
                        >
                          <Edit2 className="w-3 h-3 mr-1" />
                          Entitlements
                        </Button>
                        <Badge variant="outline" className="text-xs">
                          {employee.membership.role}
                        </Badge>
                      </div>
                    </div>

                    {!employee.hasBalances ? (
                      <p className="text-sm text-muted-foreground italic">
                        No balances initialized. Click "Initialize All Balances" to set up.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {employee.balances.map((balance) => (
                          <div
                            key={balance._id}
                            className="bg-muted/50 rounded-lg p-3 border border-border"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              {balance.leaveType?.color && (
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: balance.leaveType.color }}
                                />
                              )}
                              <span className="text-sm font-medium text-foreground truncate">
                                {balance.leaveType ? `${balance.leaveType.name} (${balance.leaveType.code})` : 'N/A'}
                              </span>
                            </div>
                            <div className="text-2xl font-bold text-foreground">
                              {balance.remaining}
                              <span className="text-sm font-normal text-muted-foreground">
                                /{balance.entitled + (balance.carryover || 0)}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Used: {balance.used}
                              {balance.carryover ? ` | C/O: ${balance.carryover}` : ''}
                              {balance.adjustments !== 0 ? ` | Adj: ${balance.adjustments > 0 ? '+' : ''}${balance.adjustments}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Leave Type Modal */}
      {leaveTypeDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => setLeaveTypeDialog(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  {editingLeaveType ? 'Edit Leave Type' : 'Add Leave Type'}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">Configure leave type settings</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="leave-name">Name *</Label>
                  <Input
                    id="leave-name"
                    placeholder="e.g., Annual Leave"
                    value={leaveTypeForm.name}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, name: e.target.value })}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-code">Code *</Label>
                  <Input
                    id="leave-code"
                    placeholder="e.g., AL"
                    value={leaveTypeForm.code}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, code: e.target.value.toUpperCase() })}
                    className="bg-input border-border"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="leave-days">Default Days Per Year</Label>
                  <Input
                    id="leave-days"
                    type="number"
                    min={0}
                    value={leaveTypeForm.defaultDays}
                    onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, defaultDays: parseInt(e.target.value) || 0 })}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-color">Color</Label>
                  <Select
                    value={leaveTypeForm.color}
                    onValueChange={(value) => setLeaveTypeForm({ ...leaveTypeForm, color: value })}
                  >
                    <SelectTrigger className="bg-input border-border">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-4 h-4 rounded-full"
                          style={{ backgroundColor: leaveTypeForm.color }}
                        />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {LEAVE_TYPE_COLORS.map((color) => (
                        <SelectItem key={color} value={color}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-4 h-4 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                            {color}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Deducts Balance</Label>
                    <p className="text-sm text-muted-foreground">Subtract days from employee balance</p>
                  </div>
                  <Checkbox
                    checked={leaveTypeForm.deductsBalance}
                    onCheckedChange={(checked) => setLeaveTypeForm({ ...leaveTypeForm, deductsBalance: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Requires Approval</Label>
                    <p className="text-sm text-muted-foreground">Manager must approve requests</p>
                  </div>
                  <Checkbox
                    checked={leaveTypeForm.requiresApproval}
                    onCheckedChange={(checked) => setLeaveTypeForm({ ...leaveTypeForm, requiresApproval: checked === true })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Active</Label>
                    <p className="text-sm text-muted-foreground">Available for employees to use</p>
                  </div>
                  <Checkbox
                    checked={leaveTypeForm.isActive}
                    onCheckedChange={(checked) => setLeaveTypeForm({ ...leaveTypeForm, isActive: checked === true })}
                  />
                </div>

                {/* Carryover Settings */}
                <div className="pt-4 border-t border-border">
                  <Label className="text-base font-medium">Year-End Carryover</Label>
                  <p className="text-sm text-muted-foreground mb-3">How unused days carry to next year</p>

                  <div className="space-y-3">
                    <Select
                      value={leaveTypeForm.carryoverPolicy}
                      onValueChange={(value: 'none' | 'cap' | 'unlimited') => setLeaveTypeForm({ ...leaveTypeForm, carryoverPolicy: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No Carryover - Days expire at year end</SelectItem>
                        <SelectItem value="cap">Capped - Up to a maximum number of days</SelectItem>
                        <SelectItem value="unlimited">Unlimited - All unused days carry over</SelectItem>
                      </SelectContent>
                    </Select>

                    {leaveTypeForm.carryoverPolicy === 'cap' && (
                      <div className="flex items-center gap-2">
                        <Label className="whitespace-nowrap">Max carryover days:</Label>
                        <Input
                          type="number"
                          min="0"
                          className="w-24"
                          value={leaveTypeForm.carryoverCap}
                          onChange={(e) => setLeaveTypeForm({ ...leaveTypeForm, carryoverCap: parseInt(e.target.value) || 0 })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setLeaveTypeDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveLeaveType}
                  disabled={isLeaveTypeLoading || !leaveTypeForm.name || !leaveTypeForm.code}
                >
                  {isLeaveTypeLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Holiday Modal */}
      {holidayDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => setHolidayDialog(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">{editingHoliday ? 'Edit Holiday' : 'Add Custom Holiday'}</h3>
                <p className="text-sm text-muted-foreground mt-1">Add a custom holiday for your organization</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="holiday-name">Holiday Name *</Label>
                <Input
                  id="holiday-name"
                  placeholder="e.g., Company Anniversary"
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  className="bg-input border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="holiday-date">Date *</Label>
                  <Input
                    id="holiday-date"
                    type="date"
                    value={holidayForm.date}
                    onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })}
                    className="bg-input border-border"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="holiday-country">Country</Label>
                  <Select
                    value={holidayForm.countryCode}
                    onValueChange={(value) => setHolidayForm({ ...holidayForm, countryCode: value })}
                  >
                    <SelectTrigger className="bg-input border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SEA_COUNTRIES.map((country) => (
                        <SelectItem key={country.code} value={country.code}>
                          {country.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => setHolidayDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveHoliday}
                  disabled={isHolidayLoading || !holidayForm.name || !holidayForm.date}
                >
                  {isHolidayLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Add Holiday
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Entitlements Dialog */}
      {entitlementDialog && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => !isUpdatingEntitlements && setEntitlementDialog(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">
                  Edit Leave Entitlements
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Set custom leave days for <span className="font-medium text-foreground">{editingEmployee.name}</span>
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground flex-1 mr-3">
                  <p className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>
                      Custom entitlements override the default leave type settings.
                    </span>
                  </p>
                </div>
                {editingEmployee.currentEntitlements && Object.keys(editingEmployee.currentEntitlements).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      // Reset form to defaults
                      const defaultForm: Record<string, number> = {};
                      if (leaveTypes) {
                        leaveTypes.forEach((lt: { _id: string; defaultDays: number }) => {
                          defaultForm[lt._id] = lt.defaultDays;
                        });
                      }
                      setEntitlementForm(defaultForm);
                      // Clear custom entitlements
                      try {
                        await updateLeaveEntitlements(editingEmployee.membershipId, {});
                        setEditingEmployee({
                          ...editingEmployee,
                          currentEntitlements: {},
                        });
                      } catch (error) {
                        console.error('Failed to reset entitlements:', error);
                      }
                    }}
                    disabled={isUpdatingEntitlements}
                    className="text-orange-600 hover:text-orange-700 hover:bg-orange-500/10 whitespace-nowrap"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset to Defaults
                  </Button>
                )}
              </div>

              <div className="space-y-4">
                {leaveTypes?.map((lt: {
                  _id: string;
                  name: string;
                  code: string;
                  color?: string;
                  defaultDays: number;
                }) => (
                  <div key={lt._id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: lt.color || '#3B82F6' }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">
                          {lt.name} ({lt.code})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Default: {lt.defaultDays} days
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={entitlementForm[lt._id] ?? lt.defaultDays}
                        onChange={(e) => setEntitlementForm({
                          ...entitlementForm,
                          [lt._id]: parseInt(e.target.value) || 0,
                        })}
                        className="w-20 bg-input border-border text-center"
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setEntitlementDialog(false)}
                  disabled={isUpdatingEntitlements}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEntitlements}
                  disabled={isUpdatingEntitlements}
                >
                  {isUpdatingEntitlements ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Save Entitlements
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Entitlements Dialog */}
      {bulkEntitlementDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 transition-opacity"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)'
            }}
            onClick={() => !isBulkUpdating && setBulkEntitlementDialog(false)}
          />
          <div className="relative transform overflow-hidden rounded-xl bg-card shadow-2xl w-full max-w-md border border-border max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <UsersRound className="w-5 h-5" />
                  Bulk Edit Entitlements
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Apply same entitlements to <span className="font-medium text-foreground">{selectedEmployees.length}</span> selected employee{selectedEmployees.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="bg-amber-500/10 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-400">
                <p className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    This will override any existing custom entitlements for all selected employees.
                  </span>
                </p>
              </div>

              {isBulkUpdating && (
                <div className="bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-muted-foreground">Updating employees...</span>
                    <span className="text-sm font-medium text-foreground">
                      {bulkUpdateProgress.current} / {bulkUpdateProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(bulkUpdateProgress.current / bulkUpdateProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {leaveTypes?.map((lt: {
                  _id: string;
                  name: string;
                  code: string;
                  color?: string;
                  defaultDays: number;
                }) => (
                  <div key={lt._id} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: lt.color || '#3B82F6' }}
                      />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground text-sm truncate">
                          {lt.name} ({lt.code})
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Default: {lt.defaultDays} days
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={bulkEntitlementForm[lt._id] ?? lt.defaultDays}
                        onChange={(e) => setBulkEntitlementForm({
                          ...bulkEntitlementForm,
                          [lt._id]: parseInt(e.target.value) || 0,
                        })}
                        className="w-20 bg-input border-border text-center"
                        disabled={isBulkUpdating}
                      />
                      <span className="text-sm text-muted-foreground">days</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setBulkEntitlementDialog(false)}
                  disabled={isBulkUpdating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkSaveEntitlements}
                  disabled={isBulkUpdating}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {isBulkUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Apply to {selectedEmployees.length} Employee{selectedEmployees.length !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
