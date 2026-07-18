const logger = require('../lib/logger');
const { alertRiskControl } = require('./utils');

function createKeepAlive(getClient, getRunning) {
    const timers = [];

    async function keepCookieAlive() {
        const client = getClient();
        try {
            await client.api.mtop.home.getFeed({ pageSize: 1, pageNumber: 1 });
            logger.info(`[Cookie 保活] _m_h5_tk 已刷新`);
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('FAIL_SYS_TOKEN') || msg.includes('SESSION_EXPIRED')) {
                alertRiskControl('Cookie 保活失败，_m_h5_tk 已过期，需要重新登录', msg);
            } else {
                logger.warn(`[Cookie 保活] 请求失败（非严重）: ${msg.substring(0, 80)}`);
            }
        }
    }

    function scheduleKeepAlive() {
        const delay = 25 * 60 * 1000 + Math.floor(Math.random() * 20 * 60 * 1000);
        const timer = setTimeout(() => {
            if (getRunning()) keepCookieAlive();
            const newTimer = scheduleKeepAlive();
            timers.push(newTimer);
        }, delay);
        return timer;
    }

    function startKeepAlive() {
        const firstTimer = setTimeout(() => {
            if (getRunning()) keepCookieAlive();
            const timer = scheduleKeepAlive();
            timers.push(timer);
        }, 3 * 60 * 1000 + Math.floor(Math.random() * 5 * 60 * 1000));
        timers.push(firstTimer);
    }

    function stopAll() {
        for (const t of timers) {
            clearTimeout(t);
        }
        timers.length = 0;
    }

    return {
        startKeepAlive,
        stopAll,
    };
}

module.exports = { createKeepAlive };
