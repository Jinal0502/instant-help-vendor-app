// dotenv is loaded once in server.ts via `import 'dotenv/config'`
// This file only reads process.env — never calls dotenv.config() itself.

const get = (key: string): string | undefined => process.env[key];

const required = (key: string): string => {
  const val = get(key);
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
};

// ── Validate all required vars up-front ───────────────────
const REQUIRED_VARS = [
  'MONGODB_URI',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  // Twilio disabled — SMS OTP replaced with email OTP
  // TODO: restore when SMS is re-enabled
  // 'TWILIO_ACCOUNT_SID',
  // 'TWILIO_AUTH_TOKEN',
  // 'TWILIO_VERIFY_SERVICE_SID',
  'BREVO_API_KEY',
  'MAIL_FROM',
  'ENCRYPTION_KEY',
  'GOOGLE_CLIENT_ID_IOS',
  'GOOGLE_CLIENT_ID_ANDROID',
  'GOOGLE_CLIENT_ID',
];

const missing = REQUIRED_VARS.filter(k => !process.env[k]);
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

export const config = {
  env:    get('NODE_ENV') || 'development',
  port:   parseInt(get('PORT') || '3002', 10),
  isDev:  get('NODE_ENV') === 'development',
  isProd: get('NODE_ENV') === 'production',

  mongo: {
    uri: required('MONGODB_URI'),
  },

  redis: {
    url: required('REDIS_URL'),
  },

  jwt: {
    accessSecret:     required('JWT_ACCESS_SECRET'),
    refreshSecret:    required('JWT_REFRESH_SECRET'),
    accessExpiresIn:  get('JWT_ACCESS_EXPIRES_IN')  || '15m',
    refreshExpiresIn: get('JWT_REFRESH_EXPIRES_IN') || '30d',
  },

  otp: {
    expirySeconds:       parseInt(get('OTP_EXPIRY_SECONDS')        || '600', 10),
    resendLimit:         parseInt(get('OTP_RESEND_LIMIT')           || '3',   10),
    resendWindowSeconds: parseInt(get('OTP_RESEND_WINDOW_SECONDS')  || '60', 10),
  },

//   cloudinary: {
//     cloudName: required('CLOUDINARY_CLOUD_NAME'),
//     apiKey:    required('CLOUDINARY_API_KEY'),
//     apiSecret: required('CLOUDINARY_API_SECRET'),
//   },

  // Twilio — disabled while SMS OTP is replaced with email OTP
  // TODO: restore when SMS is re-enabled
  // twilio: {
  //   accountSid:       required('TWILIO_ACCOUNT_SID'),
  //   authToken:        required('TWILIO_AUTH_TOKEN'),
  //   verifyServiceSid: required('TWILIO_VERIFY_SERVICE_SID'),
  // },

  cloudinary: {
    cloudName: required('CLOUDINARY_CLOUD_NAME'),
    apiKey:    required('CLOUDINARY_API_KEY'),
    apiSecret: required('CLOUDINARY_API_SECRET'),
  },

//   firebase: {
//     projectId:   required('FIREBASE_PROJECT_ID'),
//     privateKey:  required('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
//     clientEmail: required('FIREBASE_CLIENT_EMAIL'),
//   },

  email: {
    apiKey:       required('BREVO_API_KEY'),
    mailFrom:     required('MAIL_FROM'),
    mailFromName: get('MAIL_FROM_NAME') || 'Instant Help Support',
  },

  encryption: {
    key: required('ENCRYPTION_KEY'),
  },

  rateLimit: {
    windowMs: parseInt(get('RATE_LIMIT_WINDOW_MS') || '900000', 10),
    max:      parseInt(get('RATE_LIMIT_MAX')        || '100',   10),
  },

  cors: {
    // Trim each origin, filter empty strings
    allowedOrigins: (get('ALLOWED_ORIGINS') || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean),
  },
    google: {
    iosClientId:     required('GOOGLE_CLIENT_ID_IOS'),
    androidClientId: required('GOOGLE_CLIENT_ID_ANDROID'),
    clientId:     required('GOOGLE_CLIENT_ID'),
  },
} as const;
