/**
 * GitHub Integration API - Creates GitHub issues from feedback
 * POST /api/v1/feedback/github - Internal endpoint for GitHub issue creation
 *
 * This endpoint is called via fire-and-forget from the main feedback POST.
 * It creates GitHub issues for bug reports and feature requests.
 */

import { NextRequest, NextResponse } from "next/server";
import { Octokit } from "@octokit/rest";
import { getAuthenticatedConvex } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: "owner/repo"

interface FeedbackPayload {
  feedbackId: string;
}

/**
 * POST /api/v1/feedback/github
 * Creates a GitHub issue from feedback submission
 */
export async function POST(request: NextRequest) {
  try {
    // Validate GitHub configuration
    if (!GITHUB_TOKEN || !GITHUB_REPO) {
      console.error("[GitHub API] Missing GITHUB_TOKEN or GITHUB_REPO env vars");
      return NextResponse.json(
        { success: false, error: "GitHub integration not configured" },
        { status: 500 }
      );
    }

    const body: FeedbackPayload = await request.json();
    const { feedbackId } = body;

    if (!feedbackId) {
      return NextResponse.json(
        { success: false, error: "Missing feedbackId" },
        { status: 400 }
      );
    }

    // Get feedback details from Convex
    const { client } = await getAuthenticatedConvex();
    if (!client) {
      return NextResponse.json(
        { success: false, error: "Failed to authenticate with Convex" },
        { status: 500 }
      );
    }

    const feedback = await client.query(api.functions.feedback.get, {
      id: feedbackId as Id<"feedback">,
    });

    if (!feedback) {
      return NextResponse.json(
        { success: false, error: "Feedback not found" },
        { status: 404 }
      );
    }

    // All feedback types create GitHub issues

    // Parse repo owner and name
    const [owner, repo] = GITHUB_REPO.split("/");
    if (!owner || !repo) {
      console.error("[GitHub API] Invalid GITHUB_REPO format:", GITHUB_REPO);
      return NextResponse.json(
        { success: false, error: "Invalid GITHUB_REPO format" },
        { status: 500 }
      );
    }

    // Create Octokit instance
    const octokit = new Octokit({ auth: GITHUB_TOKEN });

    // Format issue title and body
    const issueTitle = formatIssueTitle(feedback.type, feedback.message);
    const issueBody = formatIssueBody(feedback);

    // Create GitHub issue
    const { data: issue } = await octokit.issues.create({
      owner,
      repo,
      title: issueTitle,
      body: issueBody,
      labels: getIssueLabels(feedback.type),
    });

    console.log(`[GitHub API] Created issue #${issue.number}: ${issue.html_url}`);

    // Update feedback with GitHub issue details
    await client.mutation(api.functions.feedback.updateGitHubIssue, {
      id: feedbackId as Id<"feedback">,
      githubIssueUrl: issue.html_url,
      githubIssueNumber: issue.number,
    });

    return NextResponse.json({
      success: true,
      data: {
        issueNumber: issue.number,
        issueUrl: issue.html_url,
      },
    });
  } catch (error) {
    console.error("[GitHub API] Error creating issue:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create GitHub issue" },
      { status: 500 }
    );
  }
}

/**
 * Format issue title from feedback type and message
 */
function formatIssueTitle(type: string, message: string): string {
  const prefixMap: Record<string, string> = {
    bug: "[Bug]",
    feature: "[Feature Request]",
    general: "[Feedback]",
  };
  const prefix = prefixMap[type] || "[Feedback]";
  // Take first 80 chars of message for title
  const shortMessage = message.length > 80 ? message.substring(0, 77) + "..." : message;
  return `${prefix} ${shortMessage}`;
}

/**
 * Format issue body with full feedback details
 */
function formatIssueBody(feedback: {
  type: string;
  message: string;
  pageUrl: string;
  userAgent: string;
  user?: { name: string; email: string } | null;
  isAnonymous: boolean;
  screenshotUrl?: string | null;
}): string {
  const sections: string[] = [];

  // Header
  const headerMap: Record<string, string> = {
    bug: "Bug Report",
    feature: "Feature Request",
    general: "User Feedback",
  };
  sections.push(`## ${headerMap[feedback.type] || "User Feedback"}`);
  sections.push("");

  // Description
  sections.push("### Description");
  sections.push(feedback.message);
  sections.push("");

  // Context
  sections.push("### Context");
  sections.push(`- **Page URL:** ${feedback.pageUrl || "Not provided"}`);

  if (!feedback.isAnonymous && feedback.user) {
    sections.push(`- **Submitted by:** ${feedback.user.name} (${feedback.user.email})`);
  } else {
    sections.push(`- **Submitted by:** Anonymous`);
  }

  sections.push("");

  // Screenshot
  if (feedback.screenshotUrl) {
    sections.push("### Screenshot");
    sections.push(`![Screenshot](${feedback.screenshotUrl})`);
    sections.push("");
  }

  // Technical details (for bugs)
  if (feedback.type === "bug") {
    sections.push("### Technical Details");
    sections.push("```");
    sections.push(`User Agent: ${feedback.userAgent || "Not provided"}`);
    sections.push("```");
    sections.push("");
  }

  // Footer
  sections.push("---");
  sections.push("*This issue was automatically created from user feedback in Groot Finance.*");

  return sections.join("\n");
}

/**
 * Get appropriate label for the issue based on feedback type
 */
function getIssueLabels(type: string): string[] {
  switch (type) {
    case "bug":
      return ["bug"];
    case "feature":
      return ["feature-request"];
    case "general":
    default:
      return ["user-feedback"];
  }
}
