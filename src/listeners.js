const logger = require('../lib/logger');
const { CONFIG, PAYMENT_KEYWORDS, PRE_PAYMENT_KEYWORDS } = require('./config');
const { extractUserId, extractCidFromDecoded, deepSearchKeywords } = require('./utils');

function setupListeners(client, msgHandler) {
    const repliedMsgs = msgHandler.getRepliedMsgs();

    client.api.im.message.onSyncPush((message) => {
        const items = message.body?.decodedItems || [];
        for (const item of items) {
            if (item.error || !item.decoded) continue;

            const decoded = item.decoded;
            const n = Array.isArray(decoded) ? decoded[0] : decoded;
            if (!n) continue;

            const e = n[1];
            if (!e) continue;

            const pushCid = extractCidFromDecoded(n);
            const rawSender = e[1];
            const senderId = extractUserId(rawSender);
            const text = e[6]?.[3]?.[2] || '';
            const msgId = String(e[3] || '');

            const extObj = e[10] || {};
            const reminderContent = extObj.reminderContent || '';
            let extJson = {};
            try { extJson = extObj.extJson ? JSON.parse(extObj.extJson) : {}; } catch {}

            const pushItemId = extObj.itemId || extObj.itemIdStr || extObj.item_id || extJson.itemId || extJson.itemIdStr || extJson.item_id || '';

            const isSystemMsg = !senderId || senderId === '0' || senderId === '1';
            if (isSystemMsg) {
                logger.info(`[系统消息，跳过] cid=${pushCid} text="${String(text || reminderContent).substring(0, 120)}"`);
                continue;
            }

            const paymentMatch = msgHandler.deepSearchPayment(n);
            const keywordMatch = msgHandler.isPaymentMessage(text, reminderContent, extJson);

            if (paymentMatch || keywordMatch) {
                logger.info(`[付款通知，自动发货已禁用] msgId=${msgId} cid=${pushCid} 内容=${paymentMatch || `text="${text}"`}`);
                continue;
            }

            const prePaymentMatch = msgHandler.deepSearchPrePayment(n);
            const preKeywordMatch = msgHandler.isPrePaymentMessage(text, reminderContent, extJson);
            if (prePaymentMatch || preKeywordMatch) {
                logger.info(`[售前消息，跳过回复] msgId=${msgId} cid=${pushCid} 来源=${prePaymentMatch ? '深度搜索' : '关键词匹配'} 内容=${prePaymentMatch || `text="${text}"`}`);
                continue;
            }

            logger.debug(`[SyncPush] cid=${pushCid} sender=${senderId} msgId=${msgId} text=${String(text).substring(0, 50)}`);

            if (!senderId || !text) continue;
            if (senderId === String(CONFIG.selfUid)) continue;
            if (msgId && repliedMsgs.has(msgId)) continue;

            if (msgHandler.isPlatformTip(text)) {
                logger.info(`[平台提示，跳过] msgId=${msgId} cid=${pushCid} text="${String(text).substring(0, 60)}"`);
                if (msgId) repliedMsgs.add(msgId);
                continue;
            }

            if (msgId) repliedMsgs.add(msgId);
            trimSet(repliedMsgs, 1000);

            if (pushItemId) {
                msgHandler.setConvItemId(pushCid, pushItemId);
            }

            msgHandler.handleIncomingMessage(msgId, senderId, text, pushCid, pushItemId).catch(err => {
                logger.error(`SyncPush 处理失败: ${err.message}`);
            });
        }
    });

    client.api.im.message.onFormattedMessage(async (msg) => {
        try {
            const msgId = String(msg.messageId || '');
            const senderId = extractUserId(msg.senderId);
            const text = msg.text || (msg.content?.text?.text) || '';
            const fmtItemId = msg.extJson?.itemId || msg.extJson?.itemIdStr || msg.extJson?.item_id || msg.itemId || '';

            const isSystemMsg = !senderId || senderId === '0' || senderId === '1';
            if (isSystemMsg) {
                logger.info(`[系统消息，跳过] fmtMsg: msgId=${msgId} text="${text.substring(0, 120)}"`);
                return;
            }

            const extraText = [
                msg.content?.title,
                msg.content?.subTitle,
                msg.content?.description,
                msg.extJson?.title,
                msg.extJson?.subTitle,
                msg.extJson?.text,
                msg.extJson?.content,
                msg.extJson?.reminderContent,
                typeof msg.extJson === 'string' ? msg.extJson : '',
            ].filter(Boolean).join(' ');

            const allText = `${text} ${extraText}`;

            const paymentHit = PAYMENT_KEYWORDS.some(kw => allText.includes(kw));
            const paymentDeep = deepSearchKeywords(msg, PAYMENT_KEYWORDS);
            if (paymentHit || paymentDeep) {
                logger.info(`[付款通知，自动发货已禁用] fmtMsg: senderId=${senderId || '(空)'} cid=${msg.cid || '(空)'} text="${text}"`);
                if (msgId) repliedMsgs.add(msgId);
                return;
            }

            const prePaymentHit = PRE_PAYMENT_KEYWORDS.some(kw => allText.includes(kw));
            const prePaymentDeep = deepSearchKeywords(msg, PRE_PAYMENT_KEYWORDS);
            if (prePaymentHit || prePaymentDeep) {
                logger.info(`[售前消息，跳过回复] 格式化消息: senderId=${senderId || '(空)'} 来源=${prePaymentDeep ? '深度搜索' : '关键词匹配'} text="${text}" extra="${extraText.substring(0, 100)}"`);
                if (msgId) repliedMsgs.add(msgId);
                return;
            }

            if (!senderId || !text) return;
            if (senderId === String(CONFIG.selfUid)) return;
            if (msgId && repliedMsgs.has(msgId)) return;

            if (msgHandler.isPlatformTip(text, extraText)) {
                logger.info(`[平台提示，跳过] msgId=${msgId} cid=${msg.cid || '(空)'} text="${text.substring(0, 60)}"`);
                if (msgId) repliedMsgs.add(msgId);
                return;
            }

            if (msgId) repliedMsgs.add(msgId);
            trimSet(repliedMsgs, 1000);

            if (fmtItemId) {
                msgHandler.setConvItemId(msg.cid, fmtItemId);
            }

            await msgHandler.handleIncomingMessage(msgId, senderId, text, msg.cid, fmtItemId);
        } catch (e) {
            logger.error(`处理消息异常: ${e.message}`);
        }
    });
}

function trimSet(set, maxSize) {
    if (set.size > maxSize) {
        const toDelete = [...set].slice(0, set.size - maxSize);
        for (const item of toDelete) {
            set.delete(item);
        }
    }
}

module.exports = { setupListeners };
