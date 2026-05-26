import { z } from 'zod';

// ── Shared regex ───────────────────────────────────────────
const phoneRegex = /^\+?[1-9]\d{9,14}$/;
const strongPass = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,64}$/;
const timeRegex  = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Reusable field definitions ─────────────────────────────
// phoneField kept for registration and future SMS re-integration
// TODO: restore phoneField to OTP schemas when SMS is re-enabled
const phoneField = z.string().trim().regex(phoneRegex, 'Invalid phone number format');
const emailField = z
  .string()
  .trim()
  .email('Invalid email address')
  .transform(v => v.toLowerCase());

// Password — intentionally NO .trim() (trimming silently changes the user's password)
const passwordField = z
  .string()
  .min(8,  'Password must be at least 8 characters')
  .max(64, 'Password cannot exceed 64 characters')
  .regex(strongPass, 'Password must contain uppercase, lowercase, number and special character');

// ── OTP code field (shared) ────────────────────────────────
const otpField = z
  .string()
  .trim()
  .length(6, 'OTP must be 6 digits')
  .regex(/^\d{6}$/, 'OTP must contain only digits');

// ── Register ───────────────────────────────────────────────
export const RegisterSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3,  'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers and underscores')
    .transform(v => v.toLowerCase())
    .optional(),

  name: z
    .string()
    .trim()
    .min(2,   'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),

  // Phone kept in registration for future SMS OTP and vendor identity
  // TODO: make phone optional once SMS is fully removed from onboarding
  phone: phoneField,
  email: emailField,

  password:        passwordField,
  confirmPassword: z.string().optional(),
})
.refine(d => !d.confirmPassword || d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
})
.strict();

// ── Login ──────────────────────────────────────────────────
export const LoginSchema = z.object({
  phone:    phoneField,
  password: z.string().min(1, 'Password is required'),
})
.strict();

// ── Send OTP — email only ──────────────────────────────────
// Phone OTP is disabled. Schema simplified to email-only.
// TODO: restore phone field when SMS is re-enabled
export const SendOtpSchema = z.object({
  email: emailField,
})
.strict();

// ── Verify OTP — email only ────────────────────────────────
// TODO: restore phone field when SMS is re-enabled
export const VerifyOtpSchema = z.object({
  email: emailField,
  otp:   otpField,
})
.strict();

// ── Forgot Password — email only ───────────────────────────
// Phone-based forgot password is disabled.
// TODO: restore phone field when SMS is re-enabled
export const ForgotPasswordSchema = z.object({
  email: emailField,
})
.strict();

// ── Verify Forgot Password OTP — email only ────────────────
// TODO: restore phone field when SMS is re-enabled
export const VerifyForgotOtpSchema = z.object({
  email: emailField,
  otp:   otpField,
})
.strict();

// ── Reset Password ─────────────────────────────────────────
export const ResetPasswordSchema = z.object({
  resetToken:      z.string().trim().min(1, 'Reset token is required'),
  newPassword:     passwordField,
  confirmPassword: z.string().min(1, 'Confirm password is required'),
})
.refine(d => d.newPassword === d.confirmPassword, {
  message: 'Passwords do not match',
  path:    ['confirmPassword'],
})
.strict();

// ── Refresh Token ──────────────────────────────────────────
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1, 'Refresh token is required'),
})
.strict();

// ── Google Auth ────────────────────────────────────────────
export const GoogleAuthSchema = z.object({
  idToken:  z.string().trim().min(1, 'Google ID token is required'),
  phone:    phoneField.optional(),
  fcmToken: z.string().trim().min(1).optional(),
})
.strict();

// ── FCM Token ──────────────────────────────────────────────
export const FcmTokenSchema = z.object({
  fcmToken: z.string().trim().min(1, 'FCM token is required'),
  platform: z.enum(['android', 'ios']),
})
.strict();

// ── Working hour time string ───────────────────────────────
export const TimeStringSchema = z
  .string()
  .regex(timeRegex, 'Time must be in HH:MM format (e.g. 09:00)');

// ── DTO types ──────────────────────────────────────────────
export type RegisterDto        = z.infer<typeof RegisterSchema>;
export type LoginDto           = z.infer<typeof LoginSchema>;
export type SendOtpDto         = z.infer<typeof SendOtpSchema>;
export type VerifyOtpDto       = z.infer<typeof VerifyOtpSchema>;
export type ForgotPasswordDto  = z.infer<typeof ForgotPasswordSchema>;
export type VerifyForgotOtpDto = z.infer<typeof VerifyForgotOtpSchema>;
export type ResetPasswordDto   = z.infer<typeof ResetPasswordSchema>;
export type RefreshTokenDto    = z.infer<typeof RefreshTokenSchema>;
export type FcmTokenDto        = z.infer<typeof FcmTokenSchema>;
export type GoogleAuthDto      = z.infer<typeof GoogleAuthSchema>;
