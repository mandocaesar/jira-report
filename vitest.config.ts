import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Pin the runner's timezone so date-boundary logic (sprint start/end day
    // cutoffs, working-day calculations) behaves identically in CI and locally,
    // regardless of the host machine's system timezone.
    env: { TZ: 'Asia/Jakarta' },
  },
  resolve: { alias: { '@': path.resolve(__dirname) } },
});
