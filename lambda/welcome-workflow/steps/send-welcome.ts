/**
 * Send Welcome Email Step
 *
 * Sends the appropriate welcome email based on user type:
 * - New signup: welcome-new-user template
 * - Team member: welcome-team-member template
 */

import { sendEmail } from '../../shared/email-service';
import { generateUnsubscribeToken, generateUnsubscribeUrl } from '../../shared/unsubscribe-token';

export interface SendWelcomeParams {
  email: string;
  firstName?: string;
  isTeamMember: boolean;
  invitedBy?: string;
  userId: string; // Convex user ID for unsubscribe token
}

export interface SendWelcomeResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export async function sendWelcomeEmail(params: SendWelcomeParams): Promise<SendWelcomeResult> {
  const { email, firstName, isTeamMember, invitedBy, userId } = params;

  const templateType = isTeamMember ? 'welcome_team_member' : 'welcome_new_user';
  const subject = isTeamMember
    ? `Welcome to FinanSEAL${invitedBy ? ` - ${invitedBy} invited you` : ''}`
    : 'Welcome to FinanSEAL - Your Financial Co-Pilot';

  try {
    // Generate unsubscribe token and URL
    const baseUrl = process.env.APP_URL || 'https://finanseal.com';
    const unsubscribeToken = await generateUnsubscribeToken(userId, email, 'all');
    const unsubscribeUrl = await generateUnsubscribeUrl(userId, email, 'all', baseUrl);

    const result = await sendEmail({
      to: email,
      subject,
      templateType,
      templateData: {
        firstName: firstName || 'there',
        invitedBy: invitedBy || undefined,
        loginUrl: `${baseUrl}/sign-in`,
        helpUrl: `${baseUrl}/help`,
        unsubscribeUrl, // For template {{unsubscribeUrl}} placeholder
      },
      unsubscribeToken, // For RFC 8058 List-Unsubscribe headers
    });

    return {
      success: true,
      messageId: result.messageId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Failed to send welcome email:', {
      email,
      templateType,
      error: errorMessage,
    });

    return {
      success: false,
      error: errorMessage,
    };
  }
}
