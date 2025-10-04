import { NextRequest, NextResponse } from 'next/server'

/**
 * JWT Template Configuration Guide
 * This endpoint provides the correct Clerk JWT template configuration
 */
export async function GET(request: NextRequest) {

  const correctTemplate = {
    "template_name": "supabase",
    "claims": {
      "iss": "{{iss}}",
      "aud": "authenticated",
      "sub": "{{user.id}}",
      "exp": "{{exp}}",
      "iat": "{{iat}}",
      "role": "{{user.private_metadata.role}}",
      "permissions": "{{user.private_metadata.permissions}}",
      "email": "{{user.primary_email_address.email_address}}",
      "clerk_user_id": "{{user.id}}",
      "activeBusinessId": "{{user.private_metadata.activeBusinessId}}",
      "user_metadata": "{{user.private_metadata}}"
    }
  }

  const instructions = {
    "step1": "Go to Clerk Dashboard → JWT Templates",
    "step2": "Edit your 'supabase' template",
    "step3": "Replace the entire template with the 'correctTemplate' below",
    "step4": "Save the template",
    "step5": "Log out and log back in to get fresh JWT",
    "step6": "Test /api/debug/jwt-claims again",

    "explanation": {
      "issue_found": "Template was using literal strings instead of substituting values",
      "current_sub": "Contains Clerk ID: user_31B9ml2Dwl2q8qxYFS4E13ABXSe",
      "needed_sub": "Should map to Supabase UUID for RLS to work",
      "metadata_issue": "Template syntax was not working - permissions showed as literal template string",
      "business_context": "Added activeBusinessId from privateMetadata for multi-tenant support"
    }
  }

  return NextResponse.json({
    diagnosis: "JWT template has syntax errors and wrong user ID mapping",
    correctTemplate,
    instructions,
    timestamp: new Date().toISOString()
  }, { status: 200 })
}