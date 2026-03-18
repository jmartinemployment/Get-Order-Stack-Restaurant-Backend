import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getSecret } from '../utils/secrets';
import { logger } from '../utils/logger';
import { auditLog } from '../utils/audit';
import { auditCtx } from '../utils/audit-context';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// --- Helper: get PayPal access token ---

async function getPayPalAccessToken(): Promise<string> {
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

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

// ============================================================
// PAYPAL PARTNER REFERRALS
// ============================================================

/**
 * POST /:merchantId/connect/paypal/create-referral
 * Creates a PayPal Partner Referral link for merchant onboarding.
 */
router.post('/:merchantId/connect/paypal/create-referral', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    if (restaurant.paypalMerchantId) {
      res.json({ merchantId: restaurant.paypalMerchantId, status: 'already_connected' });
      return;
    }

    const token = await getPayPalAccessToken();
    const returnUrl = `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/setup?paypal=complete`;

    const response = await fetch(`${PAYPAL_API_BASE}/v2/customer/partner-referrals`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tracking_id: restaurantId,
        operations: [{
          operation: 'API_INTEGRATION',
          api_integration_preference: {
            rest_api_integration: {
              integration_method: 'PAYPAL',
              integration_type: 'THIRD_PARTY',
              third_party_details: {
                features: ['PAYMENT', 'REFUND', 'PARTNER_FEE'],
              },
            },
          },
        }],
        products: ['EXPRESS_CHECKOUT'],
        legal_consents: [{
          type: 'SHARE_DATA_CONSENT',
          granted: true,
        }],
        partner_config_override: {
          return_url: returnUrl,
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error(`[PayPal Connect] Referral creation failed (${response.status}):`, text);
      res.status(500).json({ error: `PayPal API error: ${response.status}` });
      return;
    }

    const data = await response.json() as {
      links: Array<{ rel: string; href: string }>;
    };

    const actionUrl = data.links.find(l => l.rel === 'action_url')?.href;

    if (!actionUrl) {
      res.status(500).json({ error: 'No action_url in PayPal response' });
      return;
    }

    logger.info(`[PayPal Connect] Created referral for restaurant ${restaurant.name}`);
    await auditLog('payment_paypal_onboarding_started', { ...auditCtx(req), metadata: { restaurantId } });
    res.json({ actionUrl });
  } catch (error: unknown) {
    logger.error('[PayPal Connect] Error creating referral:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create PayPal referral' });
  }
});

/**
 * GET /:merchantId/connect/paypal/status
 * Returns the PayPal merchant integration status.
 */
router.get('/:merchantId/connect/paypal/status', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant?.paypalMerchantId) {
      res.json({ status: 'none' });
      return;
    }

    const partnerId = process.env.PAYPAL_PARTNER_ID ?? '';
    const token = await getPayPalAccessToken();

    const response = await fetch(
      `${PAYPAL_API_BASE}/v1/customer/partners/${partnerId}/merchant-integrations/${restaurant.paypalMerchantId}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      res.json({ status: 'pending', merchantId: restaurant.paypalMerchantId });
      return;
    }

    const data = await response.json() as {
      payments_receivable: boolean;
      primary_email_confirmed: boolean;
      oauth_integrations?: Array<{ oauth_third_party?: Array<unknown> }>;
    };

    res.json({
      status: data.payments_receivable ? 'connected' : 'pending',
      paymentsReceivable: data.payments_receivable,
      primaryEmailConfirmed: data.primary_email_confirmed,
      merchantId: restaurant.paypalMerchantId,
    });
  } catch (error: unknown) {
    logger.error('[PayPal Connect] Error retrieving status:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to retrieve PayPal status' });
  }
});

/**
 * POST /:merchantId/connect/paypal/complete
 * Called after merchant returns from PayPal with their merchantIdInPayPal.
 */
router.post('/:merchantId/connect/paypal/complete', async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { merchantId } = req.body as { merchantId?: string };

    if (!merchantId) {
      res.status(400).json({ error: 'merchantId is required' });
      return;
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        paypalMerchantId: merchantId,
        paymentProcessor: 'paypal',
      },
    });

    logger.info(`[PayPal Connect] Merchant ${merchantId} linked to restaurant ${restaurant.name}`);
    await auditLog('payment_paypal_connected', { ...auditCtx(req), metadata: { restaurantId, paypalMerchantId: merchantId } });
    res.json({ success: true, merchantId });
  } catch (error: unknown) {
    logger.error('[PayPal Connect] Error completing connection:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete PayPal connection' });
  }
});

export default router;
