import { Router, Request, Response } from 'express';
import { randomBytes, createHash } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authService, MFA_REQUIRED_ROLES, RESTAURANT_SELECT } from '../services/auth.service';
import { requireAuth, requireAdmin, requireSuperAdmin, requireMerchantManager } from '../middleware/auth.middleware';
import { auditLog } from '../utils/audit';
import { logger } from '../utils/logger';
import { disableInactiveAccounts } from '../jobs/account-maintenance';
import { mfaService } from '../services/mfa.service';
import { trackPasswordResetRequest, trackMfaFailed } from '../services/security-alert.service';
import { sendMfaOtpEmail, sendSignupNotification } from '../services/email.service';
import { prisma } from '../lib/prisma';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('FATAL: JWT_SECRET environment variable is not set.');
}

// Rate limit auth endpoints to prevent brute-force attacks
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 6, // 6 attempts per window — PCI DSS 8.2.6
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => {
    const ip = req.ip ?? 'unknown';
    const email = (req.body?.email ?? '').toLowerCase().trim();
    return email ? `${ip}:${email}` : ip;
  },
});

// Stricter rate limit for PIN auth (4-6 digit PINs are easily brute-forced)
const pinRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 5, // 5 attempts per window
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many PIN attempts. Please try again in 15 minutes.' },
  keyGenerator: (req) => req.ip ?? 'unknown',
});

// ============ Email Verification (shared by signup + login WFH) ============

const sendVerificationSchema = z.object({
  email: z.string().email().transform(v => v.toLowerCase().trim()),
});

// Send a 6-digit OTP to verify email ownership — no account created yet
router.post('/send-verification', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = sendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid email is required' });
      return;
    }
    const { email } = parsed.data;

    // Check if email is already registered
    const existing = await prisma.teamMember.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
      return;
    }

    // Generate 6-digit OTP
    const code = String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, '0');
    const otpHash = await bcrypt.hash(code, 12);
    const emailHash = createHash('sha256').update(email).digest('hex');

    // Upsert PendingVerification — resend overwrites previous code
    await prisma.pendingVerification.upsert({
      where: { emailHash },
      create: {
        emailHash,
        email,
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      },
      update: {
        otpHash,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    // Send OTP email (reuse MFA OTP email template — same 6-digit code pattern)
    await sendMfaOtpEmail(email, null, code);

    // Mask email for frontend display
    const [local, domain] = email.split('@');
    const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.at(-1)}@${domain}`;

    res.json({ sent: true, maskedEmail });
  } catch (error) {
    logger.error('Send verification error:', { error });
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});

// Verify 6-digit OTP — returns a short-lived JWT proving email ownership
router.post('/verify-email', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      res.status(400).json({ error: 'Email and code are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const emailHash = createHash('sha256').update(normalizedEmail).digest('hex');

    const pending = await prisma.pendingVerification.findUnique({ where: { emailHash } });
    if (!pending) {
      res.status(401).json({ error: 'No verification pending for this email. Please request a new code.' });
      return;
    }

    if (pending.expiresAt < new Date()) {
      await prisma.pendingVerification.delete({ where: { emailHash } });
      res.status(401).json({ error: 'Code expired. Please request a new one.' });
      return;
    }

    const isValid = await bcrypt.compare(code, pending.otpHash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid code. Please try again.' });
      return;
    }

    // Delete the pending record — code is consumed
    await prisma.pendingVerification.delete({ where: { emailHash } });

    // Issue a short-lived JWT proving email ownership (30 minutes for signup form)
    const verifiedEmailToken = jwt.sign(
      { email: normalizedEmail, purpose: 'email_verification' },
      JWT_SECRET,
      { expiresIn: '30m' },
    );

    res.json({ verified: true, verifiedEmailToken });
  } catch (error) {
    logger.error('Verify email error:', { error });
    res.status(500).json({ error: 'Verification failed' });
  }
});

// ============ Signup ============

const signupSchema = z.object({
  verifiedEmailToken: z.string(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  password: z.string().min(12),
  businessPhone: z.string().regex(/^\d{10}$/, 'Business phone must be 10 digits'),
  personalPhone: z.string().regex(/^\d{10}$/, 'Personal phone must be 10 digits'),
  businessName: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
  zip: z.string().min(1),
  multipleLocations: z.boolean().default(false),
});

// Public signup — email verified first, then creates everything in one transaction
router.post('/signup', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      const firstError = parsed.error.issues[0];
      res.status(400).json({ error: firstError?.message ?? 'Invalid signup data' });
      return;
    }

    const {
      verifiedEmailToken, firstName, lastName, password,
      businessPhone, personalPhone, businessName,
      address, city, state, zip, multipleLocations,
    } = parsed.data;

    // Verify the email token
    let verifiedEmail: string;
    try {
      const payload = jwt.verify(verifiedEmailToken, JWT_SECRET) as { email: string; purpose: string };
      if (payload.purpose !== 'email_verification') {
        res.status(401).json({ error: 'Invalid verification token' });
        return;
      }
      verifiedEmail = payload.email;
    } catch {
      res.status(401).json({ error: 'Your verification expired. Please verify your email again.' });
      return;
    }

    // Check duplicate email (race condition guard — also checked in send-verification)
    const existingMember = await prisma.teamMember.findUnique({
      where: { email: verifiedEmail },
      select: { id: true },
    });
    if (existingMember) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    // Validate password strength
    const strengthCheck = authService.validatePasswordStrength(password);
    if (!strengthCheck.valid) {
      res.status(400).json({ error: strengthCheck.error });
      return;
    }

    // Hash password
    const passwordHash = await authService.hashPassword(password);

    // Generate slug
    const baseSlug = businessName.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/^-|-$/g, '');
    const suffix = randomBytes(3).toString('hex'); // 6-char hex
    let slug = `${baseSlug}-${suffix}`;

    // Check slug uniqueness, retry once
    const slugExists = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
    if (slugExists) {
      const suffix2 = randomBytes(3).toString('hex');
      slug = `${baseSlug}-${suffix2}`;
      const slugExists2 = await prisma.restaurant.findUnique({ where: { slug }, select: { id: true } });
      if (slugExists2) {
        res.status(500).json({ error: 'Failed to generate unique identifier. Please try again.' });
        return;
      }
    }

    // Create everything in one interactive transaction
    const result = await prisma.$transaction(async (tx) => {
      // Optional: RestaurantGroup (only if multipleLocations checked)
      let restaurantGroupId: string | null = null;
      if (multipleLocations) {
        const group = await tx.restaurantGroup.create({
          data: {
            name: businessName,
            slug,
          },
        });
        restaurantGroupId = group.id;
      }

      // Create Restaurant — networkIp captured from req.ip
      const restaurant = await tx.restaurant.create({
        data: {
          name: businessName,
          email: verifiedEmail,
          phone: businessPhone,
          address, city, state, zip,
          slug,
          networkIp: req.ip ?? null,
          restaurantGroupId,
          merchantProfile: { onboardingComplete: false },
        },
      });

      // Create TeamMember (owner)
      const member = await tx.teamMember.create({
        data: {
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`,
          email: verifiedEmail,
          phone: personalPhone,
          passwordHash,
          role: 'owner',
          restaurantId: restaurant.id,
          restaurantGroupId,
          workFromHome: true, // owner defaults to true
        },
      });

      // Create UserRestaurantAccess
      await tx.userRestaurantAccess.create({
        data: {
          teamMemberId: member.id,
          restaurantId: restaurant.id,
          role: 'owner',
        },
      });

      // Create Device
      const device = await tx.device.create({
        data: {
          restaurantId: restaurant.id,
          teamMemberId: member.id,
          deviceName: `${firstName}'s Browser`,
          deviceType: 'terminal',
          status: 'active',
          hardwareInfo: {
            platform: 'Browser',
            userAgent: req.headers['user-agent'],
            ip: req.ip,
          },
        },
      });

      // Record password history
      await tx.passwordHistory.create({
        data: { teamMemberId: member.id, passwordHash },
      });

      return { restaurant, member, device };
    });

    await auditLog('signup_with_restaurant', {
      userId: result.member.id,
      metadata: { email: verifiedEmail, restaurantId: result.restaurant.id, businessName },
    });

    // Auto-login — create session + token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const session = await prisma.userSession.create({
      data: {
        userId: result.member.id,
        token: randomBytes(32).toString('hex'),
        deviceInfo: req.headers['user-agent'] ?? undefined,
        ipAddress: req.ip ?? undefined,
        expiresAt,
      },
    });

    const token = authService.generateToken(
      {
        teamMemberId: result.member.id,
        email: verifiedEmail,
        role: 'owner',
        restaurantGroupId: result.member.restaurantGroupId ?? undefined,
        type: 'user',
      },
      session.id,
    );

    // Send signup notification emails
    sendSignupNotification(verifiedEmail, firstName, businessName).catch(err => {
      logger.error('Signup notification email failed:', { error: err });
    });

    // Initialize trial
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 30);
    await prisma.restaurant.update({
      where: { id: result.restaurant.id },
      data: {
        trialStartedAt: new Date(),
        trialEndsAt,
        hasUsedTrial: true,
      },
    });

    res.status(201).json({
      token,
      user: {
        id: result.member.id,
        email: verifiedEmail,
        firstName,
        lastName,
        role: 'owner',
        restaurantGroupId: result.member.restaurantGroupId,
        mfaEnabled: false,
      },
      restaurants: [{
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
        role: 'owner',
        onboardingComplete: false,
        subscriptionStatus: 'trialing',
        trialEndsAt: trialEndsAt.toISOString(),
      }],
      deviceId: result.device.id,
    });
  } catch (error) {
    logger.error('Signup error:', { error });
    res.status(500).json({ error: 'Signup failed' });
  }
});

// ============ Login ============

// Login with email/password
router.post('/login', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const deviceInfo = req.headers['user-agent'] || undefined;
    const ipAddress = req.ip || req.socket.remoteAddress || undefined;
    const deviceInfoHeader = req.headers['x-device-info'] as string | undefined;

    // Look up member for workFromHome check before calling loginUser
    const normalizedEmail = email.toLowerCase().trim();
    const member = await prisma.teamMember.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        workFromHome: true,
        restaurantId: true,
        restaurant: { select: { networkIp: true } },
      },
    });

    // workFromHome access control — check IP before authenticating
    if (member && !member.workFromHome && member.restaurant?.networkIp) {
      const restaurantIp = member.restaurant.networkIp;
      if (ipAddress !== restaurantIp) {
        res.status(403).json({
          error: 'Sign in is only available from your restaurant network. Contact your manager to enable remote access.',
        });
        return;
      }
    }

    const result = await authService.loginUser(email, password, deviceInfo, ipAddress, deviceInfo, deviceInfoHeader);

    if (!result.success) {
      res.status(401).json({ error: result.error, requiresPasswordChange: result.requiresPasswordChange });
      return;
    }

    // Check if MFA is required before issuing full session
    if (result.user && result.mfaRequired) {
      // Send email OTP for the login challenge
      const mfaMember = await prisma.teamMember.findUnique({
        where: { id: result.user.id },
        select: { email: true, firstName: true },
      });
      if (mfaMember?.email) {
        await mfaService.sendOtp(result.user.id, mfaMember.email, mfaMember.firstName);
      }
      res.json({
        mfaRequired: true,
        mfaToken: result.token,
        maskedEmail: mfaMember?.email ? mfaService.maskEmail(mfaMember.email) : undefined,
        user: { id: result.user.id },
      });
      return;
    }

    // workFromHome: true + unrecognized IP → email verification challenge
    if (member?.workFromHome && member.restaurant?.networkIp && ipAddress !== member.restaurant.networkIp) {
      // Check if this device+IP is already trusted
      const fingerprint = authService.computeUaFingerprint(deviceInfo, deviceInfoHeader);
      const isTrusted = fingerprint && ipAddress
        ? await authService.checkTrust(member.id, fingerprint, ipAddress)
        : false;

      if (!isTrusted) {
        // Send OTP for email verification (same flow as signup verification)
        const wfhMember = await prisma.teamMember.findUnique({
          where: { id: member.id },
          select: { email: true, firstName: true },
        });
        if (wfhMember?.email) {
          const code = String(randomBytes(3).readUIntBE(0, 3) % 1000000).padStart(6, '0');
          const otpHash = await bcrypt.hash(code, 12);
          const emailHash = createHash('sha256').update(wfhMember.email).digest('hex');

          await prisma.pendingVerification.upsert({
            where: { emailHash },
            create: { emailHash, email: wfhMember.email, otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
            update: { otpHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
          });

          await sendMfaOtpEmail(wfhMember.email, wfhMember.firstName, code);

          const [local, domain] = wfhMember.email.split('@');
          const maskedEmail = `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.at(-1)}@${domain}`;

          res.json({
            emailVerificationRequired: true,
            maskedEmail,
            // Store the login result token for after verification completes
            loginToken: result.token,
          });
          return;
        }
      }
    }

    // Resolve device ID — match by teamMemberId + userAgent (+ IP if WFH)
    let deviceId: string | null = null;
    if (result.user) {
      const deviceWhere: Record<string, unknown> = {
        teamMemberId: result.user.id,
        deviceType: 'terminal',
        status: 'active',
        hardwareInfo: { path: ['userAgent'], equals: req.headers['user-agent'] },
      };

      if (member?.workFromHome) {
        deviceWhere.hardwareInfo = {
          AND: [
            { path: ['userAgent'], equals: req.headers['user-agent'] },
            { path: ['ip'], equals: req.ip },
          ],
        };
      }

      const device = await prisma.device.findFirst({ where: deviceWhere });
      deviceId = device?.id ?? null;
    }

    res.json({
      token: result.token,
      user: result.user,
      restaurants: result.restaurants,
      deviceId,
      ...(result.mfaEnrollmentRequired ? {
        mfaEnrollmentRequired: true,
        mfaGraceDeadline: result.mfaGraceDeadline,
      } : {}),
    });
  } catch (error) {
    logger.error('Login error:', { error });
    res.status(500).json({ error: 'Login failed' });
  }
});

// ============ Password Reset ============

router.post('/forgot-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    await authService.requestPasswordReset(email);
    trackPasswordResetRequest(req.ip ?? 'unknown', email);
    res.json({ success: true, message: 'If an account exists with that email, a reset link has been sent.' });
  } catch (error) {
    logger.error('Forgot password error:', { error });
    res.status(500).json({ error: 'Failed to process request' });
  }
});

router.post('/reset-password', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      res.status(400).json({ error: 'Token and new password are required' });
      return;
    }

    const result = await authService.resetPasswordWithToken(token, newPassword);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true, message: 'Password reset successfully. Please sign in.' });
  } catch (error) {
    logger.error('Reset password error:', { error });
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ============ Logout ============

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const result = await authService.logout(payload.sessionId);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error:', { error });
    res.status(500).json({ error: 'Logout failed' });
  }
});

// ============ Current User ============

router.get('/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

    if (!token) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const payload = authService.verifyToken(token);

    if (!payload) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }

    const isValid = await authService.validateSession(payload.sessionId);
    if (!isValid) {
      res.status(401).json({ error: 'Session expired' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: payload.teamMemberId },
      include: {
        restaurantAccess: {
          include: {
            restaurant: {
              select: {
                id: true, name: true, slug: true, merchantProfile: true,
                trialEndsAt: true, trialExpiredAt: true,
                subscription: { select: { status: true } },
              },
            },
          },
        },
      },
    });

    if (!member?.isActive) {
      res.status(401).json({ error: 'User not found or disabled' });
      return;
    }

    const restaurants = await authService.buildRestaurantList(member);

    res.json({
      user: {
        id: member.id,
        email: member.email,
        firstName: member.firstName,
        lastName: member.lastName,
        role: member.role,
        restaurantGroupId: member.restaurantGroupId,
        mfaEnabled: member.mfaEnabled,
      },
      restaurants
    });
  } catch (error) {
    logger.error('Get current user error:', { error });
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

// ============ Re-auth & Sessions ============

router.post('/verify-password', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: req.user!.teamMemberId },
      select: { passwordHash: true },
    });

    if (!member?.passwordHash) {
      res.json({ verified: false });
      return;
    }

    const verified = await authService.verifyPassword(password, member.passwordHash);
    await auditLog(verified ? 'reauth_success' : 'reauth_failed', {
      userId: req.user!.teamMemberId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({ verified });
  } catch (error) {
    logger.error('Verify password error:', { error });
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

router.get('/sessions', requireAuth, async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user!.teamMemberId, isActive: true },
      select: { id: true, deviceInfo: true, ipAddress: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
    await auditLog('sessions_viewed', { userId: req.user!.teamMemberId, ip: req.ip });
    res.json(sessions);
  } catch (error) {
    logger.error('List sessions error:', { error });
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

router.delete('/sessions/:sessionId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = await prisma.userSession.findFirst({
      where: { id: sessionId, userId: req.user!.teamMemberId },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    await prisma.userSession.update({ where: { id: sessionId }, data: { isActive: false } });
    await auditLog('session_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { sessionId } });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke session error:', { error });
    res.status(500).json({ error: 'Failed to revoke session' });
  }
});

// ============ Staff PIN Authentication ============

router.post('/:merchantId/pin/verify', pinRateLimiter, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { pin } = req.body;

    if (!pin) {
      res.status(400).json({ error: 'PIN is required' });
      return;
    }

    const result = await authService.verifyStaffPin(restaurantId, pin);

    if (!result.success || !result.staffPin) {
      res.status(401).json({ error: result.error });
      return;
    }

    let permissions: Record<string, boolean> = {};
    const staffPin = await prisma.staffPin.findUnique({
      where: { id: result.staffPin.id },
      include: {
        teamMember: {
          include: { permissionSet: true },
        },
      },
    });
    if (staffPin?.teamMember?.permissionSet) {
      permissions = staffPin.teamMember.permissionSet.permissions as Record<string, boolean>;
    }

    res.json({
      success: true,
      staff: {
        ...result.staffPin,
        permissions,
      },
    });
  } catch (error) {
    logger.error('PIN verification error:', { error });
    res.status(500).json({ error: 'PIN verification failed' });
  }
});

// ============ Staff PIN Management (admin only) ============

router.get('/:merchantId/pins', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;

    const pins = await prisma.staffPin.findMany({
      where: { restaurantId, isActive: true },
      select: { id: true, name: true, role: true, createdAt: true },
      orderBy: { name: 'asc' }
    });

    res.json(pins);
  } catch (error) {
    logger.error('List staff PINs error:', { error });
    res.status(500).json({ error: 'Failed to list staff PINs' });
  }
});

router.post('/:merchantId/pins', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const restaurantId = req.params.merchantId;
    const { name, pin, role = 'staff' } = req.body;

    if (!name || !pin) {
      res.status(400).json({ error: 'Name and PIN are required' });
      return;
    }

    const result = await authService.createStaffPin(restaurantId, name, pin, role);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.staffPin);
  } catch (error) {
    logger.error('Create staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to create staff PIN' });
  }
});

router.patch('/:merchantId/pins/:pinId', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const { restaurantId, pinId } = req.params;
    const { name, role, isActive, newPin } = req.body;

    const result = await authService.updateStaffPin(pinId, restaurantId, {
      ...(name !== undefined && { name }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive }),
      ...(newPin !== undefined && { newPin })
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    const updated = await prisma.staffPin.findUnique({
      where: { id: pinId },
      select: { id: true, name: true, role: true, isActive: true }
    });

    res.json(updated);
  } catch (error) {
    logger.error('Update staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to update staff PIN' });
  }
});

router.delete('/:merchantId/pins/:pinId', requireAuth, requireMerchantManager, async (req: Request, res: Response) => {
  try {
    const { pinId } = req.params;

    const result = await authService.deleteStaffPin(pinId);
    if (!result.success) {
      res.status(500).json({ error: result.error });
      return;
    }
    res.status(204).send();
  } catch (error) {
    logger.error('Delete staff PIN error:', { error });
    res.status(500).json({ error: 'Failed to delete staff PIN' });
  }
});

// ============ User Management ============

router.get('/users', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const restaurantGroupId = req.query.restaurantGroupId as string | undefined;
    const users = await authService.listUsers(restaurantGroupId);
    res.json(users);
  } catch (error) {
    logger.error('List users error:', { error });
    res.status(500).json({ error: 'Failed to list users' });
  }
});

router.get('/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const member = await prisma.teamMember.findUnique({
      where: { id: userId },
      include: {
        restaurantAccess: {
          include: {
            restaurant: { select: { id: true, name: true, slug: true } }
          }
        }
      }
    });

    if (!member) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: member.id,
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      role: member.role,
      isActive: member.isActive,
      lastLoginAt: member.lastLoginAt,
      createdAt: member.createdAt,
      restaurants: member.restaurantAccess.map(a => ({
        id: a.restaurant.id,
        name: a.restaurant.name,
        slug: a.restaurant.slug,
        role: a.role
      }))
    });
  } catch (error) {
    logger.error('Get user error:', { error });
    res.status(500).json({ error: 'Failed to get user' });
  }
});

router.patch('/users/:userId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, role, isActive } = req.body;

    if (role && ['super_admin', 'owner'].includes(role) && req.user?.role !== 'super_admin') {
      res.status(403).json({ error: 'Only super_admin can assign owner or super_admin roles' });
      return;
    }

    const result = await authService.updateUser(userId, {
      ...(firstName !== undefined && { firstName }),
      ...(lastName !== undefined && { lastName }),
      ...(role !== undefined && { role }),
      ...(isActive !== undefined && { isActive })
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.json({ success: true });
  } catch (error) {
    logger.error('Update user error:', { error });
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Old password and new password are required' });
      return;
    }

    const result = await authService.changePassword(req.user!.teamMemberId, oldPassword, newPassword);

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    await auditLog('password_change', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { method: 'change_password' } });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    logger.error('Change password error:', { error });
    res.status(500).json({ error: 'Failed to change password' });
  }
});

router.post('/users', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { email, password, firstName, lastName, role, restaurantGroupId, restaurantId } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const result = await authService.createUser({
      email,
      password,
      firstName,
      lastName,
      role: role || 'staff',
      restaurantGroupId,
      restaurantId: restaurantId ?? undefined,
    });

    if (!result.success) {
      res.status(400).json({ error: result.error });
      return;
    }

    res.status(201).json(result.user);
  } catch (error) {
    logger.error('Create user error:', { error });
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.post('/users/:userId/restaurants/:merchantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;
    const { role = 'staff' } = req.body;

    const access = await prisma.userRestaurantAccess.upsert({
      where: {
        teamMemberId_restaurantId: { teamMemberId: userId, restaurantId }
      },
      create: { teamMemberId: userId, restaurantId, role },
      update: { role }
    });
    await auditLog('restaurant_access_granted', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { targetUserId: userId, restaurantId, role } });
    res.json(access);
  } catch (error) {
    logger.error('Grant restaurant access error:', { error });
    res.status(500).json({ error: 'Failed to grant restaurant access' });
  }
});

router.delete('/users/:userId/restaurants/:merchantId', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { userId, restaurantId } = req.params;

    await prisma.userRestaurantAccess.delete({
      where: {
        teamMemberId_restaurantId: { teamMemberId: userId, restaurantId }
      }
    });
    await auditLog('restaurant_access_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { targetUserId: userId, restaurantId } });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke restaurant access error:', { error });
    res.status(500).json({ error: 'Failed to revoke restaurant access' });
  }
});

// ============ Restaurant Group Management ============

router.post('/groups', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, slug, description, logo } = req.body;

    if (!name || !slug) {
      res.status(400).json({ error: 'Name and slug are required' });
      return;
    }

    const group = await prisma.restaurantGroup.create({
      data: { name, slug, description, logo }
    });

    res.status(201).json(group);
  } catch (error) {
    logger.error('Create restaurant group error:', { error });
    res.status(500).json({ error: 'Failed to create restaurant group' });
  }
});

router.get('/groups', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const groups = await prisma.restaurantGroup.findMany({
      where: { active: true },
      include: {
        _count: { select: { restaurants: true, teamMembers: true } }
      },
      orderBy: { name: 'asc' }
    });

    res.json(groups);
  } catch (error) {
    logger.error('List restaurant groups error:', { error });
    res.status(500).json({ error: 'Failed to list restaurant groups' });
  }
});

// ============ MFA (PCI DSS 8.4.2) ============

router.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  try {
    const member = await prisma.teamMember.findUnique({
      where: { id: req.user!.teamMemberId },
      select: { email: true, firstName: true, mfaEnabled: true },
    });

    if (!member?.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (member.mfaEnabled) {
      res.status(400).json({ error: 'MFA is already enabled. Disable it first to reconfigure.' });
      return;
    }

    await mfaService.sendOtp(req.user!.teamMemberId, member.email, member.firstName);
    res.json({ sent: true, maskedEmail: mfaService.maskEmail(member.email) });
  } catch (error) {
    logger.error('MFA setup error:', { error });
    res.status(500).json({ error: 'Failed to set up MFA' });
  }
});

router.post('/mfa/challenge/resend', authRateLimiter, async (req: Request, res: Response) => {
  try {
    const { mfaToken } = req.body;

    if (!mfaToken) {
      res.status(400).json({ error: 'MFA token is required' });
      return;
    }

    const payload = authService.verifyToken(mfaToken);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired MFA session' });
      return;
    }

    const member = await prisma.teamMember.findUnique({
      where: { id: payload.teamMemberId },
      select: { email: true, firstName: true },
    });

    if (!member?.email) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    await mfaService.sendOtp(payload.teamMemberId, member.email, member.firstName);
    res.json({ sent: true, maskedEmail: mfaService.maskEmail(member.email) });
  } catch (error) {
    logger.error('MFA challenge resend error:', { error });
    res.status(500).json({ error: 'Failed to resend code' });
  }
});

router.post('/mfa/verify', async (req: Request, res: Response) => {
  try {
    const { code, mfaToken } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    if (mfaToken) {
      // ---- Login challenge flow ----
      const payload = authService.verifyToken(mfaToken);
      if (!payload) {
        res.status(401).json({ error: 'Invalid or expired MFA session' });
        return;
      }

      const sessionValid = await authService.validateSession(payload.sessionId);
      if (!sessionValid) {
        res.status(401).json({ error: 'MFA session expired. Please log in again.' });
        return;
      }

      const result = await mfaService.verifyOtp(payload.teamMemberId, code);
      if (!result.success) {
        await auditLog('mfa_challenge_failed', { userId: payload.teamMemberId, ip: req.ip });
        trackMfaFailed(payload.teamMemberId, req.ip ?? undefined);
        res.status(401).json({ error: result.error });
        return;
      }

      await prisma.userSession.update({
        where: { id: payload.sessionId },
        data: { isActive: false },
      });

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const session = await prisma.userSession.create({
        data: {
          userId: payload.teamMemberId,
          token: randomBytes(32).toString('hex'),
          deviceInfo: req.headers['user-agent'] ?? undefined,
          ipAddress: req.ip ?? undefined,
          expiresAt,
        },
      });

      const fullToken = authService.generateToken(
        { teamMemberId: payload.teamMemberId, email: payload.email, role: payload.role, type: 'user' },
        session.id,
      );

      const member = await prisma.teamMember.findUnique({
        where: { id: payload.teamMemberId },
        include: {
          restaurantAccess: {
            include: {
              restaurant: { select: RESTAURANT_SELECT },
            },
          },
        },
      });

      const restaurants = await authService.buildRestaurantList(member!);

      await auditLog('mfa_challenge_success', { userId: payload.teamMemberId, ip: req.ip });

      const challengeDeviceInfoHeader = req.headers['x-device-info'] as string | undefined;
      await authService.createTrust(
        payload.teamMemberId,
        req.headers['user-agent'] as string | undefined,
        challengeDeviceInfoHeader,
        req.ip ?? undefined,
      );

      res.json({
        token: fullToken,
        user: {
          id: member!.id,
          email: member!.email,
          firstName: member!.firstName,
          lastName: member!.lastName,
          role: member!.role,
          restaurantGroupId: member!.restaurantGroupId,
          mfaEnabled: member!.mfaEnabled,
        },
        restaurants,
      });
    } else {
      // ---- Setup flow (Bearer token required) ----
      const authHeader = req.headers.authorization;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : undefined;

      if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const payload = authService.verifyToken(token);
      if (!payload) {
        res.status(401).json({ error: 'Invalid token' });
        return;
      }

      const result = await mfaService.verifyOtp(payload.teamMemberId, code, { enableOnSuccess: true });
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      const setupDeviceInfoHeader = req.headers['x-device-info'] as string | undefined;
      await authService.createTrust(
        payload.teamMemberId,
        req.headers['user-agent'] as string | undefined,
        setupDeviceInfoHeader,
        req.ip ?? undefined,
      );

      res.json({ success: true, message: 'MFA is now enabled.' });
    }
  } catch (error) {
    logger.error('MFA verify error:', { error });
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

router.post('/mfa/disable', requireAuth, authRateLimiter, async (req: Request, res: Response) => {
  try {
    if (MFA_REQUIRED_ROLES.includes(req.user!.role)) {
      res.status(403).json({ error: 'MFA is required for your role and cannot be disabled.' });
      return;
    }

    await mfaService.disableMfa(req.user!.teamMemberId);
    res.json({ success: true, message: 'MFA has been disabled.' });
  } catch (error) {
    logger.error('MFA disable error:', { error });
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

router.get('/mfa/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const status = await mfaService.getStatus(req.user!.teamMemberId);
    res.json(status);
  } catch (error) {
    logger.error('MFA status error:', { error });
    res.status(500).json({ error: 'Failed to get MFA status' });
  }
});

// ============ MFA Trusted Devices ============

router.get('/mfa/trusted-devices', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.teamMemberId;
    const role = req.user!.role;
    const teamMemberFilter = req.query.teamMemberId as string | undefined;

    if (['owner', 'super_admin'].includes(role)) {
      const restaurantId = req.query.restaurantId as string | undefined;
      const where: Record<string, unknown> = {};

      if (teamMemberFilter) {
        where['teamMemberId'] = teamMemberFilter;
      } else if (restaurantId) {
        const access = await prisma.userRestaurantAccess.findMany({
          where: { restaurantId },
          select: { teamMemberId: true },
        });
        where['teamMemberId'] = { in: access.map(a => a.teamMemberId) };
      } else {
        where['teamMemberId'] = userId;
      }

      const devices = await prisma.mfaTrustedDevice.findMany({
        where,
        include: { teamMember: { select: { email: true, firstName: true, lastName: true } } },
        orderBy: { trustedAt: 'desc' },
      });

      res.json(devices);
    } else {
      const devices = await prisma.mfaTrustedDevice.findMany({
        where: { teamMemberId: userId },
        orderBy: { trustedAt: 'desc' },
      });
      res.json(devices);
    }
  } catch (error) {
    logger.error('List trusted devices error:', { error });
    res.status(500).json({ error: 'Failed to list trusted devices' });
  }
});

router.post('/mfa/revoke-trust', requireAuth, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (!['owner', 'super_admin'].includes(role)) {
      res.status(403).json({ error: 'Only owners and super admins can revoke trust' });
      return;
    }

    const { teamMemberId } = req.body;
    if (!teamMemberId) {
      res.status(400).json({ error: 'teamMemberId is required' });
      return;
    }

    await authService.revokeAllTrust(teamMemberId);
    await auditLog('mfa_trust_all_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { targetUserId: teamMemberId } });
    res.json({ success: true });
  } catch (error) {
    logger.error('Revoke all trust error:', { error });
    res.status(500).json({ error: 'Failed to revoke trust' });
  }
});

router.delete('/mfa/trusted-devices/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const role = req.user!.role;
    if (!['owner', 'super_admin'].includes(role)) {
      res.status(403).json({ error: 'Only owners and super admins can revoke trust' });
      return;
    }

    const { id } = req.params;
    const device = await prisma.mfaTrustedDevice.findUnique({ where: { id } });
    if (!device) {
      res.status(404).json({ error: 'Trusted device not found' });
      return;
    }

    await prisma.mfaTrustedDevice.delete({ where: { id } });
    await auditLog('mfa_trust_revoked', { userId: req.user!.teamMemberId, ip: req.ip, metadata: { trustedDeviceId: id, targetUserId: device.teamMemberId } });
    res.status(204).send();
  } catch (error) {
    logger.error('Revoke trusted device error:', { error });
    res.status(500).json({ error: 'Failed to revoke trusted device' });
  }
});

// ============ Account Maintenance (super_admin only) ============

router.post('/maintenance/disable-inactive', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const count = await disableInactiveAccounts();
    res.json({ success: true, disabledCount: count });
  } catch (error) {
    logger.error('Disable inactive accounts error:', { error });
    res.status(500).json({ error: 'Failed to disable inactive accounts' });
  }
});

export default router;
