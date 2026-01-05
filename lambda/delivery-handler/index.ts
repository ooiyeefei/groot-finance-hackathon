/**
 * Delivery Handler Lambda
 *
 * Processes SES delivery events from SNS:
 * - SEND: Email accepted by SES
 * - DELIVERY: Email delivered to recipient
 * - BOUNCE: Hard or soft bounce
 * - COMPLAINT: Spam complaint
 * - REJECT: SES rejected (suppression list)
 * - OPEN: Recipient opened email
 * - CLICK: Recipient clicked link
 *
 * Updates Convex database with delivery status and
 * manages email suppressions for bounces/complaints.
 */

import type { SNSEvent, SNSEventRecord } from 'aws-lambda';
import { ConvexHttpClient } from 'convex/browser';

const convex = new ConvexHttpClient(process.env.CONVEX_URL || '');

interface SESEventMessage {
  eventType: 'Send' | 'Delivery' | 'Bounce' | 'Complaint' | 'Reject' | 'Open' | 'Click';
  mail: {
    messageId: string;
    timestamp: string;
    source: string;
    destination: string[];
    commonHeaders?: {
      subject?: string;
      from?: string[];
      to?: string[];
    };
  };
  delivery?: {
    timestamp: string;
    recipients: string[];
    processingTimeMillis: number;
  };
  bounce?: {
    bounceType: 'Permanent' | 'Transient' | 'Undetermined';
    bounceSubType: string;
    bouncedRecipients: Array<{
      emailAddress: string;
      action?: string;
      status?: string;
      diagnosticCode?: string;
    }>;
    timestamp: string;
  };
  complaint?: {
    complainedRecipients: Array<{
      emailAddress: string;
    }>;
    complaintFeedbackType?: string;
    timestamp: string;
  };
  open?: {
    timestamp: string;
    ipAddress?: string;
    userAgent?: string;
  };
  click?: {
    timestamp: string;
    ipAddress?: string;
    link: string;
    userAgent?: string;
  };
}

export const handler = async (event: SNSEvent): Promise<{ statusCode: number }> => {
  console.log('Delivery handler received events:', event.Records.length);

  for (const record of event.Records) {
    try {
      await processRecord(record);
    } catch (error) {
      // Log but don't fail - we don't want to retry all records
      console.error('Failed to process record:', {
        messageId: record.Sns.MessageId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { statusCode: 200 };
};

async function processRecord(record: SNSEventRecord): Promise<void> {
  const sesEvent: SESEventMessage = JSON.parse(record.Sns.Message);
  const eventType = sesEvent.eventType.toLowerCase();
  const messageId = sesEvent.mail.messageId;
  const recipient = sesEvent.mail.destination[0];

  console.log('Processing SES event:', {
    eventType,
    messageId,
    recipient,
  });

  // Log delivery event to Convex
  await convex.mutation('emails:logDeliveryEvent' as any, {
    sesMessageId: messageId,
    eventType,
    timestamp: Date.now(),
    recipient,
    details: sesEvent,
  });

  // Handle bounces and complaints - add to suppression list
  if (sesEvent.eventType === 'Bounce' && sesEvent.bounce) {
    const { bounceType, bounceSubType, bouncedRecipients } = sesEvent.bounce;

    // Only suppress on permanent bounces
    if (bounceType === 'Permanent') {
      for (const recipient of bouncedRecipients) {
        await convex.mutation('emails:markEmailUndeliverable' as any, {
          email: recipient.emailAddress.toLowerCase(),
          reason: 'bounce',
          bounceType,
          bounceSubType,
          sourceMessageId: messageId,
        });

        console.log('Email suppressed (bounce):', {
          email: recipient.emailAddress,
          bounceType,
          bounceSubType,
        });
      }
    }
  }

  if (sesEvent.eventType === 'Complaint' && sesEvent.complaint) {
    for (const recipient of sesEvent.complaint.complainedRecipients) {
      await convex.mutation('emails:markEmailUndeliverable' as any, {
        email: recipient.emailAddress.toLowerCase(),
        reason: 'complaint',
        sourceMessageId: messageId,
      });

      console.log('Email suppressed (complaint):', {
        email: recipient.emailAddress,
      });
    }
  }
}
