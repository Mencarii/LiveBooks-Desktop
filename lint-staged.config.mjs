/**
 * Skip ESLint for *.spec.ts (still ignored by .eslintrc.js); Prettier still runs.
 */
export default {
  '*.{ts,vue}': (filenames) => {
    const eslintTargets = filenames.filter((f) => !f.endsWith('.spec.ts'));
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
