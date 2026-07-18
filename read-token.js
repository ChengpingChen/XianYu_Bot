/**
 * 从闲鱼桌面 App 的 LevelDB 中提取 access_token 并写入 .env 文件
 *
 * 用法：
 *   node read-token.js          # 提取 token 并写入 .env
 *   node read-token.js --print  # 仅打印，不写入 .env
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { extractToken, decodeJwt, isTokenExpired } = require('./lib/token');
const logger = require('./lib/logger');

async function main() {
    const printOnly = process.argv.includes('--print');

    logger.info('开始从闲鱼桌面 App 提取 access_token...');

    const token = await extractToken();
    if (!token) {
        logger.error('提取失败，请确认闲鱼桌面客户端已安装并登录');
        process.exit(1);
    }

    // 打印 token 信息
    const payload = decodeJwt(token);
    if (payload) {
        logger.info(`账号: ${payload.name} (UID: ${payload.uid})`);
        logger.info(`签发时间: ${new Date(payload.iat * 1000).toLocaleString('zh-CN')}`);
        logger.info(`过期时间: ${new Date(payload.exp * 1000).toLocaleString('zh-CN')}`);

        if (isTokenExpired(token)) {
            logger.warn('⚠ 该 token 已过期或即将过期，请在闲鱼桌面客户端重新登录后再试');
        } else {
            logger.info('token 状态正常');
        }
    }

    if (printOnly) {
        console.log('\n--- access_token ---');
        console.log(token);
        console.log('---\n');
        return;
    }

    // 写入 .env 文件
    const envPath = path.join(__dirname, '.env');

    if (!fs.existsSync(envPath)) {
        // 从 .env.example 复制
        const examplePath = path.join(__dirname, '.env.example');
        if (fs.existsSync(examplePath)) {
            fs.copyFileSync(examplePath, envPath);
            logger.info('从 .env.example 创建了 .env 文件');
        } else {
            fs.writeFileSync(envPath, '', 'utf8');
        }
    }

    let envContent = fs.readFileSync(envPath, 'utf8');
    if (envContent.includes('ACCESS_TOKEN=')) {
        envContent = envContent.replace(
            /^ACCESS_TOKEN=.*$/m,
            `ACCESS_TOKEN=${token}`
        );
    } else {
        envContent += `\nACCESS_TOKEN=${token}\n`;
    }

    fs.writeFileSync(envPath, envContent, 'utf8');
    logger.info('access_token 已写入 .env 文件');
    logger.info('现在可以运行 npm start 启动 Bot 了');
}

main().catch(e => {
    logger.error('运行出错: ' + e.message);
    process.exit(1);
});
