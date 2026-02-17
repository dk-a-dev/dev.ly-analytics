const geoip = require('geoip-lite');
const UAParser = require('ua-parser-js');

const getGeoData = (ip) => {
    try {
        const geo = geoip.lookup(ip);
        if (!geo) return { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
        return {
            country: geo.country || 'Unknown',
            city: geo.city || 'Unknown',
            region: geo.region || 'Unknown'
        };
    } catch (e) {
        console.error('GeoIP Error:', e);
        return { country: 'Unknown', city: 'Unknown', region: 'Unknown' };
    }
};

const getDeviceData = (userAgent) => {
    try {
        const parser = new UAParser(userAgent);
        const result = parser.getResult();
        return {
            browser: result.browser.name || 'Unknown',
            os: result.os.name || 'Unknown',
            device: result.device.type || 'Desktop'
        };
    } catch (e) {
        console.error('UA Parser Error:', e);
        return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
    }
};

module.exports = { getGeoData, getDeviceData };