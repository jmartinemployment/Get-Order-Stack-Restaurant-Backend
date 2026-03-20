import { Resend } from 'resend';
import { logger } from '../utils/logger';
import { getSecret } from '../utils/secrets';

interface EmailJob {
  title: string;
  clientEmail: string;
  clientName?: string;
  fulfillmentDate: string;
  headcount?: number;
  totalCents: number;
}

interface EmailMilestone {
  id: string;
  label: string;
  amountCents: number;
  dueDate: string;
}

const DEFAULT_BRAND_COLOR = '#2563eb';
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'OrderStack <noreply@geekatyourspot.com>';
const RESEND_API_KEY = getSecret('RESEND_API_KEY');

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!resend) {
    logger.warn('[Email] RESEND_API_KEY not set — skipping email send');
    return;
  }

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: [to],
    subject,
    html,
  });

  if (error) {
    logger.error('[Email] Resend error:', { error });
    return;
  }

  logger.info('[Email] Sent', { id: data?.id, to, subject });
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function emailWrapper(brandingColor: string | null, content: string): string {
  const color = brandingColor ?? DEFAULT_BRAND_COLOR;
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">
    <div style="background:${color};padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">OrderStack</h1>
    </div>
    <div style="padding:32px;">
      ${content}
    </div>
    <div style="padding:16px 32px;background:#f4f4f5;text-align:center;font-size:12px;color:#71717a;">
      Sent via OrderStack
    </div>
  </div>
</body>
</html>`;
}

export async function sendProposal(
  job: EmailJob,
  proposalUrl: string,
  merchantName: string,
  brandingColor: string | null,
): Promise<void> {
  const subject = `${merchantName} has sent you a proposal`;
  const content = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#18181b;">You've received a proposal</h2>
    <p style="color:#3f3f46;line-height:1.6;">
      <strong>${merchantName}</strong> has prepared a proposal for your upcoming event.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#71717a;">Event</td><td style="padding:8px 0;color:#18181b;font-weight:500;">${job.title}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Date</td><td style="padding:8px 0;color:#18181b;">${formatDate(job.fulfillmentDate)}</td></tr>
      ${job.headcount ? `<tr><td style="padding:8px 0;color:#71717a;">Headcount</td><td style="padding:8px 0;color:#18181b;">${job.headcount} guests</td></tr>` : ''}
      <tr><td style="padding:8px 0;color:#71717a;">Total</td><td style="padding:8px 0;color:#18181b;font-weight:600;">${formatCents(job.totalCents)}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${proposalUrl}" style="display:inline-block;background:${brandingColor ?? DEFAULT_BRAND_COLOR};color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;">View Proposal</a>
    </div>`;
  const html = emailWrapper(brandingColor, content);
  await sendEmail(job.clientEmail, subject, html);
}

export async function sendInvoice(
  job: EmailJob,
  invoiceUrl: string,
  merchantName: string,
  brandingColor: string | null,
  amountDueCents: number,
  dueDate: string,
): Promise<void> {
  const subject = `Invoice from ${merchantName}`;
  const content = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#18181b;">Invoice</h2>
    <p style="color:#3f3f46;line-height:1.6;">
      <strong>${merchantName}</strong> has sent you an invoice for <strong>${job.title}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#71717a;">Event</td><td style="padding:8px 0;color:#18181b;font-weight:500;">${job.title}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Amount Due</td><td style="padding:8px 0;color:#18181b;font-weight:600;">${formatCents(amountDueCents)}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Due Date</td><td style="padding:8px 0;color:#18181b;">${formatDate(dueDate)}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0;">
      <a href="${invoiceUrl}" style="display:inline-block;background:${brandingColor ?? DEFAULT_BRAND_COLOR};color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:600;">Pay Now</a>
    </div>`;
  const html = emailWrapper(brandingColor, content);
  await sendEmail(job.clientEmail, subject, html);
}

export async function sendMilestoneReminder(
  job: EmailJob,
  milestone: EmailMilestone,
  merchantName: string,
): Promise<void> {
  const subject = `Payment reminder: ${milestone.label} for ${job.title}`;
  const content = `
    <h2 style="margin:0 0 16px;font-size:18px;color:#18181b;">Payment Reminder</h2>
    <p style="color:#3f3f46;line-height:1.6;">
      This is a reminder that a payment is due for your upcoming event with <strong>${merchantName}</strong>.
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:8px 0;color:#71717a;">Event</td><td style="padding:8px 0;color:#18181b;font-weight:500;">${job.title}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Milestone</td><td style="padding:8px 0;color:#18181b;">${milestone.label}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Amount</td><td style="padding:8px 0;color:#18181b;font-weight:600;">${formatCents(milestone.amountCents)}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Due Date</td><td style="padding:8px 0;color:#18181b;">${formatDate(milestone.dueDate)}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Event Date</td><td style="padding:8px 0;color:#18181b;">${formatDate(job.fulfillmentDate)}</td></tr>
    </table>
    <p style="color:#71717a;font-size:14px;margin-top:16px;">
      Please contact ${merchantName} directly if you have questions about this payment.
    </p>`;
  const html = emailWrapper(null, content);
  await sendEmail(job.clientEmail, subject, html);
}

export async function sendPasswordResetEmail(
  toEmail: string,
  firstName: string | null,
  resetUrl: string,
): Promise<void> {
  const content = `
    <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">Reset your password</h2>
    <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hi ${firstName ?? 'there'},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      We received a request to reset your OrderStack password. Click the button below to create a new password.
    </p>
    <p style="text-align:center;margin:0 0 24px;">
      <a href="${resetUrl}"
         style="background:#006aff;color:#fff;text-decoration:none;padding:12px 28px;
                border-radius:100px;font-weight:600;font-size:15px;display:inline-block;">
        Reset Password
      </a>
    </p>
    <p style="color:#6b7280;font-size:14px;margin:0 0 8px;">
      This link expires in 1 hour. If you didn&rsquo;t request a password reset, you can safely ignore this email.
    </p>
    <p style="color:#6b7280;font-size:14px;margin:0;">
      Or copy and paste this URL: <a href="${resetUrl}" style="color:#006aff;">${resetUrl}</a>
    </p>`;
  const html = emailWrapper('#006aff', content);
  await sendEmail(toEmail, 'Reset your OrderStack password', html);
}

export async function sendMfaOtpEmail(
  toEmail: string,
  firstName: string | null,
  code: string,
): Promise<void> {
  const content = `
    <h2 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;">Your verification code</h2>
    <p style="color:#374151;font-size:15px;margin:0 0 12px;">Hi ${firstName ?? 'there'},</p>
    <p style="color:#374151;font-size:15px;margin:0 0 24px;">
      Use the code below to verify your identity. This code expires in 10 minutes.
    </p>
    <div style="text-align:center;margin:0 0 24px;">
      <div style="display:inline-block;background:#f3f4f6;border:2px solid #e5e7eb;border-radius:8px;
                  padding:16px 32px;font-size:36px;font-weight:700;letter-spacing:10px;color:#111827;
                  font-family:monospace;">
        ${code}
      </div>
    </div>
    <p style="color:#6b7280;font-size:14px;margin:0;">
      If you didn&rsquo;t request this code, you can safely ignore this email.
    </p>`;
  const html = emailWrapper('#006aff', content);
  await sendEmail(toEmail, 'Your OrderStack verification code', html);
}
