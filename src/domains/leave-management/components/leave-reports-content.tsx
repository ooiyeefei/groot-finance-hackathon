'use client';

/**
 * 034-leave-enhance: Leave Reports Content
 *
 * Three report views: Balance Summary, Utilization, Absence Trends.
 * Supports CSV and PDF export. Role-based data filtering.
 */

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  Users,
  Download,
  FileText,
  Loader2,
  Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useBusinessContext } from '@/contexts/business-context';
import { useLeaveReports } from '../hooks/use-leave-reports';
import { useLeaveReportPdf } from '../hooks/use-leave-report-pdf';

export default function LeaveReportsContent() {
  const { activeContext, profile } = useBusinessContext();
  const businessId = activeContext?.businessId;
  const businessName = profile?.name || 'Your Organization';

  const [activeReport, setActiveReport] = useState('balance');
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const {
    balanceSummary,
    utilization,
    absenceTrends,
    isLoading,
    error,
    generateBalanceSummary,
    generateUtilization,
    generateAbsenceTrends,
    exportCsv,
  } = useLeaveReports(businessId);

  const { generatePdf, isGenerating } = useLeaveReportPdf();

  // Auto-generate report when tab or year changes
  useEffect(() => {
    if (!businessId) return;
    if (activeReport === 'balance') generateBalanceSummary(selectedYear);
    else if (activeReport === 'utilization') generateUtilization(selectedYear);
    else if (activeReport === 'trends') generateAbsenceTrends(selectedYear);
  }, [activeReport, selectedYear, businessId, generateBalanceSummary, generateUtilization, generateAbsenceTrends]);

  const currentData = activeReport === 'balance' ? balanceSummary
    : activeReport === 'utilization' ? utilization
    : absenceTrends;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div>
            <h3 className="text-lg font-medium text-foreground">Leave Reports</h3>
            <p className="text-sm text-muted-foreground">
              View leave utilization, balance summaries, and absence trends
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHowItWorks(true)}
            className="text-muted-foreground hover:text-foreground"
          >
            <Info className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(val) => setSelectedYear(parseInt(val))}>
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
          <Button
            onClick={() => exportCsv(activeReport, currentData)}
            disabled={!currentData || isLoading}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            <Download className="w-4 h-4 mr-2" />
            CSV
          </Button>
          <Button
            onClick={() => currentData && generatePdf(activeReport, currentData, businessName)}
            disabled={!currentData || isLoading || isGenerating}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
          >
            <FileText className="w-4 h-4 mr-2" />
            {isGenerating ? 'Generating...' : 'PDF'}
          </Button>
        </div>
      </div>

      {/* Report year label */}
      {currentData?.yearLabel && (
        <p className="text-sm text-muted-foreground">
          Showing data for: <span className="font-medium text-foreground">{currentData.yearLabel}</span>
        </p>
      )}

      {/* Report Tabs */}
      <Tabs value={activeReport} onValueChange={setActiveReport}>
        <TabsList className="grid w-full grid-cols-3 bg-muted border border-border">
          <TabsTrigger value="balance" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-4 h-4 mr-2" />
            Balance Summary
          </TabsTrigger>
          <TabsTrigger value="utilization" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="w-4 h-4 mr-2" />
            Utilization
          </TabsTrigger>
          <TabsTrigger value="trends" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TrendingUp className="w-4 h-4 mr-2" />
            Absence Trends
          </TabsTrigger>
        </TabsList>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Generating report...</span>
          </div>
        )}

        {error && (
          <Card className="bg-destructive/10 border-destructive/30">
            <CardContent className="p-4 text-destructive">{error}</CardContent>
          </Card>
        )}

        {/* Balance Summary */}
        <TabsContent value="balance" className="mt-4">
          {!isLoading && balanceSummary && (
            <Card className="bg-card border-border">
              <CardContent className="p-0">
                {balanceSummary.employees.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No balance data found for this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Employee</th>
                          <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Team</th>
                          <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Leave Type</th>
                          <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Entitled</th>
                          <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Used</th>
                          <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Adj.</th>
                          <th className="px-4 py-3 text-right text-foreground font-medium text-sm">C/O</th>
                          <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {balanceSummary.employees.flatMap((emp: any) =>
                          emp.balances.map((bal: any, i: number) => (
                            <tr key={`${emp.userId}-${i}`} className="border-b border-border hover:bg-muted/50">
                              <td className="px-4 py-3 text-foreground text-sm">{i === 0 ? emp.userName : ''}</td>
                              <td className="px-4 py-3 text-muted-foreground text-sm">{i === 0 ? emp.teamName : ''}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: bal.leaveTypeColor }} />
                                  <span className="text-foreground">{bal.leaveTypeName}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right text-foreground text-sm">{bal.entitled}</td>
                              <td className="px-4 py-3 text-right text-foreground text-sm">{bal.used}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground text-sm">{bal.adjustments}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground text-sm">{bal.carryover}</td>
                              <td className="px-4 py-3 text-right font-medium text-sm">
                                <span className={bal.remaining < 0 ? 'text-destructive' : 'text-foreground'}>
                                  {bal.remaining}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Utilization */}
        <TabsContent value="utilization" className="mt-4">
          {!isLoading && utilization && (
            <div className="space-y-4">
              {/* Overall rate */}
              <Card className="bg-card border-border">
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Overall Utilization</p>
                    <p className="text-3xl font-bold text-foreground">{utilization.businessOverallRate}%</p>
                  </div>
                  <Badge
                    className={
                      utilization.businessOverallRate > 80
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                        : utilization.businessOverallRate > 50
                        ? 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        : 'bg-red-500/10 text-red-600 dark:text-red-400'
                    }
                  >
                    {utilization.businessOverallRate > 80 ? 'High' : utilization.businessOverallRate > 50 ? 'Medium' : 'Low'}
                  </Badge>
                </CardContent>
              </Card>

              {/* Team breakdown */}
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  {utilization.teams.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No utilization data found.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Team</th>
                            <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Members</th>
                            <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Entitled</th>
                            <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Used</th>
                            <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Utilization</th>
                          </tr>
                        </thead>
                        <tbody>
                          {utilization.teams.map((team: any, i: number) => (
                            <tr key={i} className="border-b border-border hover:bg-muted/50">
                              <td className="px-4 py-3 text-foreground text-sm font-medium">{team.teamName}</td>
                              <td className="px-4 py-3 text-right text-muted-foreground text-sm">{team.memberCount}</td>
                              <td className="px-4 py-3 text-right text-foreground text-sm">{team.totalEntitled}</td>
                              <td className="px-4 py-3 text-right text-foreground text-sm">{team.totalUsed}</td>
                              <td className="px-4 py-3 text-right text-sm">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded-full"
                                      style={{ width: `${Math.min(team.utilizationRate, 100)}%` }}
                                    />
                                  </div>
                                  <span className="font-medium text-foreground">{team.utilizationRate}%</span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* Absence Trends */}
        <TabsContent value="trends" className="mt-4">
          {!isLoading && absenceTrends && (
            <div className="space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-2 gap-4">
                <Card className="bg-card border-border">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Total Absence Days</p>
                    <p className="text-2xl font-bold text-foreground">{absenceTrends.totalAbsenceDays}</p>
                  </CardContent>
                </Card>
                <Card className="bg-card border-border">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Peak Month</p>
                    <p className="text-2xl font-bold text-foreground">{absenceTrends.peakMonth}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Monthly breakdown */}
              <Card className="bg-card border-border">
                <CardContent className="p-0">
                  {absenceTrends.months.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">No absence data found for this period.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Month</th>
                            <th className="px-4 py-3 text-right text-foreground font-medium text-sm">Total Days</th>
                            <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Breakdown</th>
                          </tr>
                        </thead>
                        <tbody>
                          {absenceTrends.months.map((month: any, i: number) => (
                            <tr key={i} className="border-b border-border hover:bg-muted/50">
                              <td className="px-4 py-3 text-foreground text-sm font-medium">{month.month}</td>
                              <td className="px-4 py-3 text-right text-foreground text-sm font-medium">
                                {month.totalAbsenceDays}
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {month.byLeaveType.map((lt: any, j: number) => (
                                    <Badge
                                      key={j}
                                      className="text-xs"
                                      style={{
                                        backgroundColor: `${lt.color}15`,
                                        color: lt.color,
                                        borderColor: `${lt.color}30`,
                                      }}
                                    >
                                      {lt.name}: {lt.days}d
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* T036: How It Works Info Drawer */}
      <Sheet open={showHowItWorks} onOpenChange={setShowHowItWorks}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>How Leave Reports Work</SheetTitle>
            <SheetDescription>
              Generate and export leave data reports for your team.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-6 mt-6">
            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Steps</h4>
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">1</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Select a report type</p>
                    <p className="text-xs text-muted-foreground">Choose Balance Summary, Utilization, or Absence Trends.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">2</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Choose a year</p>
                    <p className="text-xs text-muted-foreground">Use the year dropdown to view different periods. If your business uses a non-January leave year (e.g., April-March), the period adjusts automatically.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">3</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">Export the data</p>
                    <p className="text-xs text-muted-foreground">Click CSV for spreadsheet data or PDF for a formatted report with your business name and date range.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium text-foreground">Report Types</h4>
              <div className="space-y-2 text-sm">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-foreground">Balance Summary</p>
                  <p className="text-xs text-muted-foreground">Shows each employee's entitled, used, remaining, and carry-over days per leave type.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-foreground">Utilization</p>
                  <p className="text-xs text-muted-foreground">Shows how much of the allocated leave each team has used, as a percentage.</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-foreground">Absence Trends</p>
                  <p className="text-xs text-muted-foreground">Monthly breakdown of total absence days, with peak month identification.</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-medium text-foreground">Good to Know</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Managers see only their direct reports' data</li>
                <li>• Admins and owners see all employees</li>
                <li>• Reports generate on-demand (not cached)</li>
                <li>• PDF exports include your business name and date range</li>
              </ul>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
