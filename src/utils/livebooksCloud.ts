import { t } from 'fyo';
import { showToast } from 'src/utils/interactive';
import {
  getLivebooksCloudOrigin,
  livebooksCloudRootUrl,
  livebooksCloudSignInUrl,
  livebooksCloudSignUpUrl,
  livebooksCloudSubscribeUrl,
} from './livebooksCloudUrls';

export async function getLivebooksCloudSessionSummary(): Promise<{
  signedIn: boolean;
}> {
  return await ipc.getLivebooksCloudSession();
}

/**
 * Opens the cloud sign-in page, or the cloud home when this desktop already holds API tokens
 * (no second browser login required for the desktop integration).
 */
export async function openLivebooksCloudSignIn(): Promise<void> {
  const { signedIn } = await getLivebooksCloudSessionSummary();
  if (signedIn) {
    showToast({
      type: 'success',
      message: t`Opening your LiveBooks Cloud account`,
      duration: 'short',
    });
    openLivebooksCloudHome();
    return;
  }
  ipc.openLink(livebooksCloudSignInUrl());
}

export function openLivebooksCloudSignUp(): void {
  ipc.openLink(livebooksCloudSignUpUrl());
}

export function openLivebooksCloudSubscribe(): void {
  ipc.openLink(livebooksCloudSubscribeUrl());
}

/** Opens signed-in cloud home (cookie session); user can use “Connect account to desktop app”. */
export function openLivebooksCloudHome(): void {
  ipc.openLink(livebooksCloudRootUrl());
}

export async function signOutLivebooksCloud(): Promise<void> {
  await ipc.clearLivebooksCloudSession();
}

export async function fetchLivebooksCloudSubscription(): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  return await ipc.livebooksCloudApi({
    method: 'GET',
    path: '/api/v1/me/subscription',
  });
}

export async function openLivebooksCloudBillingPortal(): Promise<{
  ok: boolean;
  status: number;
  data: unknown;
}> {
  const res = await ipc.livebooksCloudApi({
    method: 'POST',
    path: '/api/v1/me/billing_portal_session',
    body: {},
  });
  if (
    res.ok &&
    res.data &&
    typeof res.data === 'object' &&
    res.data !== null &&
    'url' in res.data
  ) {
    const url = (res.data as { url: unknown }).url;
    if (typeof url === 'string' && url.length > 0) {
      ipc.openLink(url);
    }
  }
  return res;
}

export function getLivebooksCloudOriginForDisplay(): string {
  return getLivebooksCloudOrigin();
}
