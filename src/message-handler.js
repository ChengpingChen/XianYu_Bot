const logger = require('../lib/logger');
const { CONFIG, PAYMENT_KEYWORDS, PRE_PAYMENT_KEYWORDS, PLATFORM_TIP_PATTERNS, REPLY_COOLDOWN_MS, DEEPSEEK_API_URL, DEEPSEEK_MODEL } = require('./config');
const { sleep, randomDelay, deepSearchKeywords, alertRiskControl } = require('./utils');

function createMessageHandler(productDb, delivery, getClient) {
    const repliedMsgs = new Set();
    const conversationMap = new Map();
    const lastReplyTime = new Map();
    const convHistory = new Map();
    const MAX_HISTORY = 10;
    let riskCount = 0;

    function collectAllText(text, reminderContent, extJson, extra = {}) {
        const fields = [
            text,
            reminderContent,
            extra?.contentText || '',
            extra?.title || '',
            extra?.subTitle || '',
            extJson?.reminderContent || '',
            extJson?.text || '',
            extJson?.content || '',
            extJson?.title || '',
            extJson?.subTitle || '',
            extJson?.bizTag || '',
            extJson?.tag || '',
            extJson?.desc || '',
            extJson?.description || '',
            extJson?.message || '',
            extJson?.msg || '',
            extJson?.body || '',
            extJson?.name || '',
        ].filter(Boolean);
        return fields.join(' ');
    }

    function isPaymentMessage(text, reminderContent, extJson, extra = {}) {
        const allText = collectAllText(text, reminderContent, extJson, extra);
        if (PAYMENT_KEYWORDS.some(kw => allText.includes(kw))) return true;
        if (/付款[了完好]/.test(allText)) return true;
        if (/已付款|已支付/.test(allText)) return true;
        if (/刚付款|刚支付/.test(allText)) return true;
        return false;
    }

    function isPrePaymentMessage(text, reminderContent, extJson, extra = {}) {
        const allText = collectAllText(text, reminderContent, extJson, extra);
        return PRE_PAYMENT_KEYWORDS.some(kw => allText.includes(kw));
    }

    function isPlatformTip(text, extraText = '') {
        const all = `${text} ${extraText}`;
        return PLATFORM_TIP_PATTERNS.some(p => all.includes(p));
    }

    function deepSearchPayment(obj) {
        return deepSearchKeywords(obj, PAYMENT_KEYWORDS);
    }

    function deepSearchPrePayment(obj) {
        return deepSearchKeywords(obj, PRE_PAYMENT_KEYWORDS);
    }

    async function genReply(text, itemId, cid) {
        if (!CONFIG.aiKey) {
            logger.warn('未配置 DEEPSEEK_API_KEY，使用默认回复');
            return '您好，已收到您的消息，我会尽快为您处理。';
        }

        const productPrompt = productDb.buildProductPrompt(itemId, text);
        const systemPrompt = productPrompt
            ? productPrompt
            : '你是一个闲鱼卖家客服。回复简短专业有礼貌，50字以内。';

        const history = cid ? (convHistory.get(cid) || []) : [];
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: '买家说：' + text },
        ];

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const resp = await fetch(DEEPSEEK_API_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + CONFIG.aiKey,
                    },
                    body: JSON.stringify({
                        model: DEEPSEEK_MODEL,
                        messages,
                        max_tokens: 200,
                        temperature: 0.7,
                    }),
                    signal: AbortSignal.timeout(15000),
                });

                if (!resp.ok) throw new Error(`DeepSeek API 返回 ${resp.status}`);

                const d = await resp.json();
                const reply = d.choices?.[0]?.message?.content;
                if (reply) {
                    if (cid) {
                        history.push({ role: 'user', content: '买家说：' + text });
                        history.push({ role: 'assistant', content: reply });
                        if (history.length > MAX_HISTORY * 2) {
                            history.splice(0, history.length - MAX_HISTORY * 2);
                        }
                        convHistory.set(cid, history);
                    }
                    return reply.trim();
                }

                logger.warn('DeepSeek 返回空内容，使用默认回复');
                return '您好，已收到您的消息。';
            } catch (e) {
                if (attempt === 0) {
                    logger.warn(`DeepSeek 请求失败: ${e.message}，2s 后重试`);
                    await sleep(2000);
                } else {
                    logger.error(`DeepSeek 重试仍失败: ${e.message}，使用默认回复`);
                    return '您好，已收到您的消息，我会尽快为您处理。';
                }
            }
        }
        return '您好，已收到您的消息。';
    }

    async function sendReply(conversationId, conversationType, receivers, text) {
        const client = getClient();
        try {
            await client.api.im.message.sendTextMessage({
                text,
                conversationId,
                conversationType,
                receivers,
            });
            logger.info(`-> 回复: ${text.substring(0, 80)}`);
            logger.info('   发送成功');
            riskCount = 0;
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('403') || msg.includes('token') || msg.includes('auth') || msg.includes('FAIL_SYS')) {
                alertRiskControl('发送消息失败，Cookie 可能已过期', msg);
            } else {
                logger.error(`   发送失败: ${e.message}`);
            }
        }
    }

    async function refreshConversations() {
        const client = getClient();
        try {
            const res = await client.api.im.conversation.listNewestPagination({
                startTimeStamp: Date.now(),
                limitNum: 50,
            });

            const body = res.body || res;
            const rawConvs = body.userConvs || body.conversations || body.list || (Array.isArray(body) ? body : []);

            if (rawConvs.length === 0) {
                logger.warn('会话列表为空');
            }

            for (const raw of rawConvs) {
                const conv = raw.singleChatUserConversation || raw.groupChatUserConversation || raw;
                const singleConv = conv.singleChatConversation || conv.groupChatConversation || {};

                const cid = singleConv.cid || conv.cid || conv.conversationId || '';
                if (!cid) continue;

                let peerUserId = '';
                let selfInPair = '';
                const pairFirst = singleConv.pairFirst || '';
                const pairSecond = singleConv.pairSecond || '';
                if (pairFirst && pairSecond) {
                    const first = pairFirst.replace(/@goofish$/, '');
                    const second = pairSecond.replace(/@goofish$/, '');
                    if (first === String(CONFIG.selfUid)) {
                        peerUserId = second;
                        selfInPair = first;
                    } else if (second === String(CONFIG.selfUid)) {
                        peerUserId = first;
                        selfInPair = second;
                    } else {
                        peerUserId = first;
                        selfInPair = second;
                    }
                }

                const lastMsg = conv.lastMessage || {};
                const lastMsgExt = lastMsg.message?.extension || {};
                const lastSender = lastMsgExt.senderUserId || '';
                const lastText = lastMsgExt.reminderContent || lastMsg.message?.content || '';
                const redPoint = conv.redPoint || 0;
                const readStatus = lastMsg.readStatus || 0;

                if (!peerUserId && lastSender && lastSender !== String(CONFIG.selfUid)) {
                    peerUserId = lastSender;
                }

                const ext = singleConv.extension || conv.extension || {};
                let itemId = ext.itemId || ext.itemIdStr || ext.item_id || ext.itemIdStr_ || '';
                if (!itemId) {
                    const lastMsgExt2 = lastMsg?.message?.extension || {};
                    itemId = lastMsgExt2.itemId || lastMsgExt2.itemIdStr || lastMsgExt2.item_id || '';
                }
                if (!itemId) {
                    itemId = conv.itemId || conv.itemIdStr || singleConv.itemId || singleConv.itemIdStr || '';
                }

                conversationMap.set(cid, {
                    peerUserId,
                    selfInPair,
                    itemId: String(itemId || ''),
                    conversationType: singleConv.bizType ? 1 : (conv.conversationType || 1),
                    receivers: pairFirst && pairSecond ? [pairFirst, pairSecond] : (peerUserId ? [`${peerUserId}@goofish`] : []),
                    pairFirst,
                    pairSecond,
                    lastSender,
                    lastText,
                    unread: redPoint >= 2 || readStatus === 0,
                });
            }

            const uidFreq = new Map();
            for (const [, c] of conversationMap) {
                if (c.pairFirst) {
                    const u = c.pairFirst.replace(/@goofish$/, '');
                    uidFreq.set(u, (uidFreq.get(u) || 0) + 1);
                }
                if (c.pairSecond) {
                    const u = c.pairSecond.replace(/@goofish$/, '');
                    uidFreq.set(u, (uidFreq.get(u) || 0) + 1);
                }
            }
            let inferredSelfUid = '';
            let maxFreq = 0;
            for (const [u, f] of uidFreq) {
                if (f > maxFreq) { maxFreq = f; inferredSelfUid = u; }
            }
            if (inferredSelfUid && String(CONFIG.selfUid) !== inferredSelfUid) {
                logger.warn(`selfUid 推断修正: ${CONFIG.selfUid || '(空/UNB)'} → ${inferredSelfUid} (出现 ${maxFreq} 次)`);
                CONFIG.selfUid = inferredSelfUid;
                for (const [, c] of conversationMap) {
                    if (c.pairFirst && c.pairSecond) {
                        const first = c.pairFirst.replace(/@goofish$/, '');
                        const second = c.pairSecond.replace(/@goofish$/, '');
                        if (first === String(CONFIG.selfUid)) {
                            c.peerUserId = second;
                            c.selfInPair = first;
                        } else if (second === String(CONFIG.selfUid)) {
                            c.peerUserId = first;
                            c.selfInPair = second;
                        }
                    }
                }
            }

            logger.info(`已加载 ${conversationMap.size} 个会话`);

            const productCache = productDb.getCache();
            const convSummary = [];
            for (const [cid, c] of conversationMap) {
                const shortCid = cid.substring(0, 12);
                const productTitle = c.itemId ? (productCache.get(c.itemId)?.title || '(未在知识库)') : '(无itemId)';
                convSummary.push(`  cid=${shortCid}.. itemId=${c.itemId || '(空)'} peer=${c.peerUserId} 商品=${productTitle}`);
            }
            logger.info(`会话列表:\n${convSummary.join('\n')}`);

            if (rawConvs.length > 0) {
                const first = rawConvs[0];
                const inner = first.singleChatUserConversation || first.groupChatUserConversation || first;
                const singleConv = inner.singleChatConversation || inner.groupChatConversation || {};
                logger.debug('第一个会话 cid=' + (singleConv.cid || '无') +
                    ' pairFirst=' + (singleConv.pairFirst || '') +
                    ' pairSecond=' + (singleConv.pairSecond || ''));
            }
        } catch (e) {
            logger.error(`刷新会话列表失败: ${e.message}`);
        }
    }

    async function handleIncomingMessage(msgId, senderId, text, pushCid = '', pushItemId = '') {
        let cid = pushCid;
        let conv = cid ? conversationMap.get(cid) : null;

        if (pushCid && !conv) {
            logger.warn(`会话缓存中未找到 pushCid=${pushCid}，刷新会话列表...`);
            await refreshConversations();
            conv = conversationMap.get(pushCid);
        }

        if (!pushCid && !conv) {
            for (const [mapCid, mapConv] of conversationMap) {
                if (mapConv.peerUserId === senderId ||
                    mapConv.pairFirst === `${senderId}@goofish` ||
                    mapConv.pairSecond === `${senderId}@goofish`) {
                    cid = mapCid;
                    conv = mapConv;
                    break;
                }
            }
        }

        if (!cid || !conv) {
            logger.error(`无法找到 senderId=${senderId} pushCid=${pushCid || '(空)'} 对应的会话，跳过`);
            return;
        }

        if (!conv.itemId && pushItemId) {
            conv.itemId = String(pushItemId);
        }

        if (conv.selfInPair && senderId === conv.selfInPair) {
            logger.debug(`[自己发的消息，跳过] cid=${cid.substring(0,12)}.. senderId=${senderId}`);
            return;
        }
        if (senderId === String(CONFIG.selfUid)) {
            logger.debug(`[自己发的消息，跳过] cid=${cid.substring(0,12)}.. senderId=${senderId} (== selfUid)`);
            return;
        }

        if (isPlatformTip(text)) {
            logger.info(`[平台提示，跳过回复] cid=${cid.substring(0,12)}.. text="${String(text).substring(0, 80)}"`);
            return;
        }

        const now = Date.now();
        const lastTime = lastReplyTime.get(cid) || 0;
        if (now - lastTime < REPLY_COOLDOWN_MS) {
            logger.info(`[冷却中，跳过回复] cid=${cid.substring(0,12)}.. 距上次回复 ${now - lastTime}ms < ${REPLY_COOLDOWN_MS}ms text="${String(text).substring(0, 50)}"`);
            return;
        }

        logger.info(`[买家 ${senderId}] cid=${cid.substring(0,12)}.. itemId=${conv.itemId || '(空)'} ${String(text).substring(0, 100)}`);

        if (conv.itemId) {
            if (!productDb.isOwnProduct(conv.itemId)) {
                logger.info(`  → 商品 ${conv.itemId} 不在 products.json 中，跳过回复`);
                return;
            }
            await productDb.fetchProductInfo(conv.itemId);
            const productCache = productDb.getCache();
            const product = productCache.get(String(conv.itemId));
            if (product) {
                logger.info(`  → 匹配商品: ${product.title} (¥${product.price})`);
            }
        } else {
            logger.info(`  → 该会话没有 itemId，跳过回复`);
            return;
        }

        const reply = await genReply(String(text), conv.itemId, cid);
        await randomDelay(1000, 3000);
        await sendReply(cid, conv.conversationType, conv.receivers, reply);
        lastReplyTime.set(cid, Date.now());
    }

    async function catchUpUnread() {
        let count = 0;
        for (const [cid, conv] of conversationMap) {
            if (!conv.unread) continue;
            if (!conv.receivers.length) continue;
            if (!conv.pairFirst || !conv.pairSecond) continue;
            if (conv.lastSender === String(CONFIG.selfUid)) continue;
            if (!conv.lastSender || conv.lastSender === '0') {
                conv.lastText = conv.lastText || '您好';
            }

            const text = conv.lastText || '您好';

            if (conv.itemId) {
                if (!productDb.isOwnProduct(conv.itemId)) {
                    logger.info(`  → 商品 ${conv.itemId} 不在 products.json 中，跳过补回复`);
                    conv.unread = false;
                    continue;
                }
                await productDb.fetchProductInfo(conv.itemId);
            } else {
                logger.info(`  → 该会话没有 itemId，跳过补回复`);
                conv.unread = false;
                continue;
            }

            const reply = await genReply(text, conv.itemId, cid);
            await randomDelay(1500, 4000);
            await sendReply(cid, conv.conversationType, conv.receivers, reply);
            conv.unread = false;
            count++;
            if (count > 0) await randomDelay(2000, 4000);
        }
        if (count > 0) {
            logger.info(`补回复完成，共处理 ${count} 条未读消息`);
        }
    }

    function getConversationMap() { return conversationMap; }
    function setConvItemId(cid, itemId) {
        if (!cid || !itemId) return;
        const conv = conversationMap.get(cid);
        if (conv && !conv.itemId) {
            conv.itemId = String(itemId);
        }
    }
    function getRepliedMsgs() { return repliedMsgs; }
    function getRiskCount() { return riskCount; }
    function resetRiskCount() { riskCount = 0; }
    function incrementRiskCount() { riskCount++; }
    function getSendReplyFn() { return sendReply; }

    return {
        collectAllText,
        isPaymentMessage,
        isPrePaymentMessage,
        isPlatformTip,
        deepSearchPayment,
        deepSearchPrePayment,
        genReply,
        sendReply,
        refreshConversations,
        handleIncomingMessage,
        catchUpUnread,
        getConversationMap,
        setConvItemId,
        getRepliedMsgs,
        getRiskCount,
        resetRiskCount,
        incrementRiskCount,
        getSendReplyFn,
    };
}

module.exports = { createMessageHandler };
