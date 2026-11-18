import { describe, it, expect } from 'vitest';
import { describeError, maskPhone } from './describe-error.js';

describe('describeError', () => {
  it('never includes the webhook URL/token, only the REST method', () => {
    const err = Object.assign(new Error('socket hang up'), {
      code: 'ECONNRESET',
      config: { url: 'https://portal.bitrix24.com.br/rest/6/SEGREDO123/crm.lead.contact.items.get.json' },
    });
    const text = describeError(err);
    expect(text).toBe('crm.lead.contact.items.get | ECONNRESET | socket hang up');
    expect(text).not.toContain('SEGREDO123');
  });

  it('includes the HTTP status when there is a response', () => {
    const err = Object.assign(new Error('Request failed'), { response: { status: 503 } });
    expect(describeError(err)).toBe('HTTP 503 | Request failed');
  });
});

describe('maskPhone', () => {
  it('keeps only the last 4 digits', () => {
    expect(maskPhone('5561991596979')).toBe('***6979');
  });
});
