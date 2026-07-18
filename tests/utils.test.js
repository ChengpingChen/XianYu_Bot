const { sleep, randomDelay, extractUserId, extractCidFromDecoded, deepSearchKeywords } = require('../src/utils');

describe('sleep', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('should resolve after specified ms', async () => {
        const promise = sleep(50);
        jest.advanceTimersByTime(50);
        await expect(promise).resolves.toBeUndefined();
    });
});

describe('randomDelay', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it('should resolve within range', async () => {
        const min = 10, max = 50;
        const promise = randomDelay(min, max);
        jest.advanceTimersByTime(max);
        await expect(promise).resolves.toBeUndefined();
    });
});

describe('extractUserId', () => {
    it('should extract from string with @goofish suffix', () => {
        expect(extractUserId('12345@goofish')).toBe('12345');
    });

    it('should return plain string as-is', () => {
        expect(extractUserId('12345')).toBe('12345');
    });

    it('should convert number to string', () => {
        expect(extractUserId(12345)).toBe('12345');
    });

    it('should extract from object with uid field', () => {
        expect(extractUserId({ uid: '67890@goofish' })).toBe('67890');
    });

    it('should extract from object with userId field', () => {
        expect(extractUserId({ userId: '11111@goofish' })).toBe('11111');
    });

    it('should extract from array (key "1" takes priority over index 0)', () => {
        expect(extractUserId(['22222@goofish', '33333@goofish'])).toBe('33333');
    });

    it('should return empty for null/undefined', () => {
        expect(extractUserId(null)).toBe('');
        expect(extractUserId(undefined)).toBe('');
    });
});

describe('deepSearchKeywords', () => {
    const keywords = ['已付款', '支付成功'];

    it('should find keyword in a string', () => {
        expect(deepSearchKeywords('买家已付款', keywords)).toBe('买家已付款');
    });

    it('should find keyword in nested object', () => {
        const obj = { a: { b: { c: '支付成功' } } };
        expect(deepSearchKeywords(obj, keywords)).toBe('支付成功');
    });

    it('should find keyword in array', () => {
        const obj = { items: [{ text: '已付款' }] };
        expect(deepSearchKeywords(obj, keywords)).toBe('已付款');
    });

    it('should return null if not found', () => {
        expect(deepSearchKeywords('hello world', keywords)).toBeNull();
    });

    it('should respect depth limit', () => {
        const deep = { a: { b: { c: { d: { e: { f: { g: '已付款' } } } } } } };
        expect(deepSearchKeywords(deep, keywords)).toBeNull();
    });

    it('should handle null/undefined', () => {
        expect(deepSearchKeywords(null, keywords)).toBeNull();
        expect(deepSearchKeywords(undefined, keywords)).toBeNull();
    });

    it('should handle numbers and booleans', () => {
        expect(deepSearchKeywords(42, keywords)).toBeNull();
        expect(deepSearchKeywords(true, keywords)).toBeNull();
    });
});

describe('extractCidFromDecoded', () => {
    it('should extract from e[0]', () => {
        const n = [null, ['abcdef123456']];
        expect(extractCidFromDecoded(n)).toBe('abcdef123456');
    });

    it('should extract from e[2]', () => {
        const n = [null, [null, null, 'abcdef123456']];
        expect(extractCidFromDecoded(n)).toBe('abcdef123456');
    });

    it('should extract from extObj.cid', () => {
        const n = [null, [null, null, null, null, null, null, null, null, null, null, { cid: 'abcdef123456' }]];
        expect(extractCidFromDecoded(n)).toBe('abcdef123456');
    });

    it('should return empty for invalid input', () => {
        expect(extractCidFromDecoded(null)).toBe('');
        expect(extractCidFromDecoded(undefined)).toBe('');
    });
});
