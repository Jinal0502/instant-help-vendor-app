import { createClient, RedisClientType } from 'redis';
import { config } from '../../config/index';
import { logger } from '../../logger/index';

let redisClient: RedisClientType;

export const connectRedis = async (): Promise<RedisClientType> => {
  redisClient = createClient({ url: config.redis.url }) as RedisClientType;

  redisClient.on('connect',    () => logger.info('Redis connected'));
  redisClient.on('disconnect', () => logger.warn('Redis disconnected'));
  redisClient.on('error',      (err) => logger.error('Redis error', { err }));

  await redisClient.connect();
  return redisClient;
};

export const getRedis = (): RedisClientType => {
  if (!redisClient) throw new Error('Redis not initialised. Call connectRedis() first.');
  return redisClient;
};

export const disconnectRedis = async (): Promise<void> => {
  await redisClient?.quit();
  logger.info('Redis disconnected gracefully');
};
