import 'dotenv/config'; // single dotenv load — must be first
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';

import app from './app';
import { config } from './config/index';
import { logger } from './logger/index';
import { connectMongo, disconnectMongo } from './shared/database/db';
import { connectRedis, disconnectRedis } from './shared/database/redis';
import { verifyAccessToken } from './shared/utils/Token';
import { VendorModel } from './models/vendor.model';

let server: http.Server;

const bootstrap = async (): Promise<void> => {
  // ── Connect databases ──────────────────────────────────
  await connectMongo();
  await connectRedis();

  // ── Create HTTP server ─────────────────────────────────
  server = http.createServer(app);

  // ── Socket.io setup ────────────────────────────────────
  const io = new SocketIOServer(server, {
    cors: {
      origin:      config.cors.allowedOrigins.length ? config.cors.allowedOrigins : false,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── Socket.io authentication middleware ────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) return next(new Error('Unauthorized: no token'));

      const payload = verifyAccessToken(token);

      const vendor = await VendorModel.findById(payload.vendorId)
        .select('_id isActive')
        .lean();

      if (!vendor?.isActive) return next(new Error('Unauthorized: account inactive'));

      socket.data.vendorId = payload.vendorId;
      next();
    } catch {
      next(new Error('Unauthorized: invalid token'));
    }
  });

  // Attach io to app so routes can access it
  app.set('io', io);

  io.on('connection', (socket) => {
    const vendorId = socket.data.vendorId as string;
    logger.debug('Socket connected', { socketId: socket.id, vendorId });

    // Join vendor's personal room — only allowed for the authenticated vendor
    socket.on('join:vendor', (requestedVendorId: string) => {
      if (requestedVendorId !== vendorId) return; // reject mismatched room
      socket.join(`vendor:${vendorId}`);
      logger.debug('Vendor joined socket room', { vendorId });
    });

    // Join job room for real-time chat + location
    socket.on('join:job', (jobId: string) => {
      // TODO: verify vendor is a participant in this job before joining
      socket.join(`job:${jobId}`);
    });

    // Real-time location broadcast during active job
    socket.on('vendor:location', (data: { jobId: string; lat: number; lng: number }) => {
      socket.to(`job:${data.jobId}`).emit('vendor:location:update', {
        lat:       data.lat,
        lng:       data.lng,
        timestamp: new Date().toISOString(),
      });
    });

    // Real-time chat message
    socket.on('message:send', (data: { jobId: string; text: string }) => {
      socket.to(`job:${data.jobId}`).emit('message:receive', {
        senderType: 'vendor',
        vendorId,
        text:       data.text,
        timestamp:  new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      logger.debug('Socket disconnected', { socketId: socket.id, vendorId });
    });
  });

  // ── Start listening ────────────────────────────────────
  server.listen(config.port, '0.0.0.0', () => {
    logger.info('Vendor backend running', {
      port:        config.port,
      environment: config.env,
    });
  });
};

// ── Graceful shutdown ──────────────────────────────────────
const shutdown = async (signal: string): Promise<void> => {
  logger.info(`${signal} received — shutting down gracefully`);

  server?.close(async () => {
    await disconnectMongo();
    await disconnectRedis();
    logger.info('Server shut down cleanly');
    process.exit(0);
  });

  // Force exit after 10s if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT'); });

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { err });
  void shutdown('uncaughtException');
});

bootstrap().catch((err) => {
  logger.error('Failed to start server', { err });
  process.exit(1);
});
