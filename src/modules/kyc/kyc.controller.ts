import { Response } from 'express';

import { KycService }    from './kyc.service';
import { sendSuccess, sendCreated } from '../../shared/utils/Response';
import { asyncHandler }  from '../../shared/utils/asyncHandler';
import { getAuthVendor } from '../../shared/utils/AppError';
import { AppError }      from '../../shared/utils/AppError';
import { AuthRequest }   from '../../types/index';

import { KycSubmitDto } from './kyc.validation';

export class KycController {
  private service = new KycService();

  // POST /vendor/kyc/submit
  public submit = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const files  = req.files as Record<string, Express.Multer.File[]> | undefined;

    const frontImage = files?.['frontImage']?.[0];
    const selfie     = files?.['selfie']?.[0];
    const backImage  = files?.['backImage']?.[0];

    if (!frontImage) throw AppError.badRequest('Front image is required', 'MISSING_FRONT_IMAGE');
    if (!selfie)     throw AppError.badRequest('Selfie is required', 'MISSING_SELFIE');

    const result = await this.service.submit(
      id,
      req.body as KycSubmitDto,
      { frontImage, selfie, backImage },
    );

    sendCreated(res, result, 'KYC submitted successfully');
  });

  // POST /vendor/kyc/resubmit
  public resubmit = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const files  = req.files as Record<string, Express.Multer.File[]> | undefined;

    const frontImage = files?.['frontImage']?.[0];
    const selfie     = files?.['selfie']?.[0];
    const backImage  = files?.['backImage']?.[0];

    if (!frontImage) throw AppError.badRequest('Front image is required', 'MISSING_FRONT_IMAGE');
    if (!selfie)     throw AppError.badRequest('Selfie is required', 'MISSING_SELFIE');

    const result = await this.service.resubmit(
      id,
      req.body as KycSubmitDto,
      { frontImage, selfie, backImage },
    );

    sendCreated(res, result, 'KYC resubmitted successfully');
  });

  // GET /vendor/kyc/status
  public getStatus = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const data   = await this.service.getStatus(id);
    sendSuccess(res, data, 'KYC status fetched');
  });

  // GET /vendor/me/documents
  public getDocuments = asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = getAuthVendor(req);
    const data   = await this.service.getDocuments(id);
    sendSuccess(res, data, 'KYC documents fetched');
  });
}
