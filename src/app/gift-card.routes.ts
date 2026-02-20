import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

const prisma = new PrismaClient();
const router = Router({ mergeParams: true });

// --- Zod schemas ---

const createGiftCardSchema = z.object({
  type: z.enum(['physical', 'digital']),
  initialBalance: z.number().positive(),
  recipientName: z.string().optional(),
  recipientEmail: z.string().email().optional(),
  purchasedBy: z.string().optional(),
});

const redeemSchema = z.object({
  code: z.string().min(1),
  amount: z.number().positive(),
  orderId: z.string().optional(),
  redeemedBy: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'disabled']),
});

// --- Helpers ---

function generateGiftCardCode(): string {
  return crypto.randomBytes(8).toString('hex').toUpperCase().slice(0, 16);
}

// --- Routes ---

// GET /:restaurantId/gift-cards
router.get('/:restaurantId/gift-cards', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  try {
    const cards = await prisma.giftCard.findMany({
      where: { restaurantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(cards);
  } catch (error: unknown) {
    console.error('[GiftCard] List error:', error);
    res.status(500).json({ error: 'Failed to list gift cards' });
  }
});

// POST /:restaurantId/gift-cards
router.post('/:restaurantId/gift-cards', async (req: Request, res: Response) => {
  const { restaurantId } = req.params;
  const parsed = createGiftCardSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    let code = generateGiftCardCode();
    let attempts = 0;
    while (attempts < 5) {
      const existing = await prisma.giftCard.findUnique({ where: { code } });
      if (!existing) break;
      code = generateGiftCardCode();
      attempts++;
    }

    const card = await prisma.giftCard.create({
      data: {
        restaurantId,
        code,
        type: parsed.data.type,
        initialBalance: parsed.data.initialBalance,
        currentBalance: parsed.data.initialBalance,
        purchasedBy: parsed.data.purchasedBy,
        recipientName: parsed.data.recipientName,
        recipientEmail: parsed.data.recipientEmail,
      },
    });
    res.status(201).json(card);
  } catch (error: unknown) {
    console.error('[GiftCard] Create error:', error);
    res.status(500).json({ error: 'Failed to create gift card' });
  }
});

// GET /:restaurantId/gift-cards/balance/:code
router.get('/:restaurantId/gift-cards/balance/:code', async (req: Request, res: Response) => {
  const { code } = req.params;
  try {
    const card = await prisma.giftCard.findUnique({ where: { code } });
    if (!card) {
      res.status(404).json({ error: 'Gift card not found' });
      return;
    }
    res.json({
      balance: card.currentBalance,
      status: card.status,
      card,
    });
  } catch (error: unknown) {
    console.error('[GiftCard] Balance check error:', error);
    res.status(500).json({ error: 'Failed to check balance' });
  }
});

// POST /:restaurantId/gift-cards/redeem
router.post('/:restaurantId/gift-cards/redeem', async (req: Request, res: Response) => {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.giftCard.findUnique({ where: { code: parsed.data.code } });
      if (!card) throw new Error('Gift card not found');
      if (card.status !== 'active') throw new Error('Gift card is not active');
      if (Number(card.currentBalance) < parsed.data.amount) {
        throw new Error(`Insufficient balance. Available: $${card.currentBalance}`);
      }

      const newBalance = Number(card.currentBalance) - parsed.data.amount;

      const updatedCard = await tx.giftCard.update({
        where: { id: card.id },
        data: {
          currentBalance: newBalance,
          status: newBalance === 0 ? 'redeemed' : 'active',
        },
      });

      const redemption = await tx.giftCardRedemption.create({
        data: {
          giftCardId: card.id,
          amount: parsed.data.amount,
          orderId: parsed.data.orderId,
          redeemedBy: parsed.data.redeemedBy,
        },
      });

      return { card: updatedCard, redemption };
    });

    res.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Redemption failed';
    if (message.includes('not found') || message.includes('not active') || message.includes('Insufficient')) {
      res.status(400).json({ error: message });
      return;
    }
    console.error('[GiftCard] Redeem error:', error);
    res.status(500).json({ error: 'Failed to redeem gift card' });
  }
});

// PATCH /:restaurantId/gift-cards/:cardId
router.patch('/:restaurantId/gift-cards/:cardId', async (req: Request, res: Response) => {
  const { restaurantId, cardId } = req.params;
  const parsed = updateStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  try {
    const card = await prisma.giftCard.update({
      where: { id: cardId, restaurantId },
      data: { status: parsed.data.status },
    });
    res.json(card);
  } catch (error: unknown) {
    if ((error as { code?: string }).code === 'P2025') {
      res.status(404).json({ error: 'Gift card not found' });
      return;
    }
    console.error('[GiftCard] Update error:', error);
    res.status(500).json({ error: 'Failed to update gift card' });
  }
});

// GET /:restaurantId/gift-cards/:cardId/redemptions
router.get('/:restaurantId/gift-cards/:cardId/redemptions', async (req: Request, res: Response) => {
  const { cardId } = req.params;
  try {
    const redemptions = await prisma.giftCardRedemption.findMany({
      where: { giftCardId: cardId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(redemptions);
  } catch (error: unknown) {
    console.error('[GiftCard] Redemptions list error:', error);
    res.status(500).json({ error: 'Failed to list redemptions' });
  }
});

export default router;
