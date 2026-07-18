const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');

function alertRiskControl(reason, detail = '') {
    const c = logger.C;
    const border = c.red + '━'.repeat(50) + c.reset;
    logger.warn(`${c.red}${border}${c.reset}\n${c.bold}⚠ 风控告警 ⚠${c.reset}\n${reason}${detail ? '\n' + detail : ''}\n${c.yellow}请手动更新 cookie → npm run token${c.reset}`);
    try {
        const alertPath = path.join(__dirname, '..', 'logs', 'cookie-alert.txt');
        fs.writeFileSync(alertPath, `[${new Date().toISOString()}] 【风控告警】${reason}${detail ? ' ' + detail : ''}\n`, 'utf8');
    } catch {}
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function randomDelay(minMs, maxMs) {
    return sleep(Math.floor(Math.random() * (maxMs - minMs) + minMs));
}

function extractUserId(val) {
    if (!val) return '';
    if (typeof val === 'string') return val.replace(/@goofish$/, '');
    if (typeof val === 'number') return String(val);
    if (typeof val === 'object') {
        for (const k of ['uid', 'userId', 'id', 'senderId', '1']) {
            if (val[k]) return String(val[k]).replace(/@goofish$/, '');
        }
        if (Array.isArray(val) && val.length > 0) return String(val[0]).replace(/@goofish$/, '');
        for (const v of Object.values(val)) {
            if (typeof v === 'string' && (v.includes('@goofish') || /^\d+$/.test(v))) {
                return v.replace(/@goofish$/, '');
            }
        }
    }
    return '';
}

function extractCidFromDecoded(n) {
    if (!n) return '';
    const e = n[1];
    if (!e) return '';
    if (e[0] && typeof e[0] === 'string' && e[0].length > 5) return String(e[0]);
    if (e[2] && typeof e[2] === 'string' && e[2].length > 5) return String(e[2]);
    const extObj = e[10] || {};
    if (extObj.cid) return String(extObj.cid);
    if (extObj.conversationId) return String(extObj.conversationId);
    if (n[0] && typeof n[0] === 'string' && n[0].length > 5) return String(n[0]);
    return '';
}

function deepSearchKeywords(obj, keywords, depth = 0) {
    if (obj === null || obj === undefined || depth > 6) return null;
    if (typeof obj === 'string') {
        for (const kw of keywords) {
            if (obj.includes(kw)) return obj;
        }
        return null;
    }
    if (typeof obj === 'number' || typeof obj === 'boolean') return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const result = deepSearchKeywords(item, keywords, depth + 1);
            if (result) return result;
        }
        return null;
    }
    if (typeof obj === 'object') {
        for (const value of Object.values(obj)) {
            const result = deepSearchKeywords(value, keywords, depth + 1);
            if (result) return result;
        }
    }
    return null;
}

module.exports = {
    alertRiskControl,
    sleep,
    randomDelay,
    extractUserId,
    extractCidFromDecoded,
    deepSearchKeywords,
};
