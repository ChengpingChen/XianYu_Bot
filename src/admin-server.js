const http = require('http');
const path = require('path');
const fs = require('fs');
const logger = require('../lib/logger');
const { CONFIG } = require('./config');

const MAX_BODY_SIZE = 1024 * 100;

function startAdminServer(getRunning, getConversationMap, getProductCache, getRiskCount, getClient) {
    const server = http.createServer((req, res) => {
        res.setHeader('Access-Control-Allow-Origin', process.env.ADMIN_CORS_ORIGIN || 'http://localhost');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(200);
            res.end();
            return;
        }

        const url = new URL(req.url, `http://127.0.0.1:${CONFIG.adminPort}`);

        if (CONFIG.adminToken) {
            const auth = req.headers['authorization'] || '';
            if (auth !== `Bearer ${CONFIG.adminToken}` && url.searchParams.get('token') !== CONFIG.adminToken) {
                res.writeHead(401);
                res.end(JSON.stringify({ error: 'unauthorized' }));
                return;
            }
        }

        if (req.method === 'GET' && url.pathname === '/status') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                running: getRunning(),
                conversations: getConversationMap().size,
                products: getProductCache().size,
                riskCount: getRiskCount(),
                selfName: CONFIG.selfName || '(未知)',
                selfUid: CONFIG.selfUid || '(未知)',
                cookieOk: CONFIG.cookie.length > 20,
                aiKeyOk: CONFIG.aiKey.length > 0,
                lastStart: new Date().toISOString(),
            }, null, 2));
            return;
        }

        if (req.method === 'POST' && url.pathname === '/cookie') {
            let body = '';
            let bodySize = 0;
            req.on('data', chunk => {
                bodySize += chunk.length;
                if (bodySize > MAX_BODY_SIZE) {
                    res.writeHead(413);
                    res.end(JSON.stringify({ error: '请求体过大' }));
                    req.destroy();
                    return;
                }
                body += chunk;
            });
            req.on('end', () => {
                if (res.headersSent) return;
                try {
                    const input = JSON.parse(body);
                    const newCookie = input.cookie || input.COOKIE || '';
                    if (!newCookie || newCookie.length < 50) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Cookie 太短，无效' }));
                        return;
                    }
                    const envPath = path.join(__dirname, '..', '.env');
                    let envContent = fs.readFileSync(envPath, 'utf8');
                    envContent = envContent.replace(
                        /^GOOFISH_COOKIE=.*$/m,
                        `GOOFISH_COOKIE=${newCookie}`
                    );
                    fs.writeFileSync(envPath, envContent, 'utf8');
                    CONFIG.cookie = newCookie;
                    process.env.GOOFISH_COOKIE = newCookie;
                    const client = getClient();
                    if (client) {
                        client.updateCookieMtop(newCookie);
                        client.updateCookiePassport(newCookie);
                    }
                    logger.info(`[管理接口] Cookie 已通过 HTTP 更新，长度=${newCookie.length}`);
                    res.writeHead(200);
                    res.end(JSON.stringify({ ok: true, cookieLen: newCookie.length }));
                } catch (e) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        if (req.method === 'GET' && url.pathname === '/health') {
            res.writeHead(200);
            res.end('OK');
            return;
        }

        res.writeHead(404);
        res.end(JSON.stringify({ error: 'not found' }));
    });

    server.listen(CONFIG.adminPort, '127.0.0.1', () => {
        logger.info(`[管理接口] 监听 127.0.0.1:${CONFIG.adminPort}`);
        if (!CONFIG.adminToken) {
            logger.warn(`[管理接口] ⚠️ 未设置 ADMIN_TOKEN，建议在 .env 中配置`);
        }
    });

    return server;
}

module.exports = { startAdminServer };
