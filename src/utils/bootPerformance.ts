/** Dev/profiling marks for boot timeline (Chrome Performance panel). */

const ENABLED =
  typeof performance !== 'undefined' && typeof performance.mark === 'function';

export function markBoot(name: string): void {
  if (!ENABLED) {
    return;
  }
  performance.mark(name);
}

export function measureBoot(
  name: string,
  startMark: string,
  endMark: string
): void {
  if (!ENABLED) {
    return;
  }
  try {
    performance.measure(name, startMark, endMark);
  } catch {
    /* marks may be missing if boot path aborted */
  }
}

export function markRendererAppStart(): void {
  markBoot('app-start');
}

export function markRendererMounted(): void {
  markBoot('vue-mounted');
  measureBoot('Boot: renderer → vue mounted', 'app-start', 'vue-mounted');
}

export function markSplashDismissed(): void {
  markBoot('splash-dismissed');
  measureBoot('Boot: splash dismissed', 'app-start', 'splash-dismissed');
}

export function markSetInitialScreenStart(): void {
  markBoot('set-initial-screen-start');
}

export function markSetInitialScreenEnd(): void {
  markBoot('set-initial-screen-end');
  measureBoot(
    'Boot: setInitialScreen',
    'set-initial-screen-start',
    'set-initial-screen-end'
  );
}

export function markWorkspaceReady(): void {
  markBoot('workspace-ready');
  measureBoot('Boot: workspace ready', 'app-start', 'workspace-ready');
}
