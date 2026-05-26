import mongoose, { Document, Schema, Model } from 'mongoose';

export type DocumentType =
  | 'aadhaar'
  | 'pan'
  | 'passport'
  | 'driving_licence'
  | 'voter_id';

export type KycSubmissionStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

export interface IKyc extends Document {
  vendorId:         mongoose.Types.ObjectId;
  documentType:     DocumentType;
  documentNumber:   string;   // AES-256-GCM encrypted — never returned to client
  frontImageUrl:    string;
  backImageUrl?:    string;
  selfieUrl:        string;
  capturedLive:     boolean;
  status:           KycSubmissionStatus;
  rejectionReason?: string;
  reviewedBy?:      mongoose.Types.ObjectId;
  reviewedAt?:      Date;
  submittedAt:      Date;
  createdAt:        Date;
  updatedAt:        Date;
}

const KycSchema = new Schema<IKyc>(
  {
    vendorId:      { type: Schema.Types.ObjectId, ref: 'Vendor', required: true },
    documentType:  {
      type:     String,
      enum:     ['aadhaar', 'pan', 'passport', 'driving_licence', 'voter_id'],
      required: true,
    },
    // Encrypted — never selected by default
    documentNumber: { type: String, required: true, select: false },
    frontImageUrl:  { type: String, required: true },
    backImageUrl:   { type: String },
    selfieUrl:      { type: String, required: true },
    capturedLive:   { type: Boolean, required: true },
    status: {
      type:    String,
      enum:    ['pending', 'under_review', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: { type: String, trim: true },
    reviewedBy:      { type: Schema.Types.ObjectId, ref: 'Admin' },
    reviewedAt:      { type: Date },
    submittedAt:     { type: Date, required: true },
  },
  { timestamps: true },
);

KycSchema.index({ vendorId: 1, createdAt: -1 });
KycSchema.index({ status: 1, createdAt: -1 });

export const KycModel: Model<IKyc> =
  mongoose.model<IKyc>('Kyc', KycSchema);
