import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface NotificationSettings {
  smsEnabled: boolean;
  smsProvider: 'twilio' | 'none';
  smsAccountSid: string;
  smsAuthToken: string;
  smsFromNumber: string;
  emailEnabled: boolean;
  emailProvider: 'sendgrid' | 'none';
  emailApiKey: string;
  emailFromAddress: string;
  orderReadyNotifyCustomer: boolean;
  orderReadyNotifyServer: boolean;
  orderReadyChannels: ('sms' | 'email' | 'in_app')[];
  orderReadyTemplate: string;
}

interface NotificationResult {
  sent: boolean;
  channel: string;
  reason?: string;
}

function interpolateTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

async function sendSms(
  to: string,
  message: string,
  settings: NotificationSettings
): Promise<NotificationResult> {
  if (settings.smsProvider === 'none' || !settings.smsAccountSid || !settings.smsAuthToken || !settings.smsFromNumber) {
    return { sent: false, channel: 'sms', reason: 'provider_not_configured' };
  }

  // STUBBED: Twilio integration ready to unwrap
  // When ready, replace the console.log below with:
  //
  // const client = twilio(settings.smsAccountSid, settings.smsAuthToken);
  // await client.messages.create({
  //   body: message,
  //   from: settings.smsFromNumber,
  //   to,
  // });

  console.log(`[Notification] SMS STUB — would send to ${to}: "${message}"`);
  return { sent: false, channel: 'sms', reason: 'provider_stubbed' };
}

async function sendEmail(
  to: string,
  subject: string,
  body: string,
  settings: NotificationSettings
): Promise<NotificationResult> {
  if (settings.emailProvider === 'none' || !settings.emailApiKey || !settings.emailFromAddress) {
    return { sent: false, channel: 'email', reason: 'provider_not_configured' };
  }

  // STUBBED: SendGrid integration ready to unwrap
  // When ready, replace the console.log below with:
  //
  // const sgMail = require('@sendgrid/mail');
  // sgMail.setApiKey(settings.emailApiKey);
  // await sgMail.send({
  //   to,
  //   from: settings.emailFromAddress,
  //   subject,
  //   text: body,
  // });

  console.log(`[Notification] Email STUB — would send to ${to}: subject="${subject}", body="${body}"`);
  return { sent: false, channel: 'email', reason: 'provider_stubbed' };
}

async function onOrderReady(orderId: string): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        restaurant: true,
      },
    });

    if (!order) {
      console.log(`[Notification] Order ${orderId} not found — skipping notification`);
      return results;
    }

    const rawSettings = (order.restaurant as Record<string, unknown>)?.notificationSettings;
    if (!rawSettings || typeof rawSettings !== 'object') {
      console.log(`[Notification] No notification settings for restaurant ${order.restaurantId} — skipping`);
      return results;
    }

    const settings = rawSettings as unknown as NotificationSettings;

    // Kiosk, delivery, online, and pickup orders ALWAYS notify the customer —
    // the opt-out setting only applies to POS orders (register/terminal) where
    // the server tells the customer verbally.
    // Delivery and online channels may also trigger additional platform-specific
    // notifications (e.g. DoorDash driver updates) handled elsewhere.
    const forcedNotificationSources = ['kiosk', 'delivery', 'online', 'pickup'];
    const orderSource = (order as Record<string, unknown>).orderSource as string | undefined;
    const isForced = orderSource !== undefined && forcedNotificationSources.includes(orderSource);

    if (!isForced && !settings.orderReadyNotifyCustomer) {
      console.log(`[Notification] Customer notification disabled for restaurant ${order.restaurantId}`);
      return results;
    }

    const customer = order.customer;
    if (!customer) {
      console.log(`[Notification] No customer on order ${order.orderNumber} — skipping notification`);
      return results;
    }

    const templateVars: Record<string, string> = {
      name: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'Guest',
      number: order.orderNumber ?? orderId.slice(0, 8),
    };

    const message = interpolateTemplate(
      settings.orderReadyTemplate || 'Hi {name}, your order #{number} is ready!',
      templateVars
    );

    const channels = settings.orderReadyChannels ?? [];

    if (channels.includes('sms') && settings.smsEnabled && customer.phone) {
      const smsResult = await sendSms(customer.phone, message, settings);
      results.push(smsResult);
    }

    if (channels.includes('email') && settings.emailEnabled && customer.email) {
      const emailResult = await sendEmail(
        customer.email,
        'Your order is ready!',
        message,
        settings
      );
      results.push(emailResult);
    }

    console.log(`[Notification] Order ${order.orderNumber} ready — ${results.length} notification(s) attempted`);
  } catch (error: unknown) {
    console.error(`[Notification] Error processing order ${orderId}:`, error instanceof Error ? error.message : String(error));
  }

  return results;
}

export const notificationService = {
  onOrderReady,
};
