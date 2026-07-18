require('dotenv').config();

const logger = require('./lib/logger');
const { Goofish, LogLevel } = require('goofish-client');
const { CONFIG, WS_URL } = require('./src/config');
const { alertRiskControl } = require('./src/utils');
const { createProductDb } = require('./src/product-db');
const { createMessageHandler } = require('./src/message-handler');
const { createKeepAlive } = require('./src/keepalive');
const { startAdminServer } = require('./src/admin-server');
const { setupListeners } = require('./src/listeners');

let client = null;
let running = true;

const productDb = createProductDb(() => client);
const msgHandler = createMessageHandler(productDb, null, () => client);
const keepAlive = createKeepAlive(() => client, () => running);

async function main() {
    logger.info(`${logger.C.bold}╔══════════════════════════════════════╗${logger.C.reset}`);
    logger.info(`${logger.C.bold}║   闲鱼自动回复 Bot 启动 v2.1.0    ║${logger.C.reset}`);
    logger.info(`${logger.C.bold}╚══════════════════════════════════════╝${logger.C.reset}`);

    if (!CONFIG.cookie || CONFIG.cookie.length < 20) {
        logger.error('Cookie 未配置，请在 .env 中填写 GOOFISH_COOKIE 或 MH5_TK / CNA / UNB / TRACKNICK');
        process.exit(1);
    }

    logger.info(`DeepSeek Key: ${CONFIG.aiKey ? '已配置' : '未配置'}`);

    productDb.loadProducts();

    if (productDb.hasEmptyKeys()) {
        logger.info(`${logger.C.yellow}检测到 products.json 中存在空 key 商品，启动后将自动搜索匹配${logger.C.reset}`);
    }

    client = new Goofish({
        cookie: CONFIG.cookie,
        level: LogLevel.WARN,
        im: {
            wsUrl: WS_URL,
            autoReconnect: true,
            heartbeatInterval: 10000,
            maxReconnectAttempts: 10,
        },
    });

    try {
        const head = await client.api.mtop.user.getUserHead({ self: true });
        const base = head.data?.baseInfo;
        const mod = head.data?.module;
        if (base) {
            CONFIG.selfUid = base.kcUserId || base.userId || process.env.UNB;
            CONFIG.selfName = mod?.base?.displayName || base.nick || '';
            logger.info(`当前账号: ${CONFIG.selfName} (UID: ${CONFIG.selfUid})`);
        }
    } catch (e) {
        logger.warn(`获取用户信息失败: ${e.message}，使用 UNB 作为 UID`);
        CONFIG.selfUid = process.env.UNB;
    }

    logger.info('正在获取 IM Token...');
    let imToken;
    try {
        const tokenRes = await client.api.mtop.im.getLoginToken();
        imToken = tokenRes.data?.accessToken;
        if (!imToken) {
            logger.error('获取 IM Token 失败: ' + JSON.stringify(tokenRes).substring(0, 200));
            process.exit(1);
        }
        logger.info('IM Token 获取成功');
    } catch (e) {
        logger.error(`获取 IM Token 失败: ${e.message}`);
        logger.error('Cookie 可能已过期或被风控。请手动更新 Cookie 后重启');
        process.exit(1);
    }

    client.wsClientIm.on('close', ({ code, reason }) => {
        if (code !== 1000 && code !== 1001) {
            msgHandler.incrementRiskCount();
            if (msgHandler.getRiskCount() >= 3) {
                alertRiskControl('WebSocket 频繁断开，可能已触发风控', `code=${code} reason=${reason}`);
            }
        }
    });

    client.wsClientIm.on('error', (err) => {
        if (err && (err.message?.includes('403') || err.message?.includes('401') || err.message?.includes('auth'))) {
            alertRiskControl('WebSocket 认证失败，Cookie 可能已过期或被风控拦截', err.message);
        }
    });

    logger.info('正在连接 WebSocket...');
    try {
        await client.wsClientIm.connect();
        logger.info('WebSocket 已连接');
    } catch (e) {
        logger.error(`WebSocket 连接失败: ${e.message}`);
        process.exit(1);
    }

    logger.info(`${logger.C.cyan}━━━ 设置消息监听 ━━━${logger.C.reset}`);
    setupListeners(client, msgHandler);

    if (imToken) {
        logger.info('正在注册 IM 服务...');
        try {
            await client.api.im.auth.register({ token: imToken });
            logger.info('IM 注册成功');
        } catch (e) {
            logger.error(`IM 注册失败: ${e.message}`);
            logger.info('Bot 已退出，请更新 Cookie 后重新启动');
            process.exit(1);
        }
    } else {
        logger.info('无 IM Token，跳过 WebSocket 连接（Cookie 过期或获取失败）');
    }

    if (productDb.hasEmptyKeys() && CONFIG.selfUid) {
        const fixed = await productDb.autoFixEmptyKeys(CONFIG.selfUid);
        if (fixed > 0) {
            productDb.loadProducts();
            logger.info(`${logger.C.green}自动修复完成，重新加载产品知识库${logger.C.reset}`);
        }
    }

    await msgHandler.refreshConversations();

    const conversationMap = msgHandler.getConversationMap();
    await productDb.scanAndRegisterAllConversations(conversationMap);

    await msgHandler.catchUpUnread();

    const refreshTimer = setInterval(() => {
        if (!running) return;
        msgHandler.refreshConversations().then(() => {
            const convMap = msgHandler.getConversationMap();
            productDb.scanAndRegisterAllConversations(convMap);
        });
    }, 15 * 60 * 1000);

    const riskResetTimer = setInterval(() => {
        if (msgHandler.getRiskCount() > 0) {
            logger.info(`风控计数器重置（之前: ${msgHandler.getRiskCount()}）`);
            msgHandler.resetRiskCount();
        }
    }, 60 * 60 * 1000);

    keepAlive.startKeepAlive();

    logger.info(`${logger.C.green}━━━ 开始监听消息 ━━━${logger.C.reset}`);

    const adminServer = startAdminServer(
        () => running,
        () => msgHandler.getConversationMap(),
        () => productDb.getCache(),
        () => msgHandler.getRiskCount(),
        () => client
    );

    setupShutdown(refreshTimer, riskResetTimer, adminServer);
}

function setupShutdown(refreshTimer, riskResetTimer, adminServer) {
    function shutdown(signal) {
        logger.info(`收到 ${signal}，正在退出...`);
        running = false;

        clearInterval(refreshTimer);
        clearInterval(riskResetTimer);
        keepAlive.stopAll();

        if (adminServer) {
            adminServer.close();
        }

        if (client?.wsClientIm) {
            try {
                client.wsClientIm.disconnect();
                logger.info('WebSocket 已断开');
            } catch { /* WebSocket already closed */ }
        }

        setTimeout(() => {
            logger.info(`${logger.C.dim}Bot 已停止${logger.C.reset}`);
            process.exit(0);
        }, 500);
    }

    process.on('SIGINT',  () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('uncaughtException', (e) => {
    logger.error(`未捕获异常: ${e.stack || e.message}`);
});

process.on('unhandledRejection', (e) => {
    logger.error(`未处理的 Promise 拒绝: ${e?.message || e}`);
});

main().catch(e => {
    logger.error(`启动失败: ${e.message}`);
    process.exit(1);
});
