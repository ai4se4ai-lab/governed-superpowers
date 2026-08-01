import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * SMTP is configured entirely by env - point it at any real provider, in
 * development or production alike. There is no bundled dev mail sink.
 */
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const MAIL_FROM = process.env.MAIL_FROM ?? "Governed-Superpowers <no-reply@localhost>";

export const APP_URL = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASSWORD } : undefined,
    });
  }
  return transporter;
}

function layout(heading: string, body: string, cta: { href: string; label: string }): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:32px">
        <tr><td>
          <p style="margin:0 0 6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#71717a">Governed-Superpowers</p>
          <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${heading}</h1>
          <div style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${body}</div>
          <a href="${cta.href}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9px;font-size:15px;font-weight:600">${cta.label}</a>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#71717a">
            If the button doesn't work, paste this into your browser:<br>
            <span style="word-break:break-all;color:#3f3f46">${cta.href}</span>
          </p>
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">You received this because someone used this address on a Governed-Superpowers portal. If that wasn't you, ignore it.</p>
    </td></tr>
  </table>
</body></html>`;
}

async function send(to: string, subject: string, html: string, text: string): Promise<void> {
  await getTransporter().sendMail({ from: MAIL_FROM, to, subject, html, text });
}

export async function sendConfirmationEmail(to: string, username: string, token: string): Promise<void> {
  const href = `${APP_URL}/confirm/${token}`;
  await send(
    to,
    "Confirm your Governed-Superpowers account",
    layout(
      `Welcome, ${username}`,
      "<p style='margin:0'>Confirm this address to activate your account. You'll be able to sign in and issue MCP tokens straight away. This link expires in 24 hours.</p>",
      { href, label: "Confirm my account" },
    ),
    `Welcome, ${username}. Confirm your account: ${href} (expires in 24 hours)`,
  );
}

export async function sendEmailChangeEmail(to: string, username: string, token: string): Promise<void> {
  const href = `${APP_URL}/confirm/${token}`;
  await send(
    to,
    "Confirm your new email address",
    layout(
      "Confirm your new address",
      `<p style='margin:0'>${username}, confirm this address to finish moving your Governed-Superpowers account to it. Your existing MCP tokens keep working. This link expires in 1 hour.</p>`,
      { href, label: "Confirm new address" },
    ),
    `Confirm your new address: ${href} (expires in 1 hour)`,
  );
}
