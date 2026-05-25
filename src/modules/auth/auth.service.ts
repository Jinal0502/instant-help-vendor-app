import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

import { VendorModel, IVendor } from '../../models/vendor.model';
import { AppError } from '../../shared/utils/AppError';
import { getRedis } from '../../shared/database/redis';
import { config } from '../../config/index';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../shared/utils/Token';
import { OtpChannel, OtpService } from '../../shared/services/otp.service';
import { GoogleService } from '../../shared/services/google.service';
import { logger } from '../../logger/index';
import { KycStatus } from '../../types/index';

import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  ResetPasswordDto,
  GoogleAuthDto,
} from './auth.validation';

// ── Types ──────────────────────────────────────────────────
interface AuthTokens {
  accessToken:  string;
  refreshToken: string;
}

/** Minimal vendor shape returned on login — never the full document */
interface LoginVendor {
  id:              string;
  name:            string;
  email:           string;
  phone:           string;
  username:        string;
  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  kycStatus:       KycStatus;
  avatar?:         string;
  authProvider:    string;
  // true when a new Google user still needs to complete their profile (e.g. add phone)
  requiresOnboarding: boolean;
}

interface AuthResult {
  vendor: LoginVendor;
  tokens: AuthTokens;
}

const MAX_REFRESH_TOKENS = 5;
const MAX_FCM_TOKENS     = 10;
const RESET_TOKEN_TTL    = 600; // seconds

// ── Auth Service ───────────────────────────────────────────
export class AuthService {

  // ── Register ─────────────────────────────────────────────
  public async register(dto: RegisterDto): Promise<{
    vendorId: string;
    phone:    string;
    email:    string;
  }> {
    let vendor: IVendor;

    const username = dto.username ?? `user_${dto.phone.replace(/\D/g, '').slice(-8)}`;

    try {
      vendor = await VendorModel.create({
        username:     username.toLowerCase(),
        name:         dto.name ?? '',
        email:        dto.email.toLowerCase(),
        phone:        dto.phone,
        password:     dto.password,
        authProvider: 'local',
      });
    } catch (err) {
      if (
        err instanceof mongoose.mongo.MongoServerError &&
        (err as mongoose.mongo.MongoServerError).code === 11000
      ) {
        const mongoErr = err as mongoose.mongo.MongoServerError;
        const field    = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'field';
        const isAutoUsername = field === 'username' && !dto.username;
        if (isAutoUsername) {
          throw AppError.conflict('Phone number already registered', 'PHONE_EXISTS');
        }
        const messages: Record<string, string> = {
          email:    'Email already registered',
          phone:    'Phone number already registered',
          username: 'Username already taken',
        };
        throw AppError.conflict(
          messages[field] ?? 'Account already exists',
          `${field.toUpperCase()}_EXISTS`,
        );
      }
      throw err;
    }

    logger.info('Vendor registered', { vendorId: vendor._id.toString() });

    const otpResults = await Promise.allSettled([
      OtpService.sendOtp(dto.phone, 'phone'),
      OtpService.sendOtp(dto.email, 'email'),
    ]);

    otpResults.forEach((result, i) => {
      if (result.status === 'rejected') {
        logger.error(`Failed to send registration OTP via ${i === 0 ? 'phone' : 'email'}`, {
          reason:   result.reason,
          vendorId: vendor._id.toString(),
        });
      }
    });

    return { vendorId: vendor._id.toString(), phone: dto.phone, email: dto.email };
  }

  // ── Login ─────────────────────────────────────────────────
  public async login(dto: LoginDto, fcmToken?: string): Promise<AuthResult> {
    const vendor = await VendorModel.findOne({ phone: dto.phone })
      .select('+password +refreshTokens +fcmTokens');

    if (!vendor) throw AppError.unauthorized('Invalid credentials');

    const isMatch = await vendor.comparePassword(dto.password);
    if (!isMatch) throw AppError.unauthorized('Invalid credentials');

    if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

    // Google-only accounts have no password — block password login
    if (vendor.authProvider === 'google') {
      throw AppError.badRequest(
        'This account uses Google Sign-In. Please log in with Google.',
        'USE_GOOGLE_LOGIN',
      );
    }

    return this.finaliseLogin(vendor, fcmToken);
  }

  // ── Google Auth ───────────────────────────────────────────
  /**
   * Handles all three Google auth cases in a single endpoint:
   *   1. Existing Google user          → login
   *   2. Existing local user (email)   → link Google account + login
   *   3. New user                      → create account + login
   *
   * Account takeover prevention:
   *   - Google email must be verified by Google
   *   - Existing local account is only linked if the email matches exactly
   *   - A different Google account cannot claim an already-linked googleId
   */
  public async googleAuth(dto: GoogleAuthDto, fcmToken?: string): Promise<AuthResult> {
    // ── 1. Verify the token with Google ───────────────────
    // DEV ONLY: pass idToken as "dev:<email>:<name>" to bypass real Google verification
    // e.g. { "idToken": "dev:test@gmail.com:Test User" }
    // This block is completely unreachable in production.
    let profile: Awaited<ReturnType<typeof GoogleService.verifyIdToken>>;
    if (config.isDev && dto.idToken.startsWith('dev:')) {
      const [, email = 'dev@test.com', name = 'Dev User'] = dto.idToken.split(':');
      profile = {
        googleId:      `dev_${email.replace(/\W/g, '_')}`,
        email:         email.toLowerCase(),
        name,
        avatar:        undefined,
        emailVerified: true,
      };
      logger.warn('DEV MODE: Google token verification bypassed', { email });
    } else {
      profile = await GoogleService.verifyIdToken(dto.idToken);
    }

    if (!profile.emailVerified) {
      throw AppError.badRequest(
        'Google account email is not verified. Please verify your Google email first.',
        'GOOGLE_EMAIL_UNVERIFIED',
      );
    }

    // ── 2. Look up by googleId first (fastest path) ───────
    let vendor = await VendorModel.findOne({ googleId: profile.googleId })
      .select('+refreshTokens +fcmTokens');

    if (vendor) {
      // Case 1: known Google user
      if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');
      return this.finaliseLogin(vendor, fcmToken);
    }

    // ── 3. Look up by email ───────────────────────────────
    vendor = await VendorModel.findOne({ email: profile.email })
      .select('+refreshTokens +fcmTokens');

    if (vendor) {
      // Case 2: existing local account with same email
      if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

      // Safety: if this account already has a DIFFERENT googleId, reject.
      // This prevents one Google account from hijacking another vendor's account.
      if (vendor.googleId && vendor.googleId !== profile.googleId) {
        throw AppError.conflict(
          'This email is already linked to a different Google account.',
          'GOOGLE_ACCOUNT_CONFLICT',
        );
      }

      // Link Google to the existing local account
      vendor.googleId      = profile.googleId;
      vendor.authProvider  = vendor.authProvider === 'local' ? 'both' : vendor.authProvider;
      vendor.isEmailVerified = true;

      // Only update avatar if the vendor hasn't set one yet
      if (!vendor.avatar && profile.avatar) {
        vendor.avatar = profile.avatar;
      }

      await vendor.save();
      logger.info('Google account linked to existing vendor', { vendorId: vendor._id.toString() });

      return this.finaliseLogin(vendor, fcmToken);
    }

    // ── 4. New user — create account ──────────────────────
    // Phone is required for new Google signups (needed for OTP flows later)
    if (!dto.phone) {
      throw AppError.badRequest(
        'Phone number is required to complete Google Sign-Up.',
        'PHONE_REQUIRED',
      );
    }

    const username = await this.generateUniqueUsername(profile.name, profile.email);

    try {
      vendor = await VendorModel.create({
        username,
        name:            profile.name,
        email:           profile.email,
        phone:           dto.phone,
        googleId:        profile.googleId,
        authProvider:    'google',
        avatar:          profile.avatar ?? '',
        isEmailVerified: true,   // Google already verified the email
        isPhoneVerified: false,  // phone still needs OTP verification
      });
    } catch (err) {
      if (
        err instanceof mongoose.mongo.MongoServerError &&
        (err as mongoose.mongo.MongoServerError).code === 11000
      ) {
        const mongoErr = err as mongoose.mongo.MongoServerError;
        const field    = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'field';
        const messages: Record<string, string> = {
          email:    'An account with this Google email already exists.',
          phone:    'Phone number already registered.',
          googleId: 'This Google account is already registered.',
          username: 'Username conflict — please try again.',
        };
        throw AppError.conflict(
          messages[field] ?? 'Account already exists',
          `${field.toUpperCase()}_EXISTS`,
        );
      }
      throw err;
    }

    logger.info('New vendor created via Google', { vendorId: vendor._id.toString() });

    // Send phone OTP in background — don't block the response
    OtpService.sendOtp(dto.phone, 'phone').catch(err =>
      logger.error('Failed to send phone OTP after Google signup', { err }),
    );

    return this.finaliseLogin(vendor, fcmToken, true);
  }

  // ── Send OTP ──────────────────────────────────────────────
  public async sendOtp(dto: SendOtpDto): Promise<{
    sentTo:  string;
    channel: OtpChannel;
  }> {
    const channel: OtpChannel = dto.phone ? 'phone' : 'email';
    const identifier = (dto.phone ?? dto.email)!;

    await OtpService.sendOtp(identifier, channel);
    logger.info('OTP sent', { channel });

    return {
      sentTo:  channel === 'phone' ? this.maskPhone(identifier) : this.maskEmail(identifier),
      channel,
    };
  }

  // ── Verify OTP ────────────────────────────────────────────
  public async verifyOtp(dto: VerifyOtpDto): Promise<void> {
    const channel: OtpChannel = dto.phone ? 'phone' : 'email';
    const identifier = (dto.phone ?? dto.email)!;

    await OtpService.verifyOtp(identifier, dto.otp, channel);

    if (dto.phone) {
      await VendorModel.updateOne({ phone: dto.phone }, { isPhoneVerified: true });
      logger.info('Phone verified');
    } else {
      await VendorModel.updateOne({ email: dto.email }, { isEmailVerified: true });
      logger.info('Email verified');
    }
  }

  // ── Forgot Password ───────────────────────────────────────
  public async forgotPassword(phone: string): Promise<void> {
    const vendor = await VendorModel.findOne({ phone }).lean();

    if (!vendor) {
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      return;
    }

    // Google-only accounts have no password to reset
    if (vendor.authProvider === 'google') {
      // Still return silently — don't reveal auth provider to caller
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      return;
    }

    try {
      await OtpService.sendOtp(phone, 'phone');
      logger.info('Forgot password OTP sent');
    } catch (err) {
      logger.error('Failed to send forgot password OTP', { err });
    }
  }

  // ── Verify Forgot Password OTP ────────────────────────────
  public async verifyForgotOtp(phone: string, otp: string): Promise<string> {
    const vendor = await VendorModel.findOne({ phone }).select('_id authProvider').lean();

    if (!vendor) {
      await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
      throw AppError.badRequest('Invalid or expired OTP', 'INVALID_OTP');
    }

    if (vendor.authProvider === 'google') {
      throw AppError.badRequest(
        'This account uses Google Sign-In and has no password to reset.',
        'NO_PASSWORD_RESET',
      );
    }

    await OtpService.verifyOtp(phone, otp, 'phone');

    const redis      = getRedis();
    const resetToken = randomUUID();

    await redis.setEx(`reset_token:vendor:${resetToken}`, RESET_TOKEN_TTL, phone);

    return resetToken;
  }

  // ── Reset Password ────────────────────────────────────────
  public async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const redis    = getRedis();
    const redisKey = `reset_token:vendor:${dto.resetToken}`;
    const phone    = await redis.get(redisKey);

    if (!phone) {
      throw AppError.badRequest('Reset token expired or invalid', 'RESET_TOKEN_INVALID');
    }

    const vendor = await VendorModel.findOne({ phone }).select('+password +refreshTokens');
    if (!vendor) throw AppError.notFound('Vendor');

    vendor.password      = dto.newPassword;
    vendor.refreshTokens = [];

    // If this was a Google account that now has a password, upgrade provider
    if (vendor.authProvider === 'google') {
      vendor.authProvider = 'both';
    }

    await vendor.save();
    await redis.del(redisKey);

    logger.info('Password reset successful');
  }

  // ── Refresh Tokens ────────────────────────────────────────
  public async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const payload = verifyRefreshToken(refreshToken);
    const hashed  = hashToken(refreshToken);

    const vendor = await VendorModel.findById(payload.vendorId)
      .select('+refreshTokens isActive');

    if (!vendor) throw AppError.unauthorized('Vendor not found');
    if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

    const tokenIndex = (vendor.refreshTokens ?? []).indexOf(hashed);

    if (tokenIndex === -1) {
      vendor.refreshTokens = [];
      await vendor.save();
      await this.invalidateStatusCache(vendor._id.toString());
      logger.warn('Refresh token reuse detected — all sessions invalidated', {
        vendorId: vendor._id.toString(),
      });
      throw AppError.unauthorized('Token reuse detected. Please log in again.');
    }

    const tokens    = this.generateTokens(vendor);
    const newHashed = hashToken(tokens.refreshToken);

    vendor.refreshTokens = [
      ...(vendor.refreshTokens ?? []).filter(t => t !== hashed),
      newHashed,
    ];

    await vendor.save();
    return tokens;
  }

  // ── Logout ────────────────────────────────────────────────
  public async logout(
    vendorId:      string,
    refreshToken?: string,
    fcmToken?:     string,
  ): Promise<void> {
    const vendor = await VendorModel.findById(vendorId).select('+refreshTokens +fcmTokens');
    if (!vendor) return;

    if (refreshToken) {
      const hashed = hashToken(refreshToken);
      vendor.refreshTokens = (vendor.refreshTokens ?? []).filter(t => t !== hashed);
    }

    if (fcmToken) {
      vendor.fcmTokens = (vendor.fcmTokens ?? []).filter(t => t !== fcmToken);
    }

    vendor.isOnline = false;
    await vendor.save();

    await this.invalidateStatusCache(vendorId);
    logger.info('Vendor logged out', { vendorId });
  }

  // ── Private: finalise login ───────────────────────────────
  /**
   * Common tail for all login paths — generates tokens, updates DB, returns result.
   * @param requiresOnboarding  true for brand-new Google signups that still need phone verification
   */
  private async finaliseLogin(
    vendor:             IVendor,
    fcmToken?:          string,
    requiresOnboarding = false,
  ): Promise<AuthResult> {
    const tokens = this.generateTokens(vendor);
    const hashed = hashToken(tokens.refreshToken);

    vendor.refreshTokens = [
      ...(vendor.refreshTokens ?? []).slice(-(MAX_REFRESH_TOKENS - 1)),
      hashed,
    ];

    if (fcmToken) {
      const existing = (vendor.fcmTokens ?? []).filter(t => t !== fcmToken);
      vendor.fcmTokens = [...existing.slice(-(MAX_FCM_TOKENS - 1)), fcmToken];
    }

    await vendor.save();

    return {
      vendor: this.toLoginVendor(vendor, requiresOnboarding),
      tokens,
    };
  }

  // ── Private: generate tokens ──────────────────────────────
  private generateTokens(vendor: IVendor): AuthTokens {
    const payload = { vendorId: vendor._id.toString() };
    return {
      accessToken:  signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };
  }

  // ── Private: map to login DTO ─────────────────────────────
  private toLoginVendor(vendor: IVendor, requiresOnboarding = false): LoginVendor {
    return {
      id:                 vendor._id.toString(),
      name:               vendor.name,
      email:              vendor.email,
      phone:              vendor.phone,
      username:           vendor.username,
      isPhoneVerified:    vendor.isPhoneVerified,
      isEmailVerified:    vendor.isEmailVerified,
      kycStatus:          vendor.kycStatus,
      avatar:             vendor.avatar,
      authProvider:       vendor.authProvider,
      requiresOnboarding,
    };
  }

  // ── Private: generate unique username ─────────────────────
  /**
   * Derives a username from the Google display name or email prefix,
   * then appends a numeric suffix until it's unique in the DB.
   */
  private async generateUniqueUsername(name: string, email: string): Promise<string> {
    // Sanitise: lowercase, replace spaces/special chars with underscore, trim to 20 chars
    const base = (name || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'vendor';

    // Try the base name first, then base_2, base_3 … up to 10 attempts
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
      const exists    = await VendorModel.exists({ username: candidate });
      if (!exists) return candidate;
    }

    // Fallback: base + random 6-char suffix — virtually guaranteed unique
    return `${base}_${randomUUID().replace(/-/g, '').slice(0, 6)}`;
  }

  // ── Private: invalidate Redis status cache ────────────────
  private async invalidateStatusCache(vendorId: string): Promise<void> {
    try {
      await getRedis().del(`vendor:status:${vendorId}`);
    } catch (err) {
      logger.warn('Failed to invalidate vendor status cache', { vendorId, err });
    }
  }

  // ── Private: masking helpers ──────────────────────────────
  private maskPhone(phone: string): string {
    return phone.slice(0, 3) + '****' + phone.slice(-3);
  }

  private maskEmail(email: string): string {
    return email.replace(/(.{2})(.*)(@.*)/, '$1****$3');
  }
}
