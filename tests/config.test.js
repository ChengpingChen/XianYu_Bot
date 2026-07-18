const { PAYMENT_KEYWORDS, PRE_PAYMENT_KEYWORDS, PLATFORM_TIP_PATTERNS, REPLY_COOLDOWN_MS } = require('../src/config');

describe('PAYMENT_KEYWORDS', () => {
    it('should include basic payment keywords', () => {
        expect(PAYMENT_KEYWORDS).toContain('已付款');
        expect(PAYMENT_KEYWORDS).toContain('支付成功');
        expect(PAYMENT_KEYWORDS).toContain('付款了');
        expect(PAYMENT_KEYWORDS).toContain('已下单');
    });

    it('should not overlap with PRE_PAYMENT_KEYWORDS', () => {
        for (const kw of PRE_PAYMENT_KEYWORDS) {
            expect(PAYMENT_KEYWORDS).not.toContain(kw);
        }
    });
});

describe('PRE_PAYMENT_KEYWORDS', () => {
    it('should include pre-payment keywords', () => {
        expect(PRE_PAYMENT_KEYWORDS).toContain('已拍下');
        expect(PRE_PAYMENT_KEYWORDS).toContain('待付款');
    });
});

describe('PLATFORM_TIP_PATTERNS', () => {
    it('should include platform UI tips', () => {
        expect(PLATFORM_TIP_PATTERNS).toContain('不想宝贝被砍价');
        expect(PLATFORM_TIP_PATTERNS).toContain('快速回复');
    });
});

describe('REPLY_COOLDOWN_MS', () => {
    it('should be a positive number', () => {
        expect(REPLY_COOLDOWN_MS).toBeGreaterThan(0);
    });
});
