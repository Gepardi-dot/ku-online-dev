import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

import { withSentryRoute } from '@/utils/sentry-route';
import { getEnv } from '@/lib/env';

export const runtime = 'nodejs';

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VONAGE_API_KEY, VONAGE_API_SECRET } = getEnv();
const supabaseAdmin = createAdminClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Vonage webhook validation
function verifyVonageWebhook(body: any, signature?: string): boolean {
  // In production, you should verify the webhook signature
  // For now, we'll log and accept all webhooks for testing
  if (!signature) {
    console.warn('No Vonage signature provided - webhook verification skipped');
    return true;
  }
  
  // TODO: Implement proper signature verification in production
  // You would verify the signature using your Vonage API secret
  return true;
}

// Handle incoming SMS messages
async function handleIncomingSMS(body: any) {
  const { msisdn, to, text, messageId, type, 'message-timestamp': timestamp } = body;
  
  console.log('📨 Incoming SMS:', {
    from: msisdn,
    to,
    message: text,
    messageId,
    timestamp,
  });

  // Store the SMS in your database for logging/analysis
  try {
    const { error } = await supabaseAdmin
      .from('vonage_sms_logs')
      .insert({
        message_id: messageId,
        from_number: msisdn,
        to_number: to,
        message_text: text,
        message_type: type,
        received_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
        direction: 'inbound',
      });

    if (error) {
      console.error('Failed to store SMS log:', error);
    }
  } catch (error) {
    console.error('Error storing SMS:', error);
  }

  // You can implement custom logic here:
  // - Forward SMS to app notifications
  // - Trigger automated responses
  // - Update user records
  // - Send to chat system
  
  return { status: 'received', messageId };
}

// Handle delivery receipts
async function handleDeliveryReceipt(body: any) {
  const { messageId, status, 'message-timestamp': timestamp } = body;
  
  console.log('📋 SMS Delivery Receipt:', {
    messageId,
    status,
    timestamp,
  });

  // Update the message status in your database
  try {
    const { error } = await supabaseAdmin
      .from('vonage_sms_logs')
      .update({ 
        delivery_status: status,
        delivered_at: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString(),
      })
      .eq('message_id', messageId);

    if (error) {
      console.error('Failed to update delivery status:', error);
    }
  } catch (error) {
    console.error('Error updating delivery status:', error);
  }

  return { status: 'updated', messageId };
}

export const POST = withSentryRoute(async (request: Request) => {
  try {
    const body = await request.json();
    const signature = request.headers.get('vonage-signature') ?? undefined;
    
    console.log('🔔 Vonage webhook received:', { 
      type: body.type || 'unknown',
      hasSignature: !!signature,
    });

    // Verify webhook signature (skip for development)
    if (!verifyVonageWebhook(body, signature)) {
      console.error('Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    let result;

    // Handle different webhook types
    switch (body.type) {
      case 'text':
        result = await handleIncomingSMS(body);
        break;
        
      case 'delivery-receipt':
        result = await handleDeliveryReceipt(body);
        break;
        
      default:
        console.log('Unhandled webhook type:', body.type);
        result = { status: 'received', type: body.type };
    }

    return NextResponse.json({ 
      status: 'ok',
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Vonage webhook error:', error);
    return NextResponse.json({ 
      error: 'Webhook processing failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}, 'vonage-webhook');

export const GET = withSentryRoute(async () => {
  // Health check endpoint
  return NextResponse.json({ 
    status: 'active',
    service: 'vonage-webhook',
    timestamp: new Date().toISOString(),
    configured: !!(VONAGE_API_KEY && VONAGE_API_SECRET),
  });
}, 'vonage-webhook-health');
