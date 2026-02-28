import { PrismaClient } from '@prisma/client';
import { calculatePlatformFee } from '../config/platform-fees';
import { getSecret } from '../utils/secrets';

const prisma = new PrismaClient();

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

let accessToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Build the PayPal-Auth-Assertion JWT header for API calls on behalf of a connected seller.
 * Format: base64url({ "alg": "none" }) . base64url({ "iss": clientId, "payer_id": merchantId }) .
 * Per: https://developer.paypal.com/api/rest/requests/#paypal-auth-assertion
 */
function buildPayPalAuthAssertion(merchantPayerId: string): string {
  const clientId = getSecret('PAYPAL_CLIENT_ID');
  const header = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: clientId, payer_id: merchantPayerId })).toString('base64url');
  return `${header}.${payload}.`;
}

/**
 * Build headers for API calls on behalf of a connected merchant.
 * Includes PayPal-Auth-Assertion and PayPal-Partner-Attribution-Id when available.
 */
function buildMerchantHeaders(token: string, merchantPayerId?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  if (merchantPayerId) {
    headers['PayPal-Auth-Assertion'] = buildPayPalAuthAssertion(merchantPayerId);
  }

  const bnCode = process.env.PAYPAL_BN_CODE;
  if (bnCode) {
    headers['PayPal-Partner-Attribution-Id'] = bnCode;
  }

  return headers;
}

export interface CreatePayPalOrderParams {
  orderId: string;
  amount: number;
  currency?: string;
}

export interface PayPalOrderResult {
  success: boolean;
  paypalOrderId?: string;
  error?: string;
}

export interface PayPalCaptureResult {
  success: boolean;
  captureId?: string;
  error?: string;
}

export interface PayPalRefundResult {
  success: boolean;
  refundId?: string;
  amount?: number;
  status?: string;
  error?: string;
}

export const paypalService = {
  async getAccessToken(): Promise<string> {
    if (accessToken && Date.now() < tokenExpiresAt) {
      return accessToken;
    }

    const clientId = getSecret('PAYPAL_CLIENT_ID');
    const clientSecret = getSecret('PAYPAL_CLIENT_SECRET');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`PayPal auth failed (${response.status}): ${text}`);
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    accessToken = data.access_token;
    // Expire 60s early to avoid edge-case rejections
    tokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;

    console.log('[PayPal] Access token obtained');
    return accessToken;
  },

  async createOrder(params: CreatePayPalOrderParams): Promise<PayPalOrderResult> {
    const { orderId, amount, currency = 'USD' } = params;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { restaurant: true },
      });

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      // Idempotency: if a PayPal order already exists and isn't voided, return it
      if (order.paypalOrderId) {
        try {
          const existing = await paypalService.getOrderStatus(order.paypalOrderId);
          if (existing.success && existing.status !== 'VOIDED') {
            console.log(`[PayPal] Returning existing order ${order.paypalOrderId} for order ${order.orderNumber}`);
            return { success: true, paypalOrderId: order.paypalOrderId };
          }
        } catch {
          // Existing order invalid — create a new one
        }
      }

      const token = await paypalService.getAccessToken();

      const purchaseUnit: Record<string, unknown> = {
        reference_id: orderId,
        description: `Order ${order.orderNumber} — ${order.restaurant.name}`,
        amount: {
          currency_code: currency,
          value: amount.toFixed(2),
        },
      };

      // Add platform fee when merchant has a PayPal connected account
      if (order.restaurant.paypalMerchantId) {
        const amountCents = Math.round(amount * 100);
        const feeCents = calculatePlatformFee(
          amountCents,
          order.restaurant.platformFeePercent,
          order.restaurant.platformFeeFixed,
        );
        purchaseUnit.payee = {
          merchant_id: order.restaurant.paypalMerchantId,
        };
        purchaseUnit.payment_instruction = {
          platform_fees: [{
            amount: {
              currency_code: currency,
              value: (feeCents / 100).toFixed(2),
            },
          }],
        };
      }

      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
        method: 'POST',
        headers: buildMerchantHeaders(token, order.restaurant.paypalMerchantId),
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [purchaseUnit],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[PayPal] Create order failed (${response.status}):`, text);
        return { success: false, error: `PayPal API error: ${response.status}` };
      }

      const data = await response.json() as { id: string };

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paypalOrderId: data.id,
          paymentStatus: 'pending',
        },
      });

      console.log(`[PayPal] Created order ${data.id} for order ${order.orderNumber}`);
      return { success: true, paypalOrderId: data.id };
    } catch (error: unknown) {
      console.error('[PayPal] Error creating order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PayPal order',
      };
    }
  },

  async captureOrder(paypalOrderId: string, orderId: string): Promise<PayPalCaptureResult> {
    try {
      const token = await paypalService.getAccessToken();

      // Look up restaurant's paypalMerchantId for auth assertion
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { restaurant: { select: { paypalMerchantId: true } } },
      });

      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}/capture`, {
        method: 'POST',
        headers: buildMerchantHeaders(token, order?.restaurant?.paypalMerchantId),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[PayPal] Capture failed (${response.status}):`, text);
        return { success: false, error: `PayPal capture failed: ${response.status}` };
      }

      const data = await response.json() as {
        id: string;
        status: string;
        purchase_units: Array<{
          payments: {
            captures: Array<{ id: string }>;
          };
        }>;
      };

      const captureId = data.purchase_units[0]?.payments?.captures?.[0]?.id;

      await prisma.order.update({
        where: { id: orderId },
        data: {
          paypalCaptureId: captureId ?? null,
          paymentStatus: 'paid',
          paymentMethod: 'paypal',
        },
      });

      console.log(`[PayPal] Captured order ${paypalOrderId}, captureId=${captureId}`);
      return { success: true, captureId: captureId ?? undefined };
    } catch (error: unknown) {
      console.error('[PayPal] Error capturing order:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to capture PayPal order',
      };
    }
  },

  async getOrderStatus(paypalOrderId: string): Promise<{ success: boolean; status?: string; paypalOrderId?: string; error?: string }> {
    try {
      const token = await paypalService.getAccessToken();

      const response = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders/${paypalOrderId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `PayPal API error (${response.status}): ${text}` };
      }

      const data = await response.json() as { id: string; status: string };
      return { success: true, status: data.status, paypalOrderId: data.id };
    } catch (error: unknown) {
      console.error('[PayPal] Error getting order status:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get PayPal order status',
      };
    }
  },

  async cancelOrder(paypalOrderId: string): Promise<{ success: boolean; error?: string }> {
    // PayPal orders auto-expire after 3 hours if not captured — no API call needed
    console.log(`[PayPal] Cancel requested for order ${paypalOrderId} (auto-expires in 3h)`);
    return { success: true };
  },

  async refundCapture(captureId: string, amount?: number): Promise<PayPalRefundResult> {
    try {
      const token = await paypalService.getAccessToken();

      const body: Record<string, unknown> = {};
      if (amount !== undefined) {
        body.amount = {
          currency_code: 'USD',
          value: amount.toFixed(2),
        };
      }

      const response = await fetch(`${PAYPAL_API_BASE}/v2/payments/captures/${captureId}/refund`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[PayPal] Refund failed (${response.status}):`, text);
        return { success: false, error: `PayPal refund failed: ${response.status}` };
      }

      const data = await response.json() as {
        id: string;
        status: string;
        amount?: { value: string };
      };

      console.log(`[PayPal] Refund ${data.id} created for capture ${captureId}`);
      return {
        success: true,
        refundId: data.id,
        amount: data.amount ? Number.parseFloat(data.amount.value) : undefined,
        status: data.status,
      };
    } catch (error: unknown) {
      console.error('[PayPal] Error creating refund:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create PayPal refund',
      };
    }
  },

  async handleWebhookEvent(eventType: string, resource: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    try {
      switch (eventType) {
        case 'PAYMENT.CAPTURE.COMPLETED': {
          const captureId = resource.id as string;
          const order = await prisma.order.findFirst({
            where: { paypalCaptureId: captureId },
          });
          if (order) {
            await prisma.order.update({
              where: { id: order.id },
              data: { paymentStatus: 'paid' },
            });
            console.log(`[PayPal Webhook] Capture completed for order ${order.orderNumber}`);
          }
          break;
        }

        case 'PAYMENT.CAPTURE.REFUNDED': {
          const captureId = resource.id as string;
          const order = await prisma.order.findFirst({
            where: { paypalCaptureId: captureId },
          });
          if (order) {
            await prisma.order.update({
              where: { id: order.id },
              data: { paymentStatus: 'refunded' },
            });
            console.log(`[PayPal Webhook] Capture refunded for order ${order.orderNumber}`);
          }
          break;
        }

        default:
          console.log(`[PayPal Webhook] Unhandled event type: ${eventType}`);
      }

      return { success: true };
    } catch (error: unknown) {
      console.error('[PayPal Webhook] Error processing event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process webhook',
      };
    }
  },
};
