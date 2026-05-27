import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { KycStatus, WorkingHourSlot, NightShift, GeoPoint } from '../types/index';

// ── Auth provider type ─────────────────────────────────────
export type AuthProvider = 'local' | 'google' | 'both';

// ── Interface ──────────────────────────────────────────────
export interface IVendor extends Document {
  // Basic auth
  username: string;
  name:     string;
  email:    string;
  phone:    string;
  // password is optional — Google-only accounts have no password
  password?: string;

  // Auth provider
  authProvider: AuthProvider;
  googleId?:    string;

  isPhoneVerified: boolean;
  isEmailVerified: boolean;
  isActive:        boolean;

  // KYC
  kycStatus:           KycStatus;
  kycRejectionReason?: string;

  // Profile
  avatar?:      string;
  bio?:         string;
  dateOfBirth?: Date;
  gender?:      'male' | 'female' | 'other';

  // Address
  address: {
    street:  string;
    city:    string;
    state:   string;
    pincode: string;
  };

  // Location
  location?:      GeoPoint;
  baseLocation?:  GeoPoint;
  hasSetLocation: boolean;

  useLiveLocation: boolean;
  serviceRadius:   number;
  isOnline:        boolean;

  // Services
  categories: mongoose.Types.ObjectId[];
  niches:     string[];

  // Business profile
  businessProfile: {
    businessName:     string;
    tagline?:         string;
    type:             'individual' | 'small_team';
    logoUrl?:         string;
    yearsInBusiness?: number;
    pricing?:         number;
    workingStart?:    string;  // "HH:MM"
    workingEnd?:      string;  // "HH:MM"
  };

  // Availability
  workingHours: WorkingHourSlot[];
  nightShift:   NightShift;

  // Stats
  rating:               number;
  totalRatings:         number;
  totalJobsDone:        number;
  completionRate:       number;
  onboardingCompleted:  boolean;

  // Tokens (select: false — never returned by default)
  refreshTokens: string[];
  fcmTokens:     string[];

  createdAt: Date;
  updatedAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

// ── Working Hours Schema ───────────────────────────────────
const WorkingHourSchema = new Schema<WorkingHourSlot>(
  {
    day: {
      type:     String,
      enum:     ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
      required: true,
    },
    isWorking:  { type: Boolean, default: false },
    start:      { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end:        { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    breakStart: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    breakEnd:   { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  },
  { _id: false },
);

// ── Night Shift Schema ─────────────────────────────────────
const NightShiftSchema = new Schema<NightShift>(
  {
    enabled:  { type: Boolean, default: false },
    start:    { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    end:      { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    days: [{
      type: String,
      enum: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    }],
    surcharge: { type: Number, default: 0 },
  },
  { _id: false },
);

// ── Geo Point Schema ───────────────────────────────────────
const GeoPointSchema = new Schema(
  {
    type:        { type: String, enum: ['Point'], default: 'Point' },
    coordinates: {
      type:     [Number],
      required: true,
      validate: {
        validator: (v: number[]) => v.length === 2,
        message:   'Coordinates must contain [longitude, latitude]',
      },
    },
  },
  { _id: false },
);

// ── Vendor Schema ──────────────────────────────────────────
const VendorSchema = new Schema<IVendor>(
  {
    // Basic Auth
    username:     { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^[a-z0-9_]+$/ },
    name:         { type: String, trim: true, default: '' },
    email:        { type: String, required: true, unique: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
    phone:        { type: String, required: true, unique: true, trim: true },
    // password is optional — Google-only vendors won't have one
    password:     { type: String, select: false },

    // Auth provider
    authProvider: {
      type:    String,
      enum:    ['local', 'google', 'both'],
      default: 'local',
    },
    // sparse: true — only indexes documents where googleId exists
    googleId: { type: String, sparse: true, unique: true },

    isPhoneVerified: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    isActive:        { type: Boolean, default: true },

    // KYC
    kycStatus:          { type: String, enum: ['pending','under_review','approved','rejected'], default: 'pending' },
    kycRejectionReason: { type: String, trim: true },

    // Profile
    avatar:      { type: String },
    bio:         { type: String, trim: true, maxlength: 500 },
    dateOfBirth: { type: Date },
    gender:      { type: String, enum: ['male','female','other'] },

    // Address
    address: {
      street:  { type: String, trim: true, default: '' },
      city:    { type: String, trim: true, default: '' },
      state:   { type: String, trim: true, default: '' },
      pincode: { type: String, trim: true, default: '' },
    },

    // Location — optional at creation
    location:       { type: GeoPointSchema, default: undefined },
    baseLocation:   { type: GeoPointSchema, default: undefined },
    hasSetLocation: { type: Boolean, default: false },

    useLiveLocation: { type: Boolean, default: false },
    serviceRadius:   { type: Number, default: 5, min: 1 },
    isOnline:        { type: Boolean, default: false },

    // Services
    categories: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
    niches:     { type: [String], default: [] },

    // Business Profile
    businessProfile: {
      businessName:    { type: String, trim: true, default: '' },
      tagline:         { type: String, trim: true },
      type:            { type: String, enum: ['individual','small_team'], default: 'individual' },
      logoUrl:         { type: String },
      yearsInBusiness: { type: Number },
      pricing:         { type: Number },
      workingStart:    { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
      workingEnd:      { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    },

    // Availability
    workingHours: { type: [WorkingHourSchema], default: [] },
    nightShift:   { type: NightShiftSchema, default: () => ({ enabled: false }) },

    // Stats
    rating:              { type: Number, default: 0, min: 0, max: 5 },
    totalRatings:        { type: Number, default: 0 },
    totalJobsDone:       { type: Number, default: 0 },
    completionRate:      { type: Number, default: 0 },
    onboardingCompleted: { type: Boolean, default: false },

    // Tokens — never returned by default
    refreshTokens: { type: [String], default: [], select: false },
    fcmTokens:     { type: [String], default: [], select: false },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { password, refreshTokens, fcmTokens, __v, ...cleaned } = ret;
        return cleaned;
      },
    },
  },
);

// ── Virtuals ───────────────────────────────────────────────
VendorSchema.virtual('id').get(function () {
  return this._id.toHexString();
});

// ── Indexes ────────────────────────────────────────────────
VendorSchema.index({ location: '2dsphere' }, { sparse: true });
VendorSchema.index({ baseLocation: '2dsphere' }, { sparse: true });
VendorSchema.index({ kycStatus: 1, isOnline: 1, isActive: 1, hasSetLocation: 1 });
VendorSchema.index({ kycStatus: 1, createdAt: -1 });
VendorSchema.index({ isActive: 1, createdAt: -1 });
// googleId sparse unique index is declared inline on the field above

// ── Password Hashing ───────────────────────────────────────
VendorSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// ── Compare Password ───────────────────────────────────────
VendorSchema.methods.comparePassword = async function (candidate: string): Promise<boolean> {
  if (!this.password) return false; // Google-only account — no password set
  return bcrypt.compare(candidate, this.password);
};

// ── Export ─────────────────────────────────────────────────
export const VendorModel: Model<IVendor> = mongoose.model<IVendor>('Vendor', VendorSchema);
