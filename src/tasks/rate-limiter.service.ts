import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TASK_QUEUE } from './constants';

export interface RateLimitConfig {
  max: number;
  duration: number; // milliseconds
}

const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  email: { max: 5, duration: 60_000 },
  report: { max: 2, duration: 60_000 },
};

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  constructor(
    @InjectQueue(TASK_QUEUE)
    private readonly taskQueue: Queue,
  ) {}

  getRateLimit(taskType: string): RateLimitConfig | null {
    return DEFAULT_RATE_LIMITS[taskType] ?? null;
  }

  async isRateLimited(taskType: string): Promise<boolean> {
    const config = this.getRateLimit(taskType);
    if (!config) return false;

    const redis = await this.taskQueue.client;
    const key = `rate_limit:${taskType}`;
    const now = Date.now();
    const windowStart = now - config.duration;

    // Remove expired entries
    await redis.zremrangebyscore(key, 0, windowStart);

    // Count current entries in window
    const count = await redis.zcard(key);

    if (count >= config.max) {
      this.logger.warn(`Rate limit reached for type "${taskType}": ${count}/${config.max} per ${config.duration}ms`);
      return true;
    }

    // Add current timestamp
    await redis.zadd(key, now, `${now}-${Math.random()}`);
    await redis.expire(key, Math.ceil(config.duration / 1000));

    return false;
  }

  async getDelayForType(taskType: string): Promise<number> {
    const config = this.getRateLimit(taskType);
    if (!config) return 0;

    const redis = await this.taskQueue.client;
    const key = `rate_limit:${taskType}`;
    const now = Date.now();
    const windowStart = now - config.duration;

    await redis.zremrangebyscore(key, 0, windowStart);
    const count = await redis.zcard(key);

    if (count >= config.max) {
      // Get oldest entry to calculate wait time
      const oldest = await redis.zrange(key, 0, 0, 'WITHSCORES');
      if (oldest.length >= 2) {
        const oldestTime = parseInt(oldest[1], 10);
        return oldestTime + config.duration - now;
      }
    }

    return 0;
  }
}
