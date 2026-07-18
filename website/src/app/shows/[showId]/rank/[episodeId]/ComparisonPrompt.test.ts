import { describe, expect, it } from 'vitest';

import { resultForClickedSide } from './ComparisonPrompt';

describe('resultForClickedSide', () => {
  it('maps clicking the subject poster to "better" (the subject was better than the reference)', () => {
    expect(resultForClickedSide('subject')).toEqual('better');
  });

  it('maps clicking the reference poster to "worse" (the subject was worse than the reference)', () => {
    expect(resultForClickedSide('reference')).toEqual('worse');
  });
});
