import { PrismaClient } from '@prisma/client';
import { sendMilestoneReminder } from '../services/email.service';

const prisma = new PrismaClient();
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

interface MilestoneEntry {
  id: string;
  label: string;
  amountCents: number;
  dueDate: string;
  paidAt: string | null;
  reminderSentAt: string | null;
}

export function startMilestoneReminderCron(): void {
  console.log('[MilestoneReminders] Starting milestone reminder job (hourly check, sends at 9am)');

  setInterval(() => {
    const hour = new Date().getHours();
    if (hour !== 9) return;

    processReminders().catch((error: unknown) => {
      console.error('[MilestoneReminders] Processing failed:', error);
    });
  }, CHECK_INTERVAL_MS);
}

function isMilestoneEligible(milestone: MilestoneEntry, cutoffDate: Date): boolean {
  if (milestone.paidAt !== null) return false;
  if (milestone.reminderSentAt !== null) return false;
  return new Date(milestone.dueDate) <= cutoffDate;
}

async function sendAndMarkMilestone(
  job: { id: string; title: string; clientEmail: string; fulfillmentDate: Date; totalCents: number; restaurant: { name: string } },
  milestone: MilestoneEntry,
  now: Date,
): Promise<boolean> {
  try {
    await sendMilestoneReminder(
      {
        title: job.title,
        clientEmail: job.clientEmail,
        fulfillmentDate: job.fulfillmentDate.toISOString(),
        totalCents: job.totalCents,
      },
      {
        id: milestone.id,
        label: milestone.label,
        amountCents: milestone.amountCents,
        dueDate: milestone.dueDate,
      },
      job.restaurant.name,
    );
    milestone.reminderSentAt = now.toISOString();
    return true;
  } catch (error: unknown) {
    console.error(`[MilestoneReminders] Failed to send reminder for job ${job.id}, milestone ${milestone.id}:`, error);
    return false;
  }
}

async function processReminders(): Promise<void> {
  const now = new Date();
  const threeDaysFromNow = new Date(now);
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const jobs = await prisma.cateringEvent.findMany({
    where: {
      status: { notIn: ['cancelled', 'completed'] },
      clientEmail: { not: null },
    },
    include: {
      restaurant: { select: { name: true } },
    },
  });

  let sentCount = 0;

  for (const job of jobs) {
    const milestones: MilestoneEntry[] = Array.isArray(job.milestones) ? (job.milestones as unknown as MilestoneEntry[]) : [];
    let updated = false;

    for (const milestone of milestones) {
      if (!isMilestoneEligible(milestone, threeDaysFromNow)) continue;

      const sent = await sendAndMarkMilestone(
        job as typeof job & { clientEmail: string },
        milestone,
        now,
      );
      if (sent) {
        updated = true;
        sentCount++;
      }
    }

    if (updated) {
      await prisma.cateringEvent.update({
        where: { id: job.id },
        data: { milestones: milestones as any },
      });
    }
  }

  if (sentCount > 0) {
    console.log(`[MilestoneReminders] Sent ${sentCount} reminder(s)`);
  }
}
