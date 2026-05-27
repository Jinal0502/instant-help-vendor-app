import jwt, { SignOptions } from 'jsonwebtoken';
import { createHash } from 'crypto';
import { config } from '../../config/index';
import { AppError } from './AppError';

export interface TokenPayload {
  vendorId: string;
  type:     'access' | 'refresh';
}

export const signAccessToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign(
    { ...payload, type: 'access' },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn } as SignOptions,
  );
};

export const signRefreshToken = (payload: Omit<TokenPayload, 'type'>): string => {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn } as SignOptions,
  );
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
  } catch {
    throw AppError.unauthorized('Invalid or expired access token');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }
};

/**
 * Hash a refresh token before storing in DB.
 * SHA-256 is sufficient here — we only need a consistent fingerprint,
 * not a password-strength KDF.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
