const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 50, 2000),
});

redis.on('connect', () => console.log('[Redis] Worker connected'));
redis.on('error', (err) => console.error('[Redis] Worker error:', err.message));

module.exports = redis;
