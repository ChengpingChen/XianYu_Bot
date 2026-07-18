const fs = require('fs');
const logger = require('../lib/logger');
const { PRODUCTS_FILE } = require('./config');

function createProductDb(getClient) {
    const productCache = new Map();
    const knowledgeBase = [];
    let storeProfile = '';

    function getProductContent(info) {
        if (info.content) return info.content;
        if (info.desc) {
            let text = info.desc;
            if (info.faq) text += '\n\n常见问题：\n' + info.faq;
            if (info.notes) text += '\n\n备注：' + info.notes;
            if (info.condition) text += '\n成色：' + info.condition;
            if (info.includes) text += '\n配件：' + info.includes;
            return text;
        }
        return '';
    }

    function* iterateEntries(data, parentPath) {
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('_')) continue;
            if (!value || typeof value !== 'object') continue;
            if (value.items && typeof value.items === 'object') {
                const path = parentPath ? `${parentPath} > ${key}` : key;
                yield* iterateEntries(value.items, path);
            } else {
                yield { id: key, info: value, category: parentPath || '' };
            }
        }
    }

    function loadProducts() {
        try {
            const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));

            const general = data['_通用'];
            if (general) {
                storeProfile = typeof general === 'string' ? general : (general.content || '');
                if (!storeProfile && typeof general === 'object') {
                    const parts = [];
                    if (general.intro) parts.push(general.intro);
                    if (general.shipping) parts.push(`发货方式：${general.shipping}`);
                    if (general.afterSale) parts.push(`售后政策：${general.afterSale}`);
                    if (general.notes) parts.push(`注意事项：${general.notes}`);
                    storeProfile = parts.join('\n');
                }
                logger.info(`已加载通用店铺配置`);
            }

            productCache.clear();
            knowledgeBase.length = 0;
            let emptyKeyCount = 0;
            let loadedCount = 0;

            for (const { id, info, category } of iterateEntries(data)) {
                if (!id) { emptyKeyCount++; continue; }
                const entry = { ...info, category: category || info.category || '' };
                if (/^\d{10,}$/.test(id)) {
                    productCache.set(id, entry);
                    loadedCount++;
                } else if (entry.title && (!Array.isArray(entry.keywords) || entry.keywords.length > 0)) {
                    knowledgeBase.push(entry);
                    loadedCount++;
                }
            }

            if (emptyKeyCount > 0) {
                logger.warn(`[产品知识库] ⚠️ 发现 ${emptyKeyCount} 个空字符串 key 的商品`);
            }
            logger.info(`已加载 ${loadedCount} 个产品知识（${productCache.size} 个可匹配会话，${knowledgeBase.length} 个知识库商品）`);
        } catch (e) {
            logger.warn(`加载产品知识库失败: ${e.message}，将仅使用自动获取的商品信息`);
        }
    }

    function registerNewItem(itemId, info) {
        itemId = String(itemId);
        if (!/^\d{10,}$/.test(itemId)) return;
        if (productCache.has(itemId) && !productCache.get(itemId)?.auto) return;

        let data = {};
        try { data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); } catch {}

        const CATEGORY = '未分类';
        if (!data[CATEGORY] || typeof data[CATEGORY] !== 'object') data[CATEGORY] = { items: {} };
        if (!data[CATEGORY].items) data[CATEGORY].items = {};

        data[CATEGORY].items[itemId] = {
            title: info.title || '',
            price: info.price || '',
            content: info.content || info.desc || '',
        };

        try {
            const sorted = {};
            for (const k of Object.keys(data).sort()) sorted[k] = data[k];
            fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
            logger.info(`[自动注册] 商品 ${itemId} "${info.title}" 已写入「${CATEGORY}」分类`);
        } catch (e) {
            logger.warn(`[自动注册] 写入 products.json 失败: ${e.message}`);
        }

        const merged = { ...info, auto: true, category: CATEGORY };
        if (info._isOwn !== undefined) merged._isOwn = info._isOwn;
        productCache.set(itemId, merged);
    }

    async function fetchProductInfo(itemId) {
        if (!itemId) return null;
        itemId = String(itemId);
        const client = getClient();
        if (!client) return null;

        if (productCache.has(itemId) && !productCache.get(itemId)?.auto) return productCache.get(itemId);

        try {
            const res = await client.api.mtop.item.getDetail({ itemId });
            const item = res.data?.itemDO;
            if (item) {
                const info = {
                    title: item.title || '',
                    price: item.price || '',
                    content: '',
                    delivery: '',
                    auto: true,
                };
                const cached = productCache.get(itemId);
                if (cached) {
                    info.content = cached.content || cached.desc || '';
                    info.delivery = cached.delivery || '';
                }
                productCache.set(itemId, info);
                logger.info(`自动获取商品 ${itemId}: ${info.title} ¥${item.price || ''}`);

                return info;
            }
        } catch (e) {
            logger.debug(`获取商品 ${itemId} 详情失败: ${e.message}`);
        }
        return null;
    }

    function buildProductPrompt(itemId, buyerText) {
        const info = productCache.get(String(itemId || ''));
        const text = (buyerText || '').toLowerCase();

        let prompt = '';
        if (storeProfile) {
            prompt += '【店铺简介】\n' + storeProfile + '\n';
        }

        const matched = [];
        const unmatched = [];
        const seenTitles = new Set();

        function addProduct(p, forceMatch) {
            if (!p || !p.title || seenTitles.has(p.title)) return;
            seenTitles.add(p.title);
            if (forceMatch) { matched.push(p); return; }
            const keywords = [p.title, ...(Array.isArray(p.keywords) ? p.keywords : [p.keywords || ''])].filter(Boolean).map(k => k.toLowerCase());
            const relevant = !buyerText || keywords.some(kw => text.includes(kw));
            (relevant ? matched : unmatched).push(p);
        }

        if (info && info.title) addProduct(info, true);
        for (const kb of knowledgeBase) addProduct(kb);

        const noItemContext = !itemId;
        if (noItemContext && matched.length === 0 && unmatched.length > 0) {
            matched.push(...unmatched);
            unmatched.length = 0;
        }

        if (matched.length > 0) {
            let lastCategory = '';
            for (const p of matched) {
                const cat = p.category || '';
                if (cat && cat !== lastCategory) {
                    prompt += `\n【${cat}】\n`;
                    lastCategory = cat;
                }
                prompt += `\n--- ${p.title} ---\n`;
                if (p.price) prompt += `价格：¥${p.price}\n`;
                const content = getProductContent(p);
                if (content) prompt += content + '\n';
            }
        }
        if (unmatched.length > 0) {
            prompt += '\n【店铺还有以下商品】\n';
            let lastCategory = '';
            for (const p of unmatched) {
                const cat = p.category || '';
                if (cat && cat !== lastCategory) {
                    prompt += `\n${cat}：\n`;
                    lastCategory = cat;
                }
                prompt += `- ${p.title}\n`;
            }
        }

        prompt += '\n请基于以上信息回答买家问题。回复简短专业有礼貌，50字以内。';
        return prompt;
    }

    async function scanAndRegisterAllConversations(conversationMap) {
        let count = 0;
        const seenItemIds = new Set();
        for (const [, conv] of conversationMap) {
            if (!conv.itemId || conv.itemId === '0') continue;
            const id = String(conv.itemId);
            if (seenItemIds.has(id)) continue;
            seenItemIds.add(id);
            if (productCache.has(id) && !productCache.get(id)?.auto) continue;
            const info = await fetchProductInfo(id);
            if (info) {
                logger.info(`[启动扫描] ✅ 发现商品 ${id}: ${info.title} ¥${info.price}`);
                count++;
            }
        }
        if (count > 0) {
            logger.info(`[启动扫描] 共发现 ${count} 个新商品，仅回复 products.json 中已注册的商品`);
        } else {
            logger.info('[启动扫描] 未发现新商品');
        }
    }

    async function findOwnItemId(keyword, selfUid) {
        const client = getClient();
        if (!client || !selfUid || !keyword) return null;
        try {
            const res = await client.api.mtop.search.search({ keyword, pageNumber: 1, rowsPerPage: 30 });
            const data = res?.data || {};
            const list = data.resultList || data.items || data.list || data.data || [];
            if (!Array.isArray(list)) return null;

            for (const it of list) {
                const item = it?.data?.item || it?.item || it;
                const id = item.itemId || item.id;
                const seller = String(item.sellerId || item.userId || item.sellerIdenty || '');
                if (seller === String(selfUid)) {
                    return { id: String(id), title: item.title || '' };
                }
            }
        } catch {}
        return null;
    }

    async function autoFixEmptyKeys(selfUid) {
        let data;
        try { data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8')); } catch { return 0; }
        if (!data) return 0;

        const emptyKeys = [...iterateEntries(data)].filter(e => !e.id);
        if (emptyKeys.length === 0) return 0;

        logger.info(`[自动修复] 发现 ${emptyKeys.length} 个空 key 商品，正在搜索匹配...`);
        let fixed = 0;

        for (const { id, info } of emptyKeys) {
            const title = (info.title || '').trim();
            if (!title) { logger.warn(`[自动修复] 商品无标题，跳过`); continue; }
            const keyword = title.substring(0, 6);
            logger.info(`  🔍 搜索 "${keyword}"...`);
            const match = await findOwnItemId(keyword, selfUid);
            if (match) {
                logger.info(`  ✅ 匹配到: ${match.id} → "${match.title}"`);
                data[match.id] = { ...info, title: match.title };
                delete data[id];
                fixed++;
            } else {
                logger.warn(`  ❌ 未搜索到 "${title}" 的匹配商品，请在闲鱼确认商品是否上架`);
            }
        }

        if (fixed > 0) {
            const sorted = {};
            for (const k of Object.keys(data).sort()) sorted[k] = data[k];
            fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
            logger.info(`[自动修复] 已修复 ${fixed}/${emptyKeys.length} 个商品 ID，请检查 products.json`);
        }
        return fixed;
    }

    function hasEmptyKeys() {
        try {
            const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
            return [...iterateEntries(data)].some(e => !e.id);
        } catch { return false; }
    }

    function getCache() { return productCache; }
    function getStoreProfile() { return storeProfile; }
    function getKnowledgeBase() { return knowledgeBase; }
    function isOwnProduct(itemId) {
        const id = String(itemId || '');
        return /^\d{10,}$/.test(id) && productCache.has(id) && !productCache.get(id)?.auto;
    }

    return {
        loadProducts,
        registerNewItem,
        fetchProductInfo,
        buildProductPrompt,
        scanAndRegisterAllConversations,
        autoFixEmptyKeys,
        hasEmptyKeys,
        findOwnItemId,
        getCache,
        getStoreProfile,
        getKnowledgeBase,
        isOwnProduct,
    };
}

module.exports = { createProductDb };
