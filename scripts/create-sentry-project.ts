#!/usr/bin/env npx tsx
/**
 * Sentry Project Setup Script
 *
 * Creates a new Sentry project and outputs the configuration values.
 *
 * Usage:
 *   npx tsx scripts/create-sentry-project.ts
 *
 * Required environment variables:
 *   SENTRY_API_KEY - API key with project:write scope
 *
 * Optional:
 *   SENTRY_ORG - Organization slug (default: auto-detected)
 */

import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SENTRY_API_URL = "https://sentry.io/api/0";

interface Organization {
  id: string;
  slug: string;
  name: string;
}

interface Project {
  id: string;
  slug: string;
  name: string;
  platform: string;
}

interface ProjectKey {
  id: string;
  name: string;
  dsn: {
    public: string;
    secret: string;
  };
}

async function sentryRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = process.env.SENTRY_API_KEY;
  if (!apiKey) {
    throw new Error("SENTRY_API_KEY environment variable is required");
  }

  const url = `${SENTRY_API_URL}${endpoint}`;
  console.log(`📡 API: ${options.method || "GET"} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sentry API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

async function getOrganizations(): Promise<Organization[]> {
  return sentryRequest<Organization[]>("/organizations/");
}

async function getProjects(org: string): Promise<Project[]> {
  return sentryRequest<Project[]>(`/organizations/${org}/projects/`);
}

async function createProject(
  org: string,
  name: string,
  platform: string = "javascript-nextjs"
): Promise<Project> {
  // First, we need to get a team - projects must belong to a team
  const teams = await sentryRequest<Array<{ slug: string; name: string }>>(
    `/organizations/${org}/teams/`
  );

  if (teams.length === 0) {
    // Create a default team
    console.log("📋 No teams found, creating default team...");
    await sentryRequest(`/organizations/${org}/teams/`, {
      method: "POST",
      body: JSON.stringify({
        name: "Engineering",
        slug: "engineering",
      }),
    });
  }

  const teamSlug = teams[0]?.slug || "engineering";

  return sentryRequest<Project>(`/teams/${org}/${teamSlug}/projects/`, {
    method: "POST",
    body: JSON.stringify({
      name,
      slug: name.toLowerCase().replace(/\s+/g, "-"),
      platform,
    }),
  });
}

async function getProjectKeys(org: string, project: string): Promise<ProjectKey[]> {
  return sentryRequest<ProjectKey[]>(`/projects/${org}/${project}/keys/`);
}

async function main() {
  console.log("🚀 Sentry Project Setup Script\n");
  console.log("━".repeat(50) + "\n");

  try {
    // 1. Get organizations
    console.log("📋 Fetching organizations...");
    const orgs = await getOrganizations();

    if (orgs.length === 0) {
      console.error("❌ No organizations found. Please create one first in Sentry.");
      process.exit(1);
    }

    // Use first org or specified one
    const orgSlug = process.env.SENTRY_ORG || orgs[0].slug;
    const org = orgs.find((o) => o.slug === orgSlug);

    if (!org) {
      console.error(`❌ Organization '${orgSlug}' not found.`);
      console.log("   Available organizations:");
      orgs.forEach((o) => console.log(`   - ${o.slug} (${o.name})`));
      process.exit(1);
    }

    console.log(`   ✅ Using organization: ${org.name} (${org.slug})\n`);

    // 2. Check existing projects
    console.log("📋 Checking existing projects...");
    const existingProjects = await getProjects(org.slug);
    console.log(`   Found ${existingProjects.length} existing project(s)`);

    // Check if finanseal project exists
    const projectName = "finanseal-web";
    let project = existingProjects.find(
      (p) => p.slug === projectName || p.name.toLowerCase().includes("finanseal")
    );

    if (project) {
      console.log(`   ✅ Found existing project: ${project.name} (${project.slug})\n`);
    } else {
      // 3. Create new project
      console.log(`\n📦 Creating new project: ${projectName}...`);
      project = await createProject(org.slug, projectName);
      console.log(`   ✅ Created project: ${project.name} (${project.slug})\n`);
    }

    // 4. Get project keys (DSN)
    console.log("🔑 Fetching project keys...");
    const keys = await getProjectKeys(org.slug, project.slug);

    if (keys.length === 0) {
      console.error("❌ No keys found for project");
      process.exit(1);
    }

    const dsn = keys[0].dsn.public;
    console.log(`   ✅ Found DSN\n`);

    // 5. Output configuration
    console.log("━".repeat(50));
    console.log("\n📝 Configuration Values\n");
    console.log("Add these to your .env.local file:\n");
    console.log(`SENTRY_ORG=${org.slug}`);
    console.log(`SENTRY_PROJECT=${project.slug}`);
    console.log(`NEXT_PUBLIC_SENTRY_DSN=${dsn}`);
    console.log("\n━".repeat(50));

    console.log("\n✅ Sentry project setup complete!");
    console.log("\n💡 Next steps:");
    console.log("   1. Add the above values to .env.local");
    console.log("   2. Run: npx tsx scripts/setup-sentry-alerts.ts");
    console.log("   3. Deploy and test error capture\n");
  } catch (error) {
    console.error("\n❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
