const logger = require('../lib/logger');

function createDelivery(productDb, getSendReply) {
    const deliveredCids = new Set();
    const deliveryPending = new Set();

    async function handleAutoDelivery(cid, conv) {
        if (deliveredCids.has(cid)) return;
        if (deliveryPending.has(cid)) return;
        deliveryPending.add(cid);
        if (!conv.itemId) { deliveryPending.delete(cid); return; }

        const productCache = productDb.getCache();
        const product = productCache.get(String(conv.itemId));
        if (!product || !product.delivery) {
            logger.warn(`[自动发货] itemId=${conv.itemId} 在产品知识库中未配置 delivery，跳过发货`);
            logger.warn(`  已加载的产品 ID: ${[...productCache.keys()].join(', ')}`);
            deliveryPending.delete(cid);
            return;
        }

        await productDb.fetchProductInfo(conv.itemId);
        const fullProduct = productCache.get(String(conv.itemId)) || product;
        if (!fullProduct || !fullProduct.delivery) { deliveryPending.delete(cid); return; }

        logger.info(`[自动发货] 会话 ${cid} 商品 itemId=${conv.itemId} 标题="${fullProduct.title}" 检测到付款，发送资源链接`);

        const deliveryText = fullProduct.delivery
            .replace(/{title}/g, fullProduct.title || '')
            .replace(/{price}/g, fullProduct.price || '');

        const sendReply = getSendReply();
        try {
            await sendReply(cid, conv.conversationType, conv.receivers, deliveryText);
        } catch (e) {
            deliveryPending.delete(cid);
            throw e;
        }
        deliveredCids.add(cid);
        logger.info(`[自动发货] 已发货: ${deliveryText.substring(0, 100)}`);
        deliveryPending.delete(cid);
    }

    function getDeliveredCids() { return deliveredCids; }
    function getDeliveryPending() { return deliveryPending; }

    return {
        handleAutoDelivery,
        getDeliveredCids,
        getDeliveryPending,
    };
}

module.exports = { createDelivery };
