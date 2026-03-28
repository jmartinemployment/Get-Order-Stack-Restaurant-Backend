import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { sendContactInquiry } from '../services/email.service';
import { logger } from '../utils/logger';

const router = Router();

const contactRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many contact requests. Please try again later.' },
});

const contactSchema = z.object({
  name:    z.string().min(2).max(100),
  email:   z.string().email().max(254),
  phone:   z.string().max(30).optional(),
  company: z.string().max(100).optional(),
  message: z.string().min(10).max(5000),
  _honey:  z.string().max(0),
});

// POST /api/contact — public, no auth required
router.post('/', contactRateLimiter, async (req, res) => {
  const parsed = contactSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'Invalid form data.' });
    return;
  }

  // Honeypot filled — silent reject
  if (parsed.data._honey) {
    res.status(200).json({ success: true, message: 'Message sent successfully!' });
    return;
  }

  try {
    const { name, email, message, phone, company } = parsed.data;
    await sendContactInquiry(name, email, message, phone, company);
    logger.info('[Contact] Inquiry received', { name, email });
    res.json({ success: true, message: 'Message sent successfully!' });
  } catch (error) {
    logger.error('[Contact] Failed to send inquiry email', { error });
    res.status(500).json({ success: false, error: 'Failed to send. Please try again.' });
  }
});

export default router;
