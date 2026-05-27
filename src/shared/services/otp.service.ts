/**
 * OTP Service — Email-only implementation
 *
 * SMS/Twilio is intentionally disabled. Phone field is kept in the vendor
 * schema for future use. To re-enable SMS:
 *   TODO: uncomment the Twilio block in sendOtp() and verifyOtp()
 *   TODO: restore 'phone' channel in OtpChannel type
 *   TODO: add TWILIO_* vars back to REQUIRED_VARS in config/index.ts
 */

import { randomInt } from 'crypto';

import { AppError }      from '../utils/AppError';
import { getRedis }      from '../database/redis';
import { EmailService }  from './email.service';
import { logger }        from '../../logger/index';
import { config }        from '../../config/index';

// ── Channel type ───────────────────────────────────────────
// 'phone' is reserved for future SMS re-integration
// TODO: add 'phone' back when SMS is re-enabled
export type OtpChannel = 'email';

// ── Redis key helpers ──────────────────────────────────────
const otpKey       = (email: string) => `otp:email:${email}`;
const attemptsKey  = (email: string) => `otp:attempts:${email}`;
const cooldownKey  = (email: string) => `otp:cooldown:${email}`;

// ── Constants (driven by config so they're tunable per env) ─
const OTP_TTL_SECONDS      = config.otp.expirySeconds;        // default 600s (10 min)
const RESEND_COOLDOWN_SEC  = config.otp.resendWindowSeconds;  // default 60s between resends
const MAX_VERIFY_ATTEMPTS  = 5;                               // lock after 5 wrong guesses
const ATTEMPTS_TTL_SECONDS = OTP_TTL_SECONDS;                 // attempt counter lives as long as OTP

export class OtpService {

  // ── Send OTP ─────────────────────────────────────────────
  /**
   * Generates a cryptographically secure 6-digit OTP, stores it in Redis,
   * and delivers it via email.
   *
   * Resend cooldown: rejects if called again within RESEND_COOLDOWN_SEC.
   * This prevents OTP flooding without exposing whether an account exists.
   */
  public static async sendOtp(email: string, _channel: OtpChannel , type: 'registration' | 'password-reset' | 'resend'): Promise<void> {
    // _channel param kept for API compatibility — only email is active
    // TODO: when SMS is re-enabled, branch on _channel here

    logger.debug('OtpService.sendOtp called', { channel: 'email' });

    const redis = getRedis();

    // ── Resend cooldown check ──────────────────────────────
    const onCooldown = await redis.get(cooldownKey(email));
    if (onCooldown) {
      throw AppError.tooManyRequests(
        `Please wait before requesting another OTP`,
      );
    }

    // ── Generate & store OTP ───────────────────────────────
    const otp = randomInt(100000, 999999).toString();

    await redis.setEx(otpKey(email), OTP_TTL_SECONDS, otp);

    // Reset attempt counter on fresh OTP
    await redis.del(attemptsKey(email));

    // Set resend cooldown
    await redis.setEx(cooldownKey(email), RESEND_COOLDOWN_SEC, '1');

    // ── Deliver via email ──────────────────────────────────
    if (type === 'password-reset') {
      await EmailService.sendOtpForgotPasswordEmail(email, otp);
    } else if (type === 'resend') {
      await EmailService.sendOtpResendEmail(email, otp);
    } else {
      await EmailService.sendOtpEmail(email, otp);
    }

    logger.info('OTP sent via email');
  }

  // ── Verify OTP ───────────────────────────────────────────
  /**
   * Verifies the OTP for the given email.
   * Tracks failed attempts and locks after MAX_VERIFY_ATTEMPTS.
   * Consumes the OTP on success (one-time use).
   *
   * TODO: when SMS is re-enabled, add phone channel branch here
   */
  public static async verifyOtp(
    email:    string,
    code:     string,
    _channel: OtpChannel,
  ): Promise<void> {
    const redis = getRedis();

    // ── Attempt limit check ────────────────────────────────
    const rawAttempts = await redis.get(attemptsKey(email));
    const attempts    = parseInt(rawAttempts ?? '0', 10);

    if (attempts >= MAX_VERIFY_ATTEMPTS) {
      throw AppError.tooManyRequests(
        'Too many incorrect attempts. Please request a new OTP.',
      );
    }

    // ── Fetch stored OTP ───────────────────────────────────
    const stored = await redis.get(otpKey(email));

    if (!stored) {
      throw AppError.badRequest('OTP expired or not found. Please request a new one.', 'OTP_EXPIRED');
    }

    // ── Compare ────────────────────────────────────────────
    if (stored !== code) {
      // Increment attempt counter
      await redis.setEx(
        attemptsKey(email),
        ATTEMPTS_TTL_SECONDS,
        String(attempts + 1),
      );
      throw AppError.badRequest('Invalid OTP', 'INVALID_OTP');
    }

    // ── Success — consume OTP and clear counters ───────────
    await redis.del(otpKey(email));
    await redis.del(attemptsKey(email));
    // Leave cooldown key intact — prevents immediate re-request after verify

    logger.info('OTP verified via email');
  }

  // ── Helpers ───────────────────────────────────────────────

  /**
   * Returns remaining TTL (seconds) for the current OTP, or 0 if none exists.
   * Useful for the client to show a countdown timer.
   */
  public static async getOtpTtl(email: string): Promise<number> {
    const redis = getRedis();
    const ttl   = await redis.ttl(otpKey(email));
    return ttl > 0 ? ttl : 0;
  }

  /**
   * Returns remaining cooldown seconds before a new OTP can be requested.
   * Returns 0 if no cooldown is active.
   */
  public static async getResendCooldown(email: string): Promise<number> {
    const redis = getRedis();
    const ttl   = await redis.ttl(cooldownKey(email));
    return ttl > 0 ? ttl : 0;
  }
}

/*
 * ── TODO: SMS Re-integration Guide ────────────────────────────────────────────
 *
 * When you're ready to add SMS back:
 *
 * 1. Restore OtpChannel:
 *      export type OtpChannel = 'email' | 'phone';
 *
 * 2. Add Twilio client:
 *      import twilio from 'twilio';
 *      const twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
 *
 * 3. In sendOtp(), add phone branch:
 *      if (_channel === 'phone') {
 *        await twilioClient.verify.v2
 *          .services(config.twilio.verifyServiceSid)
 *          .verifications.create({ to: target, channel: 'sms' });
 *        return;
 *      }
 *
 * 4. In verifyOtp(), add phone branch:
 *      if (_channel === 'phone') {
 *        const result = await twilioClient.verify.v2
 *          .services(config.twilio.verifyServiceSid)
 *          .verificationChecks.create({ to: target, code });
 *        if (!result.valid) throw AppError.badRequest('Invalid or expired OTP', 'INVALID_OTP');
 *        return;
 *      }
 *
 * 5. Restore TWILIO_* vars in config/index.ts REQUIRED_VARS.
 *
 * 6. Update auth.service.ts to pass 'phone' channel where appropriate.
 * ──────────────────────────────────────────────────────────────────────────────
 */
