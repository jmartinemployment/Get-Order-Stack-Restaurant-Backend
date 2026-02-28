import Stripe from 'stripe';
import { PrismaClient } from '@prisma/client';
import { calculatePlatformFee } from '../config/platform-fees';
import { getSecret } from '../utils/secrets';

const prisma = new PrismaClient();

const stripeKey = getSecret('STRIPE_SECRET_KEY');
if (!stripeKey) {
  console.warn('[Stripe] STRIPE_SECRET_KEY is not set — Stripe payment operations will fail');
}

const stripe = new Stripe(stripeKey, {
  apiVersion: '2025-12-15.clover'
});

export interface CreatePaymentIntentParams {
  orderId: string;
  amount: number;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  success: boolean;
  clientSecret?: string;
  paymentIntentId?: string;
  error?: string;
}

export const stripeService = {
  /**
   * Create a PaymentIntent for an order
   * Amount should be in dollars - we convert to cents
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    const { orderId, amount, currency = 'usd', metadata = {} } = params;

    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { customer: true, restaurant: true }
      });

      if (!order) {
        return { success: false, error: 'Order not found' };
      }

      if (order.stripePaymentIntentId) {
        const existingIntent = await stripe.paymentIntents.retrieve(order.stripePaymentIntentId);
        if (existingIntent.status !== 'canceled') {
          return {
            success: true,
            clientSecret: existingIntent.client_secret!,
            paymentIntentId: existingIntent.id
          };
        }
      }

      const amountInCents = Math.round(amount * 100);

      const intentParams: Stripe.PaymentIntentCreateParams = {
        amount: amountInCents,
        currency,
        metadata: {
          orderId,
          orderNumber: order.orderNumber,
          restaurantId: order.restaurantId,
          restaurantName: order.restaurant.name,
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true
        }
      };

      // Add platform fee + transfer when merchant has a Stripe connected account
      if (order.restaurant.stripeConnectedAccountId) {
        const fee = calculatePlatformFee(
          amountInCents,
          order.restaurant.platformFeePercent,
          order.restaurant.platformFeeFixed,
        );
        intentParams.application_fee_amount = fee;
        intentParams.transfer_data = {
          destination: order.restaurant.stripeConnectedAccountId,
        };
      }

      const paymentIntent = await stripe.paymentIntents.create(intentParams);

      await prisma.order.update({
        where: { id: orderId },
        data: {
          stripePaymentIntentId: paymentIntent.id,
          paymentStatus: 'pending'
        }
      });

      console.log(`[Stripe] Created PaymentIntent ${paymentIntent.id} for order ${order.orderNumber}`);

      return {
        success: true,
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id
      };
    } catch (error) {
      console.error('[Stripe] Error creating PaymentIntent:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create payment intent'
      };
    }
  },

  /**
   * Retrieve a PaymentIntent status
   */
  async getPaymentIntent(paymentIntentId: string) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return { success: true, paymentIntent };
    } catch (error) {
      console.error('[Stripe] Error retrieving PaymentIntent:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to retrieve payment intent'
      };
    }
  },

  /**
   * Cancel a PaymentIntent
   */
  async cancelPaymentIntent(paymentIntentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      await stripe.paymentIntents.cancel(paymentIntentId);
      console.log(`[Stripe] Cancelled PaymentIntent ${paymentIntentId}`);
      return { success: true };
    } catch (error) {
      console.error('[Stripe] Error cancelling PaymentIntent:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to cancel payment intent'
      };
    }
  },

  /**
   * Process webhook events from Stripe
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<{ success: boolean; error?: string }> {
    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const orderId = paymentIntent.metadata.orderId;

          if (orderId) {
            await prisma.order.update({
              where: { id: orderId },
              data: {
                paymentStatus: 'paid',
                paymentMethod: paymentIntent.payment_method_types[0] || 'card'
              }
            });
            console.log(`[Stripe Webhook] Payment succeeded for order ${orderId}`);
          }
          break;
        }

        case 'payment_intent.payment_failed': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const orderId = paymentIntent.metadata.orderId;

          if (orderId) {
            await prisma.order.update({
              where: { id: orderId },
              data: { paymentStatus: 'failed' }
            });
            console.log(`[Stripe Webhook] Payment failed for order ${orderId}`);
          }
          break;
        }

        case 'payment_intent.canceled': {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          const orderId = paymentIntent.metadata.orderId;

          if (orderId) {
            await prisma.order.update({
              where: { id: orderId },
              data: { paymentStatus: 'cancelled' }
            });
            console.log(`[Stripe Webhook] Payment cancelled for order ${orderId}`);
          }
          break;
        }

        default:
          console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
      }

      return { success: true };
    } catch (error) {
      console.error('[Stripe Webhook] Error processing event:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process webhook'
      };
    }
  },

  /**
   * Verify webhook signature
   */
  constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event | null {
    try {
      const webhookSecret = getSecret('STRIPE_WEBHOOK_SECRET');
      if (!webhookSecret || webhookSecret === 'whsec_placeholder') {
        console.error('[Stripe] Webhook secret not configured — rejecting unverified event');
        return null;
      }
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      console.error('[Stripe] Webhook signature verification failed:', error);
      return null;
    }
  },

  /**
   * Create a refund for a payment
   */
  async createRefund(paymentIntentId: string, amount?: number): Promise<{ success: boolean; refund?: Stripe.Refund; error?: string }> {
    try {
      const refundParams: Stripe.RefundCreateParams = {
        payment_intent: paymentIntentId
      };

      if (amount) {
        refundParams.amount = Math.round(amount * 100);
      }

      const refund = await stripe.refunds.create(refundParams);
      console.log(`[Stripe] Created refund ${refund.id} for PaymentIntent ${paymentIntentId}`);

      return { success: true, refund };
    } catch (error) {
      console.error('[Stripe] Error creating refund:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create refund'
      };
    }
  }
};
