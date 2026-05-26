import { Router } from 'express';

import { authenticate }  from '../../shared/middlewares/auth.middleware';
import { validate }      from '../../shared/middlewares/validate.middleware';
import { upload }        from '../../shared/storage/multer';
import { KycController } from './kyc.controller';
import { KycSubmitSchema } from './kyc.validation';

const router     = Router();
const controller = new KycController();

// Multer config for KYC document uploads
const kycUpload = upload.fields([
  { name: 'frontImage', maxCount: 1 },
  { name: 'backImage',  maxCount: 1 },
  { name: 'selfie',     maxCount: 1 },
]);

// All KYC routes require authentication
router.use(authenticate);

// KYC routes — mounted at /api/v1/vendor/kyc
router.post('/submit',    kycUpload, validate(KycSubmitSchema, 'body'), controller.submit);
router.post('/resubmit',  kycUpload, validate(KycSubmitSchema, 'body'), controller.resubmit);
router.get('/status',     controller.getStatus);

// Documents history — mounted at /api/v1/vendor/me
router.get('/documents',  controller.getDocuments);

export default router;
