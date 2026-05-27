import { randomUUID } from 'crypto';
import mongoose from 'mongoose';

import { VendorModel, IVendor } from '../../models/vendor.model';
import { AppError }             from '../../shared/utils/AppError';
import { getRedis }             from '../../shared/database/redis';
import { config }               from '../../config/index';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} from '../../shared/utils/Token';
import { OtpService }      from '../../shared/services/otp.service';
import { GoogleService }   from '../../shared/services/google.service';
import { logger }          from '../../logger/index';
import { KycStatus }       from '../../types/index';
import {EmailService}       from '../../shared/services/email.service';

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

interface LoginVendor {
  id:                 string;
  name:               string;
  email:              string;
  phone:              string;
  username:           string;
  isEmailVerified:    boolean;
  // Phone verification is disabled — kept for future SMS re-integration
  // TODO: restore isPhoneVerified to active use when SMS is re-enabled
  isPhoneVerified:    boolean;
  kycStatus:          KycStatus;
  avatar?:            string;
  authProvider:       string;
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
    email:    string;
  }> {
    const username = dto.username ?? `user_${dto.phone.replace(/\D/g, '').slice(-8)}`;

    let vendor: IVendor;
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

    // Send email OTP only — SMS disabled
    // TODO: also send phone OTP here when SMS is re-enabled
    try {
      await OtpService.sendOtp(dto.email.toLowerCase(), 'email' , 'registration');

    } catch (err) {
      logger.error('Failed to send registration OTP via email', {
        err,
        vendorId: vendor._id.toString(),
      });
      // Non-fatal — vendor can request OTP again via /send-otp
    }

    return { vendorId: vendor._id.toString(), email: dto.email };
  }

  // ── Login ─────────────────────────────────────────────────
  public async login(dto: LoginDto, fcmToken?: string): Promise<AuthResult> {
    const vendor = await VendorModel.findOne({ phone: dto.phone })
      .select('+password +refreshTokens +fcmTokens');

    if (!vendor) throw AppError.unauthorized('Invalid credentials');

    const isMatch = await vendor.comparePassword(dto.password);
    if (!isMatch) throw AppError.unauthorized('Invalid credentials');

    if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

    if (vendor.authProvider === 'google') {
      throw AppError.badRequest(
        'This account uses Google Sign-In. Please log in with Google.',
        'USE_GOOGLE_LOGIN',
      );
    }

    return this.finaliseLogin(vendor, fcmToken);
  }

  // ── Google Auth ───────────────────────────────────────────
  public async googleAuth(dto: GoogleAuthDto, fcmToken?: string): Promise<AuthResult> {
    // DEV ONLY: bypass real Google verification with "dev:<email>:<name>"
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
        'Google account email is not verified.',
        'GOOGLE_EMAIL_UNVERIFIED',
      );
    }

    // Case 1: known Google user
    let vendor = await VendorModel.findOne({ googleId: profile.googleId })
      .select('+refreshTokens +fcmTokens');

    if (vendor) {
      if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');
      return this.finaliseLogin(vendor, fcmToken);
    }

    // Case 2: existing local account — link Google
    vendor = await VendorModel.findOne({ email: profile.email })
      .select('+refreshTokens +fcmTokens');

    if (vendor) {
      if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

      if (vendor.googleId && vendor.googleId !== profile.googleId) {
        throw AppError.conflict(
          'This email is already linked to a different Google account.',
          'GOOGLE_ACCOUNT_CONFLICT',
        );
      }

      vendor.googleId        = profile.googleId;
      vendor.authProvider    = vendor.authProvider === 'local' ? 'both' : vendor.authProvider;
      vendor.isEmailVerified = true;
      if (!vendor.avatar && profile.avatar) vendor.avatar = profile.avatar;

      await vendor.save();
      logger.info('Google account linked to existing vendor', { vendorId: vendor._id.toString() });
      return this.finaliseLogin(vendor, fcmToken);
    }

    // Case 3: new user
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
        isEmailVerified: true,
        isPhoneVerified: false,
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
    // TODO: send phone OTP here when SMS is re-enabled
    return this.finaliseLogin(vendor, fcmToken, true);
  }

  // ── Send OTP ──────────────────────────────────────────────
  public async sendOtp(dto: SendOtpDto): Promise<{ sentTo: string }> {
    const email = dto.email!;
    await OtpService.sendOtp(email, 'email', 'resend');
    logger.info('OTP sent via email');
    return { sentTo: this.maskEmail(email) };
  }

  // ── Verify OTP ────────────────────────────────────────────
  /**
   * Email-only OTP verification.
   * TODO: restore phone verification when SMS is re-enabled
   */
  public async verifyOtp(dto: VerifyOtpDto): Promise<void> {
    const email = dto.email!;

    await OtpService.verifyOtp(email, dto.otp, 'email');

    const vendor = await VendorModel.findOne({ email: email.toLowerCase() });

    if (!vendor) {
      // This should never happen — OTP existence implies vendor existence
      logger.error('OTP verified but no vendor found', { email });
      throw AppError.notFound('Vendor');
    }

    await VendorModel.updateOne({ email }, { isEmailVerified: true });

    await EmailService.sendWelcomeEmail(vendor.email.toLowerCase(), vendor.name ?? '');

    logger.info('Email verified');
  }

  // ── Forgot Password ───────────────────────────────────────
  /**
   * Sends a password-reset OTP to the vendor's registered email.
   * Phone-based forgot password is disabled.
   * TODO: restore phone channel when SMS is re-enabled
   */
  public async forgotPassword(email: string): Promise<void> {
    const vendor = await VendorModel.findOne({ email: email.toLowerCase() })
      .select('authProvider')
      .lean();

    // Constant-time response — never reveal whether the email is registered
    if (!vendor) {
      await this.constantDelay();
      return;
    }

    // Google-only accounts have no password to reset — silent fail
    if (vendor.authProvider === 'google') {
      await this.constantDelay();
      return;
    }

    try {
      await OtpService.sendOtp(email.toLowerCase(), 'email', 'password-reset');
      logger.info('Forgot password OTP sent via email');
    } catch (err) {
      // Swallow delivery errors — client always gets the same generic response
      logger.error('Failed to send forgot password OTP', { err });
    }
  }

  // ── Verify Forgot Password OTP ────────────────────────────
  public async verifyForgotOtp(email: string, otp: string): Promise<string> {
    const normalised = email.toLowerCase();

    const vendor = await VendorModel.findOne({ email: normalised })
      .select('authProvider')
      .lean();

    if (!vendor) {
      await this.constantDelay();
      throw AppError.badRequest('Invalid or expired OTP', 'INVALID_OTP');
    }

    if (vendor.authProvider === 'google') {
      throw AppError.badRequest(
        'This account uses Google Sign-In and has no password to reset.',
        'NO_PASSWORD_RESET',
      );
    }

    await OtpService.verifyOtp(normalised, otp, 'email');

    const redis      = getRedis();
    const resetToken = randomUUID();
    await redis.setEx(`reset_token:vendor:${resetToken}`, RESET_TOKEN_TTL, normalised);

    return resetToken;
  }

  // ── Reset Password ────────────────────────────────────────
  public async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const redis    = getRedis();
    const redisKey = `reset_token:vendor:${dto.resetToken}`;
    const email    = await redis.get(redisKey);

    if (!email) {
      throw AppError.badRequest('Reset token expired or invalid', 'RESET_TOKEN_INVALID');
    }

    const vendor = await VendorModel.findOne({ email }).select('+password +refreshTokens');
    if (!vendor) throw AppError.notFound('Vendor');

    vendor.password      = dto.newPassword;
    vendor.refreshTokens = [];

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

    if (!vendor)          throw AppError.unauthorized('Vendor not found');
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

    return { vendor: this.toLoginVendor(vendor, requiresOnboarding), tokens };
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
      isEmailVerified:    vendor.isEmailVerified,
      isPhoneVerified:    vendor.isPhoneVerified,
      kycStatus:          vendor.kycStatus,
      avatar:             vendor.avatar,
      authProvider:       vendor.authProvider,
      requiresOnboarding,
    };
  }

  // ── Private: generate unique username ─────────────────────
  private async generateUniqueUsername(name: string, email: string): Promise<string> {
    const base = (name || email.split('@')[0])
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 20) || 'vendor';

    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = attempt === 0 ? base : `${base}_${attempt + 1}`;
      const exists    = await VendorModel.exists({ username: candidate });
      if (!exists) return candidate;
    }

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

  // ── Private: constant-time delay (anti-enumeration) ───────
  private constantDelay(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 200));
  }

  // ── Private: masking helpers ──────────────────────────────
  private maskEmail(email: string): string {
    return email.replace(/(.{2})(.*)(@.*)/, '$1****$3');
  }
}
