import { Response, NextFunction } from 'express';
import { verifyAccessToken } from '../../shared/utils/Token';
import { AppError } from '../../shared/utils/AppError';
import { AuthRequest } from '../../types/index';
import { VendorModel } from '../../models/vendor.model';
import { getRedis } from '../../shared/database/redis';
import { KycStatus } from '../../types/index';

interface CachedVendorStatus {
  id:        string;
  kycStatus: KycStatus;
  isOnline:  boolean;
  isActive:  boolean;
}

const VENDOR_STATUS_TTL = 60; // seconds

export const authenticate = async (
  req:  AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw AppError.unauthorized('No token provided');
    }

    const token   = authHeader.split(' ')[1];
    const payload = verifyAccessToken(token);

    // ── Try Redis cache first ──────────────────────────
    const redis    = getRedis();
    const cacheKey = `vendor:status:${payload.vendorId}`;
    const cached   = await redis.get(cacheKey);

    let vendor: CachedVendorStatus;

    if (cached) {
      vendor = JSON.parse(cached) as CachedVendorStatus;
    } else {
      const doc = await VendorModel.findById(payload.vendorId)
        .select('_id kycStatus isOnline isActive')
        .lean();

      if (!doc) throw AppError.unauthorized('Vendor account not found');

      vendor = {
        id:        doc._id.toString(),
        kycStatus: doc.kycStatus,
        isOnline:  doc.isOnline,
        isActive:  doc.isActive,
      };

      await redis.setEx(cacheKey, VENDOR_STATUS_TTL, JSON.stringify(vendor));
    }

    if (!vendor.isActive) throw AppError.forbidden('Account has been deactivated');

    req.vendor = {
      id:        vendor.id,
      kycStatus: vendor.kycStatus,
      isOnline:  vendor.isOnline,
    };

    next();
  } catch (err) {
    next(err);
  }
};

// ── KYC guard — blocks access if KYC not approved ─────────
export const requireKyc = (
  req:  AuthRequest,
  _res: Response,
  next: NextFunction,
): void => {
  if (req.vendor?.kycStatus !== 'approved') {
    next(AppError.forbidden('KYC verification required to access this feature'));
    return;
  }
  next();
};
