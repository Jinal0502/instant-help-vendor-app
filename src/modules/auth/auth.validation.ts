import { z } from 'zod';

// ── Shared regex ───────────────────────────────────────────
const phoneRegex = /^\+?[1-9]\d{9,14}$/;
const strongPass = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,64}$/;
const timeRegex  = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Reusable field definitions ─────────────────────────────
const phoneField = z.string().trim().regex(phoneRegex, 'Invalid phone number format');
const emailField = z.string().trim().email('Invalid email address').transform(v => v.toLowerCase());

/**
 * Password field — intentionally NO .trim().
 * Trimming passwords silently changes what the user typed.
 */
const passwordField = z
  .string()
  .min(8,  'Password must be at least 8 characters')
  .max(64, 'Password cannot exceed 64 characters')
  .regex(strongPass, 'Password must contain uppercase, lowercase, number and special character');

// ── Register ───────────────────────────────────────────────
export const RegisterSchema = z.object({
  // Optional — auto-generated from phone if not provided
  username: z
    .string()
    .trim()
    .min(3,  'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers and underscores')
    .transform(v => v.toLowerCase())
    .optional(),

  // Optional at registration
  name: z
    .string()
    .trim()
    .min(2,   'Name must be at least 2 characters')
    .max(100, 'Name cannot exceed 100 characters')
    .optional(),

  phone: phoneField,
  email: emailField,

  password: passwordField,

  // Optional — skip confirm password check if not provided
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

// ── Send OTP ───────────────────────────────────────────────
export const SendOtpSchema = z.object({
  phone: phoneField.optional(),
  email: emailField.optional(),
})
.refine(d => !!(d.phone || d.email), {
  message: 'Either phone or email is required',
  path:    ['phone'],
})
.refine(d => !(d.phone && d.email), {
  message: 'Provide only one — phone or email',
  path:    ['phone'],
})
.strict();

// ── Verify OTP ─────────────────────────────────────────────
export const VerifyOtpSchema = z.object({
  phone: phoneField.optional(),
  email: emailField.optional(),

  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
})
.refine(d => !!(d.phone || d.email), {
  message: 'Either phone or email is required',
  path:    ['phone'],
})
.refine(d => !(d.phone && d.email), {
  message: 'Provide only one — phone or email',
  path:    ['phone'],
})
.strict();

// ── Forgot Password ────────────────────────────────────────
export const ForgotPasswordSchema = z.object({
  phone: phoneField,
})
.strict();

// ── Verify Forgot Password OTP ─────────────────────────────
export const VerifyForgotOtpSchema = z.object({
  phone: phoneField,
  otp: z
    .string()
    .trim()
    .length(6, 'OTP must be 6 digits')
    .regex(/^\d{6}$/, 'OTP must contain only digits'),
})
.strict();

// ── Reset Password ─────────────────────────────────────────
export const ResetPasswordSchema = z.object({
  resetToken: z.string().trim().min(1, 'Reset token is required'),

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
  // The idToken from Google Sign-In SDK on Android / iOS
  idToken: z.string().trim().min(1, 'Google ID token is required'),

  // Phone is required for new Google signups — not needed for existing accounts
  phone: z
    .string()
    .trim()
    .regex(phoneRegex, 'Invalid phone number format')
    .optional(),

  // Optional FCM token for push notifications
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
export type RegisterDto      = z.infer<typeof RegisterSchema>;
export type LoginDto         = z.infer<typeof LoginSchema>;
export type SendOtpDto       = z.infer<typeof SendOtpSchema>;
export type VerifyOtpDto     = z.infer<typeof VerifyOtpSchema>;
export type ForgotPasswordDto    = z.infer<typeof ForgotPasswordSchema>;
export type VerifyForgotOtpDto   = z.infer<typeof VerifyForgotOtpSchema>;
export type ResetPasswordDto = z.infer<typeof ResetPasswordSchema>;
export type RefreshTokenDto  = z.infer<typeof RefreshTokenSchema>;
export type FcmTokenDto      = z.infer<typeof FcmTokenSchema>;
export type GoogleAuthDto    = z.infer<typeof GoogleAuthSchema>;
