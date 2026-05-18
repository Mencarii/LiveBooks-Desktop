import { readonly, ref } from 'vue';

/**
 * When true, background Plaid feed polling should pause until the user
 * completes MFA step-up (30-minute cloud window expired).
 */
const bankSyncMfaPaused = ref(false);

export function isBankSyncMfaPaused(): boolean {
  return bankSyncMfaPaused.value;
}

export function setBankSyncMfaPaused(paused: boolean): void {
  bankSyncMfaPaused.value = paused;
}

/** Reactive flag for Vue banners (e.g. BankFeedHub). */
export const bankSyncMfaPausedState = readonly(bankSyncMfaPaused);
