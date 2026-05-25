import { Request } from 'express';
import { Types } from 'mongoose';

// Mongo ID
export type MongoId = Types.ObjectId | string;

// JWT Payload
export interface JwtPayload {
  vendorId: string;
  type: 'access' | 'refresh';
}

// Auth Request
export interface AuthVendorPayload {
  id: string;
  kycStatus: KycStatus;
  isOnline: boolean;
}

export interface AuthRequest extends Request {
  vendor?: AuthVendorPayload;
}

// Standard API Response
export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  code?: string;
}

// Pagination
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

// GeoJSON Point
export interface GeoPoint {
  type: 'Point';

  // [longitude, latitude]
  coordinates: [number, number];
}

// KYC Status
export type KycStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected';

// OTP Purpose
export type OtpPurpose =
  | 'register'
  | 'login'
  | 'forgot_password'
  | 'phone_verification';

// Job Status
export type JobStatus =
  | 'open'
  | 'accepted'
  | 'paid_pending_start'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'disputed';

// Dispute Status
export type DisputeStatus =
  | 'ongoing'
  | 'resolved'
  | 'lost';

// Notification Types
export type NotificationType =
  | 'job_request'
  | 'job_accepted'
  | 'job_cancelled'
  | 'payment_released'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'dispute_raised'
  | 'dispute_resolved'
  | 'new_message'
  | 'extra_charge_response';

// Days of Week
export type DayOfWeek =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

// Working Hours
export interface WorkingHourSlot {
  day: DayOfWeek;

  isWorking: boolean;

  // Example: "09:00"
  start?: string;

  // Example: "18:00"
  end?: string;

  breakStart?: string;
  breakEnd?: string;
}

// Night Shift
export interface NightShift {
  enabled: boolean;

  start?: string;
  end?: string;

  days?: DayOfWeek[];

  surcharge?: number;
}