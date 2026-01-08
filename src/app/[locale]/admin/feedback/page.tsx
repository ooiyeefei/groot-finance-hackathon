"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bug,
  Lightbulb,
  MessageSquare,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  Filter,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type FeedbackType = "bug" | "feature" | "general";
type FeedbackStatus = "new" | "reviewed" | "resolved";

const TYPE_ICONS: Record<FeedbackType, typeof Bug> = {
  bug: Bug,
  feature: Lightbulb,
  general: MessageSquare,
};

const TYPE_LABELS: Record<FeedbackType, string> = {
  bug: "Bug Report",
  feature: "Feature Request",
  general: "General Feedback",
};

const STATUS_COLORS: Record<FeedbackStatus, string> = {
  new: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30",
  reviewed:
    "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30",
  resolved:
    "bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30",
};

/**
 * Admin Feedback Management Page
 *
 * Allows admins to view, filter, and manage user feedback submissions.
 * Features:
 * - Filter by type and status
 * - View feedback details and screenshots
 * - Update feedback status (new → reviewed → resolved)
 * - Link to GitHub issues
 */
export default function AdminFeedbackPage() {
  const [typeFilter, setTypeFilter] = useState<FeedbackType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | "all">(
    "all"
  );

  const feedbackList = useQuery(api.functions.feedback.list, {
    type: typeFilter === "all" ? undefined : typeFilter,
    status: statusFilter === "all" ? undefined : statusFilter,
    limit: 50,
  });

  const feedbackCounts = useQuery(api.functions.feedback.getCounts, {});
  const updateStatus = useMutation(api.functions.feedback.updateStatus);

  const handleStatusChange = async (
    feedbackId: Id<"feedback">,
    newStatus: FeedbackStatus
  ) => {
    try {
      await updateStatus({ id: feedbackId, status: newStatus });
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Feedback Management
          </h1>
          <p className="text-muted-foreground">
            Review and manage user feedback submissions
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-foreground">
              {feedbackCounts?.total ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Total Feedback</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">
              {feedbackCounts?.new ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">New</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">
              {feedbackCounts?.reviewed ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">In Review</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">
              {feedbackCounts?.resolved ?? 0}
            </div>
            <div className="text-sm text-muted-foreground">Resolved</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Type:</span>
              <Select
                value={typeFilter}
                onValueChange={(value) =>
                  setTypeFilter(value as FeedbackType | "all")
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="bug">Bug Reports</SelectItem>
                  <SelectItem value="feature">Feature Requests</SelectItem>
                  <SelectItem value="general">General</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Status:</span>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as FeedbackStatus | "all")
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="reviewed">Reviewed</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feedback List */}
      <div className="space-y-4">
        {feedbackList === undefined ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center">
              <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Loading feedback...</p>
            </CardContent>
          </Card>
        ) : feedbackList.items.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">No feedback found</p>
            </CardContent>
          </Card>
        ) : (
          feedbackList.items.map((item) => {
            const Icon = TYPE_ICONS[item.type as FeedbackType];
            return (
              <Card key={item._id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Type Icon */}
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground">
                          {TYPE_LABELS[item.type as FeedbackType]}
                        </span>
                        <Badge
                          className={
                            STATUS_COLORS[item.status as FeedbackStatus]
                          }
                        >
                          {item.status}
                        </Badge>
                        {item.githubIssueUrl && (
                          <a
                            href={item.githubIssueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Issue #{item.githubIssueNumber}
                          </a>
                        )}
                      </div>

                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {item.message}
                      </p>

                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>
                          {formatDistanceToNow(item._creationTime, {
                            addSuffix: true,
                          })}
                        </span>
                        {item.user && !item.isAnonymous && (
                          <span>{item.user.email}</span>
                        )}
                        {item.isAnonymous && <span>Anonymous</span>}
                        {item.pageUrl && (
                          <span className="truncate max-w-[200px]">
                            {item.pageUrl}
                          </span>
                        )}
                        {item.screenshotUrl && (
                          <a
                            href={item.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            <ImageIcon className="h-3 w-3" />
                            Screenshot
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Status Actions */}
                    <div className="flex-shrink-0">
                      <Select
                        value={item.status}
                        onValueChange={(value) =>
                          handleStatusChange(
                            item._id,
                            value as FeedbackStatus
                          )
                        }
                      >
                        <SelectTrigger className="w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new">New</SelectItem>
                          <SelectItem value="reviewed">Reviewed</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
