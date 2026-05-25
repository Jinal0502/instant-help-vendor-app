import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/index';
import { AppError } from '../../shared/utils/AppError';
import { logger } from '../../logger/index';

const client = new OAuth2Client(config.google.clientId);

export interface GoogleProfile {
  googleId:  string;
  email:     string;
  name:      string;
  avatar?:   string;
  emailVerified: boolean;
}

export class GoogleService {

  /**
   * Verifies the idToken sent from the mobile app (Google Sign-In SDK).
   * Returns the decoded Google profile if valid.
   * Throws 401 if the token is invalid, expired, or for wrong audience.
   */
  public static async verifyIdToken(idToken: string): Promise<GoogleProfile> {
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        // Accept tokens issued for either Android or iOS client IDs
        audience: [
          config.google.clientId,
          config.google.androidClientId,
          config.google.iosClientId,
        ].filter(Boolean) as string[],
      });

      const payload = ticket.getPayload();
      if (!payload) throw new Error('Empty payload');

      if (!payload.email) {
        throw AppError.badRequest(
          'Google account has no email address',
          'GOOGLE_NO_EMAIL',
        );
      }

      return {
        googleId:      payload.sub,                    // stable unique Google ID
        email:         payload.email.toLowerCase(),
        name:          payload.name ?? payload.email,
        avatar:        payload.picture,
        emailVerified: payload.email_verified ?? false,
      };
    } catch (err) {
      // Re-throw our own AppErrors as-is
      if (err instanceof AppError) throw err;

      logger.warn('Google token verification failed', { err });
      throw AppError.unauthorized('Invalid or expired Google token');
    }
  }
}