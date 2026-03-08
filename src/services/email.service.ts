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

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_BRAND_COLOR = '#2563eb';
const FROM_ADDRESS = 'noreply@getorderstack.com';

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[Email] RESEND_API_KEY not set — skipping email send');
    return;
  }

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`[Email] Resend API error: ${response.status} ${body}`);
  }
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
