import { Router } from 'express';
import { AuthController } from './auth.controller';
import { validate } from '../../shared/middlewares/validate.middleware';
import { authenticate } from '../../shared/middlewares/auth.middleware';
import {
  RegisterSchema,
  LoginSchema,
  GoogleAuthSchema,
  SendOtpSchema,
  VerifyOtpSchema,
  ForgotPasswordSchema,
  VerifyForgotOtpSchema,
  ResetPasswordSchema,
  RefreshTokenSchema,
} from './auth.validation';

const router     = Router();
const controller = new AuthController();

// ── Public routes ──────────────────────────────────────────
router.post('/vendor/register',   validate(RegisterSchema),        controller.register);
router.post('/login',             validate(LoginSchema),           controller.login);
router.post('/google',            validate(GoogleAuthSchema),      controller.googleAuth);
router.post('/send-otp',          validate(SendOtpSchema),         controller.sendOtp);
router.post('/verify-otp',        validate(VerifyOtpSchema),       controller.verifyOtp);
router.post('/forgot-password',   validate(ForgotPasswordSchema),  controller.forgotPassword);
router.post('/verify-forgot-otp', validate(VerifyForgotOtpSchema), controller.verifyForgotOtp);
router.post('/reset-password',    validate(ResetPasswordSchema),   controller.resetPassword);
router.post('/refresh-token',     validate(RefreshTokenSchema),    controller.refreshToken);

// ── Protected routes ───────────────────────────────────────
router.post('/logout', authenticate, controller.logout);

export default router;
