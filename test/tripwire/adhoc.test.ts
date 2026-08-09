import { describe, it, expect } from 'vitest';
import { isAdhocIssue } from '@/lib/em-report';
import { makeIssue } from '../helpers/issue';

describe('isAdhocIssue tripwires', () => {
  it('matches adhoc label case-insensitively', () => {
    expect(isAdhocIssue(makeIssue({ labels: ['AdHoc'] }))).toBe(true);
  });
  it('matches [ADHOC] in summary', () => {
    expect(isAdhocIssue(makeIssue({ summary: '[ADHOC] Sprint 12 support' }))).toBe(true);
  });
  it('matches ad-hoc in summary', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'QA ad-hoc regression run' }))).toBe(true);
  });
  it('does not match adhocracy (word boundary)', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'study adhocracy patterns' }))).toBe(false);
  });
  it('plain issue is not adhoc', () => {
    expect(isAdhocIssue(makeIssue({ summary: 'Implement transfer API' }))).toBe(false);
  });
});
