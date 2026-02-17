const { Worker } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const db = require('../config/db');
const { getGeoData, getDeviceData } = require('../utils/enrich');

const DEDUP_WINDOW = 10;

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});

const worker = new Worker('click-events', async (job) => {
    const { url_id, ip_address, user_agent, referrer, utm_source, utm_medium, utm_campaign, timestamp } = job.data;

    console.log(`[Worker] Processing click for url_id=${url_id}`);

    // Enrich with geo and device data
    const geo = getGeoData(ip_address);
    const device = getDeviceData(user_agent);

    const dedupKey = `dedup:${url_id}:${ip_address}`;
    const exists = await connection.get(dedupKey);
    const isUnique = !exists;

    if (isUnique) {
        await connection.set(dedupKey, '1', 'EX', DEDUP_WINDOW);
    }

    // Insert into database
    await db.query(
        `INSERT INTO url_analytics 
     (url_id, ip_address, user_agent, referrer, country, city, browser, os, device_type, 
      utm_source, utm_medium, utm_campaign, is_unique, visited_at) 
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
            url_id,
            ip_address,
            user_agent,
            referrer,
            geo.country,
            geo.city,
            device.browser,
            device.os,
            device.device,
            utm_source || null,
            utm_medium || null,
            utm_campaign || null,
            isUnique,
            new Date(timestamp),
        ]
    );

    console.log(`[Worker] Stored click: url_id=${url_id} unique=${isUnique} device=${device.device} os=${device.os}`);
}, {
    connection,
    concurrency: 10,
});

worker.on('completed', (job) => {
    pass
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
});

console.log('[Worker] Click event worker started — waiting for jobs...');
