import { describe, expect, it } from 'vitest';
import { buildVersionLabel } from '../src/ui/build-info';

describe('build metadata', () => {
  it('renders the injected commit and build date for tests', () => {
    expect(buildVersionLabel()).toBe('test · built test-build');
  });
});
