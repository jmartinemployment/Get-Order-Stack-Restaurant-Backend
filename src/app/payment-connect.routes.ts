import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';

const router = Router({ mergeParams: true });
const prisma = new PrismaClient();

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[Stripe Connect] STRIPE_SECRET_KEY is not set — Stripe Connect operations will fail');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2025-12-15.clover',
});

const PAYPAL_API_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

// --- Helper: get PayPal access token ---

async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID ?? '';
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET ?? '';
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
// STRIPE CONNECT
// ============================================================

/**
 * POST /:restaurantId/connect/stripe/create-account
 * Creates a Stripe Express connected account for the merchant.
 */
router.post('/:restaurantId/connect/stripe/create-account', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      res.status(404).json({ error: 'Restaurant not found' });
      return;
    }

    // If already has a connected account, return it
    if (restaurant.stripeConnectedAccountId) {
      res.json({ accountId: restaurant.stripeConnectedAccountId });
      return;
    }

    const account = await stripe.accounts.create({
      type: 'express',
      metadata: {
        restaurantId,
        restaurantName: restaurant.name,
      },
      business_profile: {
        name: restaurant.name,
      },
    });

    await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        stripeConnectedAccountId: account.id,
        paymentProcessor: 'stripe',
      },
    });

    console.log(`[Stripe Connect] Created account ${account.id} for restaurant ${restaurant.name}`);
    res.json({ accountId: account.id });
  } catch (error: unknown) {
    console.error('[Stripe Connect] Error creating account:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create Stripe account' });
  }
});

/**
 * POST /:restaurantId/connect/stripe/account-link
 * Creates a one-time Stripe Account Link for hosted onboarding.
 */
router.post('/:restaurantId/connect/stripe/account-link', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
    const { returnUrl, refreshUrl } = req.body as { returnUrl?: string; refreshUrl?: string };

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant?.stripeConnectedAccountId) {
      res.status(400).json({ error: 'No Stripe account found. Create one first.' });
      return;
    }

    const accountLink = await stripe.accountLinks.create({
      account: restaurant.stripeConnectedAccountId,
      return_url: returnUrl ?? `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/setup?stripe=complete`,
      refresh_url: refreshUrl ?? `${process.env.FRONTEND_URL ?? 'http://localhost:4200'}/setup?stripe=refresh`,
      type: 'account_onboarding',
    });

    res.json({ url: accountLink.url });
  } catch (error: unknown) {
    console.error('[Stripe Connect] Error creating account link:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create account link' });
  }
});

/**
 * GET /:restaurantId/connect/stripe/status
 * Returns the Stripe connected account's onboarding status.
 */
router.get('/:restaurantId/connect/stripe/status', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant?.stripeConnectedAccountId) {
      res.json({ status: 'none' });
      return;
    }

    const account = await stripe.accounts.retrieve(restaurant.stripeConnectedAccountId);

    res.json({
      status: account.charges_enabled ? 'connected' : 'pending',
      chargesEnabled: account.charges_enabled,
      detailsSubmitted: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      accountId: account.id,
    });
  } catch (error: unknown) {
    console.error('[Stripe Connect] Error retrieving status:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to retrieve account status' });
  }
});

// ============================================================
// PAYPAL PARTNER REFERRALS
// ============================================================

/**
 * POST /:restaurantId/connect/paypal/create-referral
 * Creates a PayPal Partner Referral link for merchant onboarding.
 */
router.post('/:restaurantId/connect/paypal/create-referral', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

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
      console.error(`[PayPal Connect] Referral creation failed (${response.status}):`, text);
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

    console.log(`[PayPal Connect] Created referral for restaurant ${restaurant.name}`);
    res.json({ actionUrl });
  } catch (error: unknown) {
    console.error('[PayPal Connect] Error creating referral:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create PayPal referral' });
  }
});

/**
 * GET /:restaurantId/connect/paypal/status
 * Returns the PayPal merchant integration status.
 */
router.get('/:restaurantId/connect/paypal/status', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;

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
    console.error('[PayPal Connect] Error retrieving status:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to retrieve PayPal status' });
  }
});

/**
 * POST /:restaurantId/connect/paypal/complete
 * Called after merchant returns from PayPal with their merchantIdInPayPal.
 */
router.post('/:restaurantId/connect/paypal/complete', async (req: Request, res: Response) => {
  try {
    const { restaurantId } = req.params;
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

    console.log(`[PayPal Connect] Merchant ${merchantId} linked to restaurant ${restaurant.name}`);
    res.json({ success: true, merchantId });
  } catch (error: unknown) {
    console.error('[PayPal Connect] Error completing connection:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to complete PayPal connection' });
  }
});

export default router;
