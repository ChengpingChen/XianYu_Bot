const leveldown = require('leveldown');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

const DB_DIR = path.join(
    process.env.APPDATA || '',
    'goofish-im', 'Partitions', '1620192888750150', 'Local Storage', 'leveldb'
);

/**
 * 从闲鱼桌面 App 的 LevelDB 中提取 access_token
 * @returns {Promise<string|null>}
 */
function extractToken() {
    return new Promise((resolve) => {
        if (!fs.existsSync(DB_DIR)) {
            logger.error('闲鱼 LevelDB 目录不存在: ' + DB_DIR);
            logger.error('请确认闲鱼桌面客户端已安装且登录过');
            resolve(null);
            return;
        }

        const db = leveldown(DB_DIR);
        db.open({ readOnly: true }, (err) => {
            if (err) {
                logger.error('打开 LevelDB 失败: ' + err.message);
                resolve(null);
                return;
            }

            const iter = db.iterator();
            let found = null;

            (function next() {
                iter.next((e, k, v) => {
                    if (e || !k) {
                        db.close(() => {});
                        if (found) {
                            logger.info('从 LevelDB 提取 access_token 成功');
                        } else {
                            logger.warn('未在 LevelDB 中找到 access_token');
                        }
                        resolve(found);
                        return;
                    }

                    const key = k.toString();
                    if (key.includes('access_token')) {
                        const val = v.toString();
                        // LevelDB 存储的 value 可能是 JSON 或纯文本
                        try {
                            const parsed = JSON.parse(val);
                            if (typeof parsed === 'string') found = parsed;
                            else if (parsed.access_token) found = parsed.access_token;
                            else if (parsed.token) found = parsed.token;
                            else found = val;
                        } catch {
                            found = val;
                        }
                    }
                    next();
                });
            })();
        });
    });
}

/**
 * 解码 JWT payload（不验证签名），检查过期时间
 * @param {string} token
 * @returns {{exp:number, iat:number, name:string, uid:number}|null}
 */
function decodeJwt(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        return payload;
    } catch {
        return null;
    }
}

/**
 * 检查 token 是否已过期或即将过期（提前 5 分钟判定）
 * @param {string} token
 * @returns {boolean} true 表示已过期/即将过期
 */
function isTokenExpired(token) {
    const payload = decodeJwt(token);
    if (!payload || !payload.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return now >= payload.exp - 300;
}

/**
 * 获取有效的 access_token：
 * 1. 优先使用环境变量中的 token
 * 2. 若过期则从 LevelDB 重新提取
 * 3. 提取成功后写回 .env 文件
 * @returns {Promise<string|null>}
 */
async function getValidToken() {
    const token = process.env.ACCESS_TOKEN || '';

    if (token && !isTokenExpired(token)) {
        return token;
    }

    if (token) {
        logger.warn('access_token 已过期或即将过期，尝试从闲鱼客户端重新提取...');
    } else {
        logger.info('未配置 access_token，从闲鱼客户端提取...');
    }

    const fresh = await extractToken();
    if (!fresh) {
        logger.error('无法获取 access_token，请确认闲鱼桌面客户端已登录');
        return null;
    }

    if (isTokenExpired(fresh)) {
        logger.error('从 LevelDB 提取的 token 也已过期，请在闲鱼桌面客户端重新登录');
        return null;
    }

    // 写回 .env 文件
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf8');
        if (envContent.includes('ACCESS_TOKEN=')) {
            envContent = envContent.replace(
                /^ACCESS_TOKEN=.*$/m,
                `ACCESS_TOKEN=${fresh}`
            );
        } else {
            envContent += `\nACCESS_TOKEN=${fresh}\n`;
        }
        fs.writeFileSync(envPath, envContent, 'utf8');
        logger.info('已将新 token 写入 .env 文件');
    }

    // 同步更新环境变量
    process.env.ACCESS_TOKEN = fresh;
    return fresh;
}

module.exports = {
    extractToken,
    decodeJwt,
    isTokenExpired,
    getValidToken,
    DB_DIR,
};
