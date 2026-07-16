import { describe, expect, it } from 'vitest';

import { getLoginErrorMessage } from './errorMessages';

describe('getLoginErrorMessage', () => {
  it('returns null when there is no error code', () => {
    expect(getLoginErrorMessage(undefined)).toBeNull();
  });

  it('returns a specific message for confirmation-failed', () => {
    expect(getLoginErrorMessage('confirmation-failed')).toMatch(/invalid or has expired/i);
  });

  it('returns a specific message for confirmation-link-invalid', () => {
    expect(getLoginErrorMessage('confirmation-link-invalid')).toMatch(/missing information/i);
  });

  it('distinguishes the two known codes with different messages', () => {
    const failed = getLoginErrorMessage('confirmation-failed');
    const invalid = getLoginErrorMessage('confirmation-link-invalid');
    expect(failed).not.toEqual(invalid);
  });

  it('falls back to a generic message for an unrecognized code, rather than nothing', () => {
    const message = getLoginErrorMessage('some-future-error-code');
    expect(message).not.toBeNull();
    expect(message).toMatch(/something went wrong/i);
  });
});
