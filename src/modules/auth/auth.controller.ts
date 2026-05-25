import { Request, Response } from 'express';

import { AuthService } from './auth.service';
import { sendSuccess, sendCreated } from '../../shared/utils/Response';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getAuthVendor } from '../../shared/utils/AppError';
import { AuthRequest } from '../../types/index';

import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  GoogleAuthDto,
} from './auth.validation';

const authService = new AuthService();

export class AuthController {

  // POST /auth/vendor/register
  public register = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await authService.register(req.body as RegisterDto);
    sendCreated(res, result, 'Registration successful. OTP sent to your phone and email.');
  });

  // POST /auth/login
  public login = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const fcmToken = req.headers['x-fcm-token'] as string | undefined;
    const result   = await authService.login(req.body as LoginDto, fcmToken);
    sendSuccess(res, result, 'Login successful');
  });

  // POST /auth/google
  public googleAuth = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const fcmToken = req.headers['x-fcm-token'] as string | undefined;
    const result   = await authService.googleAuth(req.body as GoogleAuthDto, fcmToken);

    const isNew = result.vendor.requiresOnboarding;
    sendSuccess(
      res,
      result,
      isNew ? 'Google Sign-Up successful. Please verify your phone.' : 'Google Sign-In successful',
      isNew ? 201 : 200,
    );
  });

  // POST /auth/send-otp
  public sendOtp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const result = await authService.sendOtp(req.body as SendOtpDto);
    sendSuccess(res, result, 'OTP sent successfully');
  });

  // POST /auth/verify-otp
  public verifyOtp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.verifyOtp(req.body as VerifyOtpDto);
    sendSuccess(res, null, 'OTP verified successfully');
  });

  // POST /auth/forgot-password
  public forgotPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phone } = req.body as ForgotPasswordDto;
    await authService.forgotPassword(phone);
    sendSuccess(res, null, 'If an account exists, an OTP has been sent.');
  });

  // POST /auth/verify-forgot-otp
  public verifyForgotOtp = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { phone, otp } = req.body as { phone: string; otp: string };
    const resetToken = await authService.verifyForgotOtp(phone, otp);
    sendSuccess(res, { resetToken }, 'OTP verified. Use the reset token to set a new password.');
  });

  // POST /auth/reset-password
  public resetPassword = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    await authService.resetPassword(req.body as ResetPasswordDto);
    sendSuccess(res, null, 'Password reset successful. Please log in again.');
  });

  // POST /auth/refresh-token
  public refreshToken = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as RefreshTokenDto;
    const tokens = await authService.refreshTokens(refreshToken);
    sendSuccess(res, tokens, 'Token refreshed successfully');
  });

  // POST /auth/logout  (protected)
  public logout = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id: vendorId } = getAuthVendor(req);
    const refreshToken     = req.body.refreshToken as string | undefined;
    const fcmToken         = req.headers['x-fcm-token'] as string | undefined;

    await authService.logout(vendorId, refreshToken, fcmToken);
    sendSuccess(res, null, 'Logged out successfully');
  });
}
