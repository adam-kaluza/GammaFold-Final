import { DEFAULT_CAMPAIGN_ID, getCampaignById } from './campaigns.ts';
import type { SyntheticCampaignId } from './types.ts';

export const LOCAL_STORAGE_KEY = 'gammafold_local_state_v1';
export const LEGACY_LOCAL_STORAGE_KEY = 'gammafold_final_local_state_v1';

export interface PersistedLocalState {
  campaignId: SyntheticCampaignId;
  reviewerNotes: string;
}

type LocalStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function loadPersistedLocalState(storage: LocalStorage | (() => LocalStorage)): PersistedLocalState {
  try {
    const availableStorage = typeof storage === 'function' ? storage() : storage;
    const raw = availableStorage.getItem(LOCAL_STORAGE_KEY) ?? availableStorage.getItem(LEGACY_LOCAL_STORAGE_KEY);
    if (!raw) return { campaignId: DEFAULT_CAMPAIGN_ID, reviewerNotes: '' };
    const parsed = JSON.parse(raw) as Partial<PersistedLocalState>;
    const campaign = getCampaignById(parsed.campaignId);
    return {
      campaignId: campaign?.id ?? DEFAULT_CAMPAIGN_ID,
      reviewerNotes: typeof parsed.reviewerNotes === 'string' ? parsed.reviewerNotes.slice(0, 500) : '',
    };
  } catch {
    return { campaignId: DEFAULT_CAMPAIGN_ID, reviewerNotes: '' };
  }
}

export function savePersistedLocalState(storage: LocalStorage, state: PersistedLocalState): void {
  // Only remove the old key after its replacement has been saved successfully.
  storage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
  storage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
}

export function clearPersistedLocalState(storage: LocalStorage): void {
  storage.removeItem(LOCAL_STORAGE_KEY);
  storage.removeItem(LEGACY_LOCAL_STORAGE_KEY);
}
