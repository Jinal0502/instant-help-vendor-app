import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import mongoSanitize from '@exortek/express-mongo-sanitize';
import hpp from 'hpp';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'crypto';

import { config } from './config/index';
import { morganStream } from './logger/index';
import { errorHandler, notFoundHandler } from './shared/middlewares/errorHandlers';

// ── Route imports ──────────────────────────────────────────
import authRoutes        from './modules/auth/auth.routes';
import onboardingRoutes  from './modules/onboarding/onboarding.routes';
import kycRoutes         from './modules/kyc/kyc.routes';

const app: Application = express();

app.set('trust proxy', 1);

// ── Request ID — attach before anything else ───────────────
app.use((req, _res, next) => {
  (req as express.Request & { requestId: string }).requestId = randomUUID();
  next();
});

// ── Security middleware ────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin:         config.cors.allowedOrigins.length ? config.cors.allowedOrigins : false,
  credentials:    true,
  methods:        ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-FCM-Token'],
}));

// ── Rate limiting — before parsing/compression ─────────────
app.use(rateLimit({
  windowMs:        config.rateLimit.windowMs,
  max:             config.rateLimit.max,
  message:         { success: false, message: 'Too many requests. Please try again later.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders:   false,
}));

// ── Stricter rate limit for auth endpoints ─────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max:      20,
  message:  { success: false, message: 'Too many auth attempts. Try again in 15 minutes.', code: 'RATE_LIMITED' },
  standardHeaders: true,
  legacyHeaders:   false,
});

// ── Request parsing ────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ── Compression — after rate limiting, before routes ──────
app.use(compression());

// ── Data sanitisation ──────────────────────────────────────
app.use(
  mongoSanitize({
    replaceWith: '_',
  }),
);   // prevent NoSQL injection
app.use(hpp());            // prevent HTTP parameter pollution

// ── Logging ────────────────────────────────────────────────
app.use(morgan(config.isDev ? 'dev' : 'short', { stream: morganStream }));

// ── Health check ───────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ─────────────────────────────────────────────
app.use('/api/v1/auth',              authLimiter, authRoutes);
app.use('/api/v1/vendor/onboarding', onboardingRoutes);
app.use('/api/v1/vendor/kyc',        kycRoutes);
app.use('/api/v1/vendor/me',         kycRoutes);
// app.use('/api/v1/jobs',          jobRoutes);
// app.use('/api/v1/payments',      paymentRoutes);
// app.use('/api/v1/notifications', notificationRoutes);
// app.use('/api/v1/reviews',       reviewRoutes);
// app.use('/api/v1/disputes',      disputeRoutes);
// app.use('/api/v1/chat',          chatRoutes);
// app.use('/api/v1/services',      serviceCatalogueRoutes);

// ── 404 + error handlers ───────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
