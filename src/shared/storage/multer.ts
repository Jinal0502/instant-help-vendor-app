import multer, { FileFilterCallback } from 'multer';
import { Request } from 'express';
import { AppError } from '../../shared/utils/AppError';

// Files are kept in memory as Buffer — streamed directly to Cloudinary
const storage = multer.memoryStorage();

const imageFilter = (
  _req:  Request,
  file:  Express.Multer.File,
  cb:    FileFilterCallback,
): void => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.mimetype)) {
    cb(AppError.badRequest('Only JPEG, PNG and WebP images are allowed', 'INVALID_FILE_TYPE'));
    return;
  }
  cb(null, true);
};

// 5 MB limit per file
export const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
