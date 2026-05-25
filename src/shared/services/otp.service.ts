import twilio from 'twilio';
import { randomInt } from 'crypto';

import { config } from '../../config/index';
import { AppError } from '../../shared/utils/AppError';
import { getRedis } from '../../shared/database/redis';
import { EmailService } from './email.service';
import { logger } from '../../logger/index';

const client = twilio(
  config.twilio.accountSid,
  config.twilio.authToken,
);

export type OtpChannel = 'phone' | 'email';

const EMAIL_OTP_TTL = 600; // seconds

export class OtpService {

  public static async sendOtp(target: string, channel: OtpChannel): Promise<void> {
    logger.debug('OtpService.sendOtp called', { channel });

    if (channel === 'phone') {
      // Twilio Verify manages OTP state for SMS
      await client.verify.v2
        .services(config.twilio.verifyServiceSid)
        .verifications.create({ to: target, channel: 'sms' });
    } else {
      // Cryptographically secure 6-digit OTP for email
      const otp   = randomInt(100000, 999999).toString();
      const redis = getRedis();
      await redis.setEx(`otp:email:${target}`, EMAIL_OTP_TTL, otp);
      await EmailService.sendOtpEmail(target, otp);
    }
  }

  /**
   * Verify an OTP for the given target and channel.
   * Channel must be passed explicitly — never inferred from the target string.
   */
  public static async verifyOtp(
    target:  string,
    code:    string,
    channel: OtpChannel,
  ): Promise<void> {
    if (channel === 'phone') {
      const result = await client.verify.v2
        .services(config.twilio.verifyServiceSid)
        .verificationChecks.create({ to: target, code });

      if (!result.valid) {
        throw AppError.badRequest('Invalid or expired OTP', 'INVALID_OTP');
      }
    } else {
      const redis  = getRedis();
      const stored = await redis.get(`otp:email:${target}`);

      if (!stored) throw AppError.badRequest('OTP expired', 'OTP_EXPIRED');
      if (stored !== code) throw AppError.badRequest('Invalid OTP', 'INVALID_OTP');

      // Consume immediately — one-time use
      await redis.del(`otp:email:${target}`);
    }
  }
}
