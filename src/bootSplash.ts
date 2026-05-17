const BOOT_SPLASH_ID = 'boot-splash';

export function isBootSplashVisible(): boolean {
  return !!document.getElementById(BOOT_SPLASH_ID);
}

/** Update subtitle while HTML splash is still up (auto-open path). */
export function setBootSplashSubtitle(message: string): void {
  const el = document.getElementById('boot-splash');
  const subtitle = el?.querySelector('[data-boot-subtitle]');
  if (subtitle) {
    subtitle.textContent = message;
  }
}

/** Wait for the next composited frame so route DOM is painted before splash removal. */
export async function waitForNextPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Hide the static boot splash after optional minimum visible time. */
export async function dismissBootSplash(
  minVisibleMs = 0,
  startedAt = Date.now()
): Promise<void> {
  const el = document.getElementById(BOOT_SPLASH_ID);
  if (!el) {
    return;
  }

  const elapsed = Date.now() - startedAt;
  if (elapsed < minVisibleMs) {
    await new Promise((resolve) => setTimeout(resolve, minVisibleMs - elapsed));
  }

  el.remove();
}
