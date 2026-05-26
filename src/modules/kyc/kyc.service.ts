import { VendorModel } from '../../models/vendor.model';
import { KycModel }    from '../../models/kyc.model';
import { AppError }    from '../../shared/utils/AppError';
import { encrypt }     from '../../shared/utils/encryption';
import { uploadBuffer } from '../../shared/storage/cloudinary';
import { logger }      from '../../logger/index';

import { KycSubmitDto } from './kyc.validation';

interface KycFiles {
  frontImage: Express.Multer.File;
  selfie:     Express.Multer.File;
  backImage?: Express.Multer.File;
}

export class KycService {

  // ── POST /vendor/kyc/submit ───────────────────────────────
  public async submit(vendorId: string, dto: KycSubmitDto, files: KycFiles) {
    // Block if already approved
    const approved = await KycModel.findOne({ vendorId, status: 'approved' }).lean();
    if (approved) {
      throw AppError.conflict('KYC is already approved', 'KYC_ALREADY_APPROVED');
    }

    // Block if a review is in progress
    const inProgress = await KycModel.findOne({
      vendorId,
      status: { $in: ['pending', 'under_review'] },
    }).lean();

    if (inProgress) {
      throw AppError.conflict(
        'A KYC submission is already pending review',
        'KYC_UNDER_REVIEW',
      );
    }

    return this.createSubmission(vendorId, dto, files);
  }

  // ── POST /vendor/kyc/resubmit ─────────────────────────────
  public async resubmit(vendorId: string, dto: KycSubmitDto, files: KycFiles) {
    const last = await KycModel.findOne({ vendorId })
      .sort({ createdAt: -1 })
      .lean();

    if (!last) {
      throw AppError.badRequest('No previous KYC submission found', 'NO_PREVIOUS_KYC');
    }

    if (last.status !== 'rejected') {
      throw AppError.badRequest(
        'Resubmission is only allowed after a rejection',
        'RESUBMIT_NOT_ALLOWED',
      );
    }

    return this.createSubmission(vendorId, dto, files);
  }

  // ── GET /vendor/kyc/status ────────────────────────────────
  public async getStatus(vendorId: string) {
    const kyc = await KycModel.findOne({ vendorId })
      .sort({ createdAt: -1 })
      .select('-documentNumber')
      .lean();

    if (!kyc) {
      return { status: 'not_submitted', rejectionReason: null, submittedAt: null };
    }

    return {
      kycId:           kyc._id,
      status:          kyc.status,
      documentType:    kyc.documentType,
      frontImageUrl:   kyc.frontImageUrl,
      backImageUrl:    kyc.backImageUrl ?? null,
      selfieUrl:       kyc.selfieUrl,
      rejectionReason: kyc.rejectionReason ?? null,
      submittedAt:     kyc.submittedAt,
      reviewedAt:      kyc.reviewedAt ?? null,
    };
  }

  // ── GET /vendor/me/documents ──────────────────────────────
  public async getDocuments(vendorId: string) {
    const records = await KycModel.find({ vendorId })
      .sort({ createdAt: -1 })
      .select('-documentNumber')
      .lean();

    return records;
  }

  // ── Private: shared upload + create logic ─────────────────
  private async createSubmission(
    vendorId: string,
    dto:      KycSubmitDto,
    files:    KycFiles,
  ) {
    const now = Date.now();

    // Upload all images in parallel
    const uploadTasks: Promise<{ url: string; publicId: string }>[] = [
      uploadBuffer(
        files.frontImage.buffer,
        'kyc/documents',
        `${vendorId}_front_${now}`,
      ),
      uploadBuffer(
        files.selfie.buffer,
        'kyc/selfies',
        `${vendorId}_selfie_${now}`,
      ),
    ];

    if (files.backImage) {
      uploadTasks.push(
        uploadBuffer(
          files.backImage.buffer,
          'kyc/documents',
          `${vendorId}_back_${now}`,
        ),
      );
    }

    const [frontResult, selfieResult, backResult] = await Promise.all(uploadTasks);

    // Encrypt document number before persisting — never store plaintext
    const encryptedDocNumber = encrypt(dto.documentNumber);

    const kyc = await KycModel.create({
      vendorId,
      documentType:   dto.documentType,
      documentNumber: encryptedDocNumber,
      frontImageUrl:  frontResult.url,
      backImageUrl:   backResult?.url,
      selfieUrl:      selfieResult.url,
      capturedLive:   dto.capturedLive,
      status:         'pending',
      submittedAt:    new Date(),
    });

    // Sync vendor kycStatus
    await VendorModel.findByIdAndUpdate(vendorId, { kycStatus: 'pending' });

    logger.info('KYC submitted', { vendorId, kycId: kyc._id.toString() });

    return { kycId: kyc._id, status: 'pending' };
  }
}
