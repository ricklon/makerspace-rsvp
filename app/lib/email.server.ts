/**
 * Email service using SendGrid API
 * Uses fetch directly for Cloudflare Workers/Pages compatibility
 */

const SENDGRID_API_URL = "https://api.sendgrid.com/v3/mail/send";

type EmailAddress = {
  email: string;
  name?: string;
};

type SendEmailOptions = {
  to: EmailAddress | EmailAddress[];
  from: EmailAddress;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: EmailAddress;
};

type SendGridPayload = {
  personalizations: { to: EmailAddress[] }[];
  from: EmailAddress;
  reply_to?: EmailAddress;
  subject: string;
  content: { type: string; value: string }[];
};

export async function sendEmail(
  options: SendEmailOptions,
  apiKey: string
): Promise<{ success: boolean; error?: string }> {
  if (!apiKey) {
    console.warn("[email] SendGrid API key not configured, skipping email");
    return { success: false, error: "SendGrid API key not configured" };
  }

  const toAddresses = Array.isArray(options.to) ? options.to : [options.to];

  const payload: SendGridPayload = {
    personalizations: [{ to: toAddresses }],
    from: options.from,
    subject: options.subject,
    content: [],
  };

  if (options.replyTo) {
    payload.reply_to = options.replyTo;
  }

  if (options.text) {
    payload.content.push({ type: "text/plain", value: options.text });
  }

  if (options.html) {
    payload.content.push({ type: "text/html", value: options.html });
  }

  try {
    const response = await fetch(SENDGRID_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      return { success: true };
    }

    const errorText = await response.text();
    console.error("[email] SendGrid error:", response.status, errorText);
    return { success: false, error: `SendGrid error: ${response.status}` };
  } catch (error) {
    console.error("[email] Failed to send email:", error);
    return { success: false, error: "Failed to send email" };
  }
}

// Email templates

export function buildRsvpConfirmationEmail(options: {
  attendeeName: string;
  eventName: string;
  eventDate: string;
  eventTime: string;
  eventLocation: string;
  confirmationUrl: string;
  isWaitlist: boolean;
  requiresWaiver: boolean;
  makerspaceName: string;
}): { subject: string; text: string; html: string } {
  const {
    attendeeName,
    eventName,
    eventDate,
    eventTime,
    eventLocation,
    confirmationUrl,
    isWaitlist,
    requiresWaiver,
    makerspaceName,
  } = options;

  const subject = isWaitlist
    ? `You're on the waitlist for ${eventName}`
    : `You're registered for ${eventName}!`;

  const statusMessage = isWaitlist
    ? "You've been added to the waitlist. We'll notify you if a spot opens up."
    : "You're confirmed for this event!";

  const waiverNote = requiresWaiver && !isWaitlist
    ? "\n\nIMPORTANT: This event requires a waiver. Please sign it before the event by visiting your confirmation page."
    : "";

  const text = `
Hi ${attendeeName},

${statusMessage}

Event: ${eventName}
Date: ${eventDate}
Time: ${eventTime}
Location: ${eventLocation}
${waiverNote}

View your confirmation and check-in QR code:
${confirmationUrl}

See you there!
${makerspaceName}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 24px;">
      ${isWaitlist ? "You're on the Waitlist!" : "You're Registered!"}
    </h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
    <p>Hi ${attendeeName},</p>

    <p>${statusMessage}</p>

    <div style="background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border: 1px solid #e5e7eb;">
      <h2 style="margin: 0 0 15px 0; font-size: 18px; color: #111;">${eventName}</h2>
      <p style="margin: 5px 0; color: #666;">📅 ${eventDate}</p>
      <p style="margin: 5px 0; color: #666;">🕐 ${eventTime}</p>
      <p style="margin: 5px 0; color: #666;">📍 ${eventLocation}</p>
    </div>

    ${requiresWaiver && !isWaitlist ? `
    <div style="background: #fef3c7; border-radius: 8px; padding: 15px; margin: 20px 0; border: 1px solid #f59e0b;">
      <p style="margin: 0; color: #92400e; font-size: 14px;">
        <strong>Important:</strong> This event requires a waiver. Please sign it before the event.
      </p>
    </div>
    ` : ""}

    <div style="text-align: center; margin: 30px 0;">
      <a href="${confirmationUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600;">
        ${isWaitlist ? "View Waitlist Status" : "View Confirmation & QR Code"}
      </a>
    </div>

    <p style="color: #666; font-size: 14px;">
      ${isWaitlist
        ? "We'll email you if a spot opens up."
        : "Save your confirmation page - you'll need the QR code to check in at the event."}
    </p>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p>${makerspaceName}</p>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}

export function buildCheckinConfirmationEmail(options: {
  attendeeName: string;
  eventName: string;
  makerspaceName: string;
}): { subject: string; text: string; html: string } {
  const { attendeeName, eventName, makerspaceName } = options;

  const subject = `You're checked in for ${eventName}!`;

  const text = `
Hi ${attendeeName},

You've successfully checked in for ${eventName}.

Enjoy the event!

${makerspaceName}
`.trim();

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #10b981; padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0;">✓ Checked In!</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
    <p>Hi ${attendeeName},</p>
    <p>You've successfully checked in for <strong>${eventName}</strong>.</p>
    <p style="font-size: 24px; margin: 20px 0;">Enjoy the event!</p>
  </div>

  <div style="padding: 20px; text-align: center; color: #9ca3af; font-size: 12px;">
    <p>${makerspaceName}</p>
  </div>
</body>
</html>
`.trim();

  return { subject, text, html };
}
