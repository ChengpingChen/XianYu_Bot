const { createMessageHandler } = require('../src/message-handler');
const { createProductDb } = require('../src/product-db');

const dummyProductDb = createProductDb(() => null);
const handler = createMessageHandler(dummyProductDb, null, () => null);

describe('isPaymentMessage', () => {
    it('should detect exact keyword match', () => {
        expect(handler.isPaymentMessage('买家已付款', '', {})).toBe(true);
    });

    it('should detect "支付成功"', () => {
        expect(handler.isPaymentMessage('支付成功', '', {})).toBe(true);
    });

    it('should detect "待发货"', () => {
        expect(handler.isPaymentMessage('待发货', '', {})).toBe(true);
    });

    it('should detect "付款了" via regex', () => {
        expect(handler.isPaymentMessage('我付款了', '', {})).toBe(true);
    });

    it('should detect "付款完" via regex', () => {
        expect(handler.isPaymentMessage('付完了', '', {})).toBe(true);
    });

    it('should detect "已付款" via regex', () => {
        expect(handler.isPaymentMessage('订单已付款', '', {})).toBe(true);
    });

    it('should detect "刚付款" via regex', () => {
        expect(handler.isPaymentMessage('刚付款', '', {})).toBe(true);
    });

    it('should detect in reminderContent', () => {
        expect(handler.isPaymentMessage('', '买家已付款', {})).toBe(true);
    });

    it('should detect in extJson', () => {
        expect(handler.isPaymentMessage('', '', { text: '支付成功' })).toBe(true);
    });

    it('should detect in extra fields', () => {
        expect(handler.isPaymentMessage('', '', {}, { contentText: '已付款' })).toBe(true);
    });

    it('should not false-positive on "待付款"', () => {
        expect(handler.isPaymentMessage('待付款', '', {})).toBe(false);
    });

    it('should not false-positive on "已拍下"', () => {
        expect(handler.isPaymentMessage('已拍下', '', {})).toBe(false);
    });

    it('should not false-positive on empty text', () => {
        expect(handler.isPaymentMessage('', '', {})).toBe(false);
    });

    it('should not false-positive on unrelated text', () => {
        expect(handler.isPaymentMessage('你好，请问这个商品还在吗', '', {})).toBe(false);
    });
});

describe('isPrePaymentMessage', () => {
    it('should detect "已拍下"', () => {
        expect(handler.isPrePaymentMessage('已拍下', '', {})).toBe(true);
    });

    it('should detect "待付款"', () => {
        expect(handler.isPrePaymentMessage('待付款', '', {})).toBe(true);
    });

    it('should detect "请确认价格"', () => {
        expect(handler.isPrePaymentMessage('请确认价格', '', {})).toBe(true);
    });

    it('should NOT detect payment keywords ("已付款")', () => {
        expect(handler.isPrePaymentMessage('已付款', '', {})).toBe(false);
    });

    it('should not false-positive on empty text', () => {
        expect(handler.isPrePaymentMessage('', '', {})).toBe(false);
    });
});

describe('isPlatformTip', () => {
    it('should detect "不想宝贝被砍价"', () => {
        expect(handler.isPlatformTip('不想宝贝被砍价')).toBe(true);
    });

    it('should detect "快速回复"', () => {
        expect(handler.isPlatformTip('快速回复')).toBe(true);
    });

    it('should detect "猜你想问"', () => {
        expect(handler.isPlatformTip('猜你想问')).toBe(true);
    });

    it('should detect "你已发货"', () => {
        expect(handler.isPlatformTip('你已发货')).toBe(true);
    });

    it('should detect in extra text', () => {
        expect(handler.isPlatformTip('普通消息', '快速回复')).toBe(true);
    });

    it('should not false-positive on normal buyer message', () => {
        expect(handler.isPlatformTip('你好，请问什么时候发货')).toBe(false);
    });

    it('should not false-positive on empty', () => {
        expect(handler.isPlatformTip('')).toBe(false);
    });
});
