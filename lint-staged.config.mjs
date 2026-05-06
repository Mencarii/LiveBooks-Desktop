/**
 * Skip ESLint for paths ignored by .eslintrc.js (spec files, vite.config.ts,
 * and Vue files under src/components). Prettier still runs.
 */
export default {
  '*.{ts,vue}': (filenames) => {
    const eslintTargets = filenames.filter((f) => {
      if (f.endsWith('.spec.ts') || f.endsWith('vite.config.ts')) {
        return false;
      }
      if (f.endsWith('.vue') && f.includes('/src/components/')) {
        return false;
      }
      return true;
    });
    const cmds = [];
    if (eslintTargets.length > 0) {
      cmds.push(
        `eslint --fix --max-warnings 0 ${eslintTargets
          .map((f) => JSON.stringify(f))
          .join(' ')}`
      );
    }
    cmds.push(
      `prettier --write ${filenames.map((f) => JSON.stringify(f)).join(' ')}`
    );
    return cmds;
  },
  '*.{json,md,yml,yaml}': ['prettier --write'],
};
