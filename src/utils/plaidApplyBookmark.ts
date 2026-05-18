import type { Fyo } from 'fyo';
import { ModelNameEnum } from 'models/types';

const FIELD = 'lastSuccessfulPlaidApplyAt';

export async function getLastSuccessfulPlaidApplyAt(
  fyo: Fyo
): Promise<string | null> {
  const value = (await fyo.getValue(ModelNameEnum.SystemSettings, FIELD)) as
    | string
    | null
    | undefined;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function setLastSuccessfulPlaidApplyAt(
  fyo: Fyo,
  iso: string
): Promise<void> {
  const settings = await fyo.doc.getDoc(ModelNameEnum.SystemSettings);
  await settings.setAndSync(FIELD, iso);
}
