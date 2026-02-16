/**
 * Send Welcome Email Step
 *
 * Sends the appropriate welcome email based on user type:
 * - New signup: welcome-new-user template
 * - Team member: welcome-team-member template
 */

import { sendEmail } from '../../shared/email-service';
import { generateUnsubscribeToken, generateUnsubscribeUrl } from '../../shared/unsubscribe-token';
import { ConvexHttpClient } from 'convex/browser';

const convex = new ConvexHttpClient(process.env.CONVEX_URL || '');

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
    ? `Welcome to Groot Finance${invitedBy ? ` - ${invitedBy} invited you` : ''}`
    : 'Welcome to Groot Finance - Your Financial Co-Pilot';

  try {
    // Generate unsubscribe token and URL
    const baseUrl = process.env.APP_URL || 'https://finance.hellogroot.com/en';
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

    // Log email send to Convex for tracking
    try {
      await convex.mutation('functions/emails:logEmailSend' as any, {
        sesMessageId: result.messageId,
        configurationSet: process.env.SES_CONFIGURATION_SET || 'finanseal-transactional',
        templateType,
        recipientEmail: email,
        subject,
        senderEmail: process.env.SES_FROM_EMAIL || 'noreply@notifications.hellogroot.com',
        userId, // Pass userId for user-level tracking
      });
      console.log('Email logged to Convex:', { messageId: result.messageId, email, templateType });
    } catch (logError) {
      // Log error but don't fail - email was already sent successfully
      console.warn('Failed to log email to Convex:', {
        messageId: result.messageId,
        error: logError instanceof Error ? logError.message : 'Unknown error',
      });
    }

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
