import { z } from 'zod';

// ── Document number format validators ──────────────────────
const documentFormats: Record<string, RegExp> = {
  aadhaar:         /^\d{12}$/,
  pan:             /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/,
  passport:        /^[A-Z]{1}[0-9]{7}$/,
  driving_licence: /^[A-Z]{2}\d{2}\s?\d{11}$/,
  voter_id:        /^[A-Z]{3}[0-9]{7}$/,
};

// ── POST /vendor/kyc/submit (multipart text fields) ────────
export const KycSubmitSchema = z.object({
  documentType: z.enum(
    ['aadhaar', 'pan', 'passport', 'driving_licence', 'voter_id'],
    { error: 'Invalid document type' },
  ),

  documentNumber: z.string().trim().min(1, 'Document number is required'),

  // Multer sends booleans as strings from multipart forms
  capturedLive: z
    .string()
    .trim()
    .refine(v => v === 'true' || v === 'false', {
      message: 'capturedLive must be "true" or "false"',
    })
    .transform(v => v === 'true'),
})
.strict()
.superRefine((data, ctx) => {
  const pattern = documentFormats[data.documentType];
  if (pattern && !pattern.test(data.documentNumber)) {
    ctx.addIssue({
      code:    z.ZodIssueCode.custom,
      path:    ['documentNumber'],
      message: `Invalid ${data.documentType} number format`,
    });
  }
});

export type KycSubmitDto = z.infer<typeof KycSubmitSchema>;
