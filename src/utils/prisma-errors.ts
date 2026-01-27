import { Response } from 'express';
import { Prisma } from '@prisma/client';

interface PrismaErrorMapping {
  P2002?: { status: number; message: string };
  P2003?: { status: number; message: string };
  P2025?: { status: number; message: string };
}

/**
 * Handles Prisma errors and sends appropriate HTTP responses.
 * Returns true if the error was handled, false otherwise.
 */
export function handlePrismaError(
  error: unknown,
  res: Response,
  mappings: PrismaErrorMapping,
  fallbackMessage: string
): void {
  console.error(fallbackMessage + ':', error);

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    const mapping = mappings[error.code as keyof PrismaErrorMapping];
    if (mapping) {
      res.status(mapping.status).json({ error: mapping.message });
      return;
    }
  }

  res.status(500).json({ error: fallbackMessage });
}
