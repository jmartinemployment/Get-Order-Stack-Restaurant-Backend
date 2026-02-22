import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

// Uppercase alphanumeric excluding ambiguous chars (0/O, I/1/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;
const MAX_ATTEMPTS = 10;

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

export async function generateDeviceCode(prisma: PrismaClient): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();

    const existing = await prisma.device.findUnique({
      where: { deviceCode: code },
      select: { id: true, status: true },
    });

    // Code is available if no device uses it, or the existing device is not pending
    if (!existing || existing.status !== 'pending') {
      return code;
    }
  }

  throw new Error('Failed to generate unique device code after maximum attempts');
}
