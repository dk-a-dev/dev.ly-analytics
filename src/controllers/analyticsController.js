const db = require('../config/db');
const { getGeoData, getDeviceData } = require('../utils/enrich');
const jwt = require('jsonwebtoken');

// Log Analytics
exports.logClick = async (req, res) => {
    const { url_id, ip_address, user_agent, referrer } = req.body;

    if (!url_id) return res.status(400).json({ error: 'url_id required' });

    try {
        const enrichedGeo = getGeoData(ip_address || req.ip);
        const enrichedDevice = getDeviceData(user_agent || req.headers['user-agent']);

        console.log("--- Analytics Ingest ---");
        console.log("URL ID:", url_id);
        console.log("IP:", ip_address || req.ip);
        console.log("User Agent:", user_agent || req.headers['user-agent']);
        console.log("Enriched Geo:", enrichedGeo);
        console.log("Enriched Device:", enrichedDevice);
        console.log("------------------------");

        await db.query(`
            INSERT INTO url_analytics 
            (url_id, ip_address, user_agent, referrer, country, city, browser, os, device_type) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [
            url_id,
            ip_address,
            user_agent,
            referrer,
            enrichedGeo.country,
            enrichedGeo.city,
            enrichedDevice.browser,
            enrichedDevice.os,
            enrichedDevice.device
        ]);

        res.sendStatus(201);
    } catch (err) {
        console.error('Analytics Ingest Error:', err);
        res.status(500).json({ error: 'Failed to ingest analytics' });
    }
};

// Retrieve Analytics
exports.getStats = async (req, res) => {
    const { id } = req.params; // url_id

    try {
        const stats = await db.query(`
            SELECT 
                COUNT(*) as total_clicks,
                COUNT(DISTINCT ip_address) as unique_visitors
            FROM url_analytics 
            WHERE url_id = $1
        `, [id]);

        const timeSeries = await db.query(`
            SELECT 
                date_trunc('hour', visited_at) as time_bucket,
                COUNT(*) as count
            FROM url_analytics
            WHERE url_id = $1
            GROUP BY time_bucket
            ORDER BY time_bucket DESC
            LIMIT 24
        `, [id]);

        const geoStats = await db.query(`
            SELECT country, COUNT(*) as count 
            FROM url_analytics 
            WHERE url_id = $1 
            GROUP BY country 
            ORDER BY count DESC
            LIMIT 10
        `, [id]);

        const deviceStats = await db.query(`
             SELECT device_type, COUNT(*) as count
             FROM url_analytics
             WHERE url_id = $1
             GROUP BY device_type
             ORDER BY count DESC
        `, [id]);

        const osStats = await db.query(`
             SELECT os, COUNT(*) as count
             FROM url_analytics
             WHERE url_id = $1
             GROUP BY os
             ORDER BY count DESC
        `, [id]);

        res.json({
            summary: stats.rows[0],
            timeSeries: timeSeries.rows,
            geo: geoStats.rows,
            devices: deviceStats.rows,
            os: osStats.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error retrieving stats' });
    }
};

// Get User Stats
exports.getUserStats = async (req, res) => {
    const userId = req.user.id;
    try {
        // Total Clicks
        const totalClicksResult = await db.query(
            `SELECT COUNT(*) FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1`,
            [userId]
        );

        // Clicks over time (last 7 days)
        const clicksOverTimeResult = await db.query(
            `SELECT DATE(visited_at) as date, COUNT(*) as count
             FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1 AND visited_at > NOW() - INTERVAL '7 days'
             GROUP BY DATE(visited_at)
             ORDER BY DATE(visited_at)`,
            [userId]
        );

        // Top Referrers
        const topReferrersResult = await db.query(
            `SELECT referrer, COUNT(*) as count
             FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1
             GROUP BY referrer
             ORDER BY count DESC
             LIMIT 5`,
            [userId]
        );

        // Growth Calculation (Last 7 days vs Previous 7 days)
        const currentPeriodClicksResult = await db.query(
            `SELECT COUNT(*) FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1 AND visited_at > NOW() - INTERVAL '7 days'`,
            [userId]
        );

        const previousPeriodClicksResult = await db.query(
            `SELECT COUNT(*) FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1 AND visited_at <= NOW() - INTERVAL '7 days' AND visited_at > NOW() - INTERVAL '14 days'`,
            [userId]
        );

        const currentClicks = parseInt(currentPeriodClicksResult.rows[0].count);
        const previousClicks = parseInt(previousPeriodClicksResult.rows[0].count);

        let growth = 0;
        if (previousClicks > 0) {
            growth = ((currentClicks - previousClicks) / previousClicks) * 100;
        } else if (currentClicks > 0) {
            growth = 100;
        }

        // Device Stats
        const deviceStatsResult = await db.query(
            `SELECT device_type, COUNT(*) as count
             FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1
             GROUP BY device_type
             ORDER BY count DESC
             LIMIT 5`,
            [userId]
        );

        // OS Stats
        const osStatsResult = await db.query(
            `SELECT os, COUNT(*) as count
             FROM url_analytics ia
             JOIN urls u ON ia.url_id = u.id
             WHERE u.user_id = $1
             GROUP BY os
             ORDER BY count DESC
             LIMIT 5`,
            [userId]
        );

        res.json({
            totalClicks: parseInt(totalClicksResult.rows[0].count),
            clicksOverTime: clicksOverTimeResult.rows,
            topReferrers: topReferrersResult.rows,
            growth: parseFloat(growth.toFixed(1)),
            devices: deviceStatsResult.rows,
            os: osStatsResult.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
};
// Get Time Series
exports.getUrlTimeSeries = async (req, res) => {
    const userId = req.user.id;
    try {
        const result = await db.query(`
            SELECT 
                ia.url_id,
                DATE(ia.visited_at) as date,
                COUNT(*) as count
            FROM url_analytics ia
            JOIN urls u ON ia.url_id = u.id
            WHERE u.user_id = $1 
              AND ia.visited_at > NOW() - INTERVAL '7 days'
            GROUP BY ia.url_id, DATE(ia.visited_at)
            ORDER BY DATE(ia.visited_at) ASC
        `, [userId]);

        const data = {};
        result.rows.forEach(row => {
            if (!data[row.url_id]) data[row.url_id] = [];
            data[row.url_id].push({
                date: row.date.toISOString().split('T')[0],
                count: parseInt(row.count)
            });
        });

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error retrieving time series' });
    }
};
