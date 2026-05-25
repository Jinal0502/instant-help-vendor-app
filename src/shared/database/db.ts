import mongoose from 'mongoose';
import { config } from '../../config/index';
import { logger } from '../../logger/index';

export const connectMongo = async (): Promise<void> => {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected',    () => logger.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('error',        (err) => logger.error('MongoDB error', { err }));

  await mongoose.connect(config.mongo.uri, {
    maxPoolSize:      10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS:  45000,
  });
};

export const disconnectMongo = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully');
};
