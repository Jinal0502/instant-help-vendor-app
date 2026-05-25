import { config } from '../../config/index';
import { logger } from '../../logger/index';

// v5 uses plain fetch — no class instantiation needed
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export class EmailService {

  public static async sendMail(
    to:      string,
    subject: string,
    html:    string,
  ): Promise<void> {

    if (config.isDev) {
      logger.debug(`[DEV] Email to ${to} | Subject: ${subject}`);
      // remove this return when you want real emails in dev
    //   return;
    }

    const payload = {
      sender: {
        email: config.email.mailFrom,
        name:  config.email.mailFromName,
      },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    };

    const response = await fetch(BREVO_API_URL, {
      method:  'POST',
      headers: {
        'accept':       'application/json',
        'content-type': 'application/json',
        'api-key':      config.email.apiKey,   // ← v5 uses 'api-key' header
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error('Brevo email failed', {
        to,
        status:  response.status,
        message: (error as any)?.message,
        code:    (error as any)?.code,
      });
      throw new Error(`Brevo API error ${response.status}: ${(error as any)?.message}`);
    }

    logger.info('Email sent via Brevo', { to, subject });
  }

  public static async sendOtpEmail(email: string, otp: string): Promise<void> {
    await this.sendMail(
      email,
      'Your Instant Help verification code',
      `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#1A56DB;">Instant Help</h2>
        <p>Your verification code is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:10px;
                    color:#1E293B;margin:24px 0;padding:16px;
                    background:#F8FAFC;border-radius:8px;text-align:center;">
          ${otp}
        </div>
        <p style="color:#64748B;font-size:14px;">
          This code expires in 10 minutes. Do not share it with anyone.
        </p>
      </div>
      `,
    );
  }

  public static async sendWelcomeEmail(email: string, name: string): Promise<void> {
    await this.sendMail(
      email,
      'Welcome to Instant Help',
      `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;">
        <h2 style="color:#1A56DB;">Welcome to Instant Help</h2>
        <p>Hello ${name},</p>
        <p>Your vendor account has been created. Complete your profile and KYC to start receiving jobs.</p>
      </div>
      `,
    );
  }
}