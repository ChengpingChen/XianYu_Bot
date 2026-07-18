const PAYMENT_KEYWORDS = [
    '已付款', '已支付', '支付成功', '支付完成', '待发货', '买家已付款', '买家已支付',
    '订单已支付', '订单已付款', '已确认收货', '等待你发货', '等待发货', '去发货',
    '我已付款', '我已支付', '付款成功', '交易成功', '请你发货', '对方已付款',
    '请包装好商品，并按我在闲鱼上提供的地址发货',
    '我已付款，等待你发货',
    '付款了', '付了款', '付完了', '付好了', '已经付款', '已经支付',
    '刚付款', '刚刚付款', '已下单', '下单了', '已经下单',
    '款已付', '钱已付', '已转账', '转账成功',
];

const PRE_PAYMENT_KEYWORDS = [
    '已拍下', '待付款', '待成交', '待刀成', '待确认', '已小刀', '我已小刀，待刀成',
    '请双方沟通及时确认价格', '修改价格', '请确认价格', '请尽快确认',
];

const PLATFORM_TIP_PATTERNS = [
    '不想宝贝被砍价', '设置不砍价回复', '设置不砍价',
    '快速回复', '快捷回复', '智能回复',
    '点击设置', '去设置', '立即设置',
    '查看更多', '点击查看', '了解更多',
    '猜你想问', '常见问题', '你已发货',
    '温馨提醒', '商品信息近期有过变更', '请与买家沟通一致',
];

const REPLY_COOLDOWN_MS = 2000;

const CONFIG = {
    cookie: process.env.GOOFISH_COOKIE || [
        `_m_h5_tk=${process.env.MH5_TK}`,
        `cna=${process.env.CNA}`,
        `unb=${process.env.UNB}`,
        `tracknick=${process.env.TRACKNICK}`,
    ].filter(s => !s.endsWith('=')).join('; '),

    aiKey: process.env.DEEPSEEK_API_KEY || '',
    replyCooldown: parseInt(process.env.REPLY_COOLDOWN, 10) || 60000,
    selfUid: process.env.UNB || '',
    selfName: '',
    adminPort: parseInt(process.env.ADMIN_PORT, 10) || 8720,
    adminToken: process.env.ADMIN_TOKEN || '',
};

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const WS_URL = 'wss://wss-goofish.dingtalk.com/';
const PRODUCTS_FILE = require('path').join(__dirname, '..', 'products.json');

module.exports = {
    CONFIG,
    PAYMENT_KEYWORDS,
    PRE_PAYMENT_KEYWORDS,
    PLATFORM_TIP_PATTERNS,
    REPLY_COOLDOWN_MS,
    DEEPSEEK_API_URL,
    DEEPSEEK_MODEL,
    WS_URL,
    PRODUCTS_FILE,
};
