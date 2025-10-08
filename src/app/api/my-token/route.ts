/**
 * Token Display Endpoint - Shows current user's JWT token
 * For testing purposes only
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { userId, getToken } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get the JWT token using Clerk's getToken method
    const jwtToken = await getToken({ template: 'supabase' });

    if (!jwtToken) {
      return NextResponse.json({ error: 'No JWT token available' }, { status: 400 });
    }

    return NextResponse.json({
      clerk_user_id: userId,
      jwt_token: jwtToken,
      token_preview: jwtToken.substring(0, 50) + '...',
      instructions: {
        copy_token: 'Copy the jwt_token value for use in curl commands',
        curl_example: `curl -X POST "http://localhost:3001/api/security-test" -H "Authorization: Bearer ${jwtToken}" -H "Content-Type: application/json" -d '{"test_type":"membership_validation"}'`
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Failed to get token',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}