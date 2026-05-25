import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { config } from '../config/index';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// ── Custom log format for development ──────────────────────
const devFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaStr = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : '';
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`;
});

// ── Transports ────────────────────────────────────────────
const consoleTransport = new winston.transports.Console({
  format: combine(
    colorize({ all: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    devFormat,
  ),
});

const errorFileTransport = new DailyRotateFile({
  filename:    'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level:       'error',
  maxFiles:    '30d',
  maxSize:     '20m',
  format: combine(timestamp(), errors({ zstack: true }), json()),
});

const combinedFileTransport = new DailyRotateFile({
  filename:    'logs/combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxFiles:    '14d',
  maxSize:     '20m',
  format: combine(timestamp(), errors({ stack: true }), json()),
});

// ── Logger instance ────────────────────────────────────────
export const logger = winston.createLogger({
  level: config.isDev ? 'debug' : 'info',
  transports: [
    consoleTransport,
    errorFileTransport,
    combinedFileTransport,
  ],
  // Catch uncaught exceptions and unhandled rejections
  exceptionHandlers: [
    new DailyRotateFile({
      filename:    'logs/exceptions-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '30d',
    }),
  ],
  rejectionHandlers: [
    new DailyRotateFile({
      filename:    'logs/rejections-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles:    '30d',
    }),
  ],
  exitOnError: false,
});

// ── Helper: log incoming request (used in morgan stream) ───
export const morganStream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};
