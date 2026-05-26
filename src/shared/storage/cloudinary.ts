import { v2 as cloudinary } from 'cloudinary';
import { config } from '../../config/index';

cloudinary.config({
  cloud_name: config.cloudinary.cloudName,
  api_key:    config.cloudinary.apiKey,
  api_secret: config.cloudinary.apiSecret,
});

export interface UploadResult {
  url:      string;
  publicId: string;
}

/**
 * Uploads a Buffer directly to Cloudinary via upload_stream.
 * Used with Multer memoryStorage — no temp files on disk.
 */
export const uploadBuffer = (
  buffer:   Buffer,
  folder:   string,
  publicId: string,
): Promise<UploadResult> => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id:      publicId,
        resource_type:  'image',
        overwrite:      true,
        // Moderate quality for documents — balance size vs readability
        quality:        'auto:good',
        fetch_format:   'auto',
      },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload returned no result'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      },
    );
    stream.end(buffer);
  });
};
