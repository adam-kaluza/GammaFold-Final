import type { ModelIdentityStatus } from './types.ts';

export const REQUIRED_MODEL_ID = 'gemini-4-carbon' as const;

export interface VerifiedModelIdentity {
  status: ModelIdentityStatus;
  normalizedVersion: string | null;
  isCarbonVerified: boolean;
  isQuarantinedMismatch: boolean;
}

const DISALLOWED_MODEL_SUBSTRINGS =
  /(?:hydrogen|flash|lite|pro|ultra|nano|mock|fake|test|simulat|stub|fallback|gpt|claude)/i;

export function verifyReturnedModelIdentity(
  returnedModelVersion: string | null | undefined,
): VerifiedModelIdentity {
  if (typeof returnedModelVersion !== 'string') {
    return {
      status: 'unreported',
      normalizedVersion: null,
      isCarbonVerified: false,
      isQuarantinedMismatch: false,
    };
  }

  const trimmed = returnedModelVersion.trim();
  if (trimmed.length === 0) {
    return {
      status: 'unreported',
      normalizedVersion: null,
      isCarbonVerified: false,
      isQuarantinedMismatch: false,
    };
  }

  const strippedPrefix = trimmed.replace(/^models\//i, '');
  const lower = strippedPrefix.toLowerCase();

  const matchesCarbonFamily =
    lower === REQUIRED_MODEL_ID || /^gemini-4-carbon-[a-z0-9._-]+$/.test(lower);

  if (matchesCarbonFamily && !DISALLOWED_MODEL_SUBSTRINGS.test(lower)) {
    return {
      status: 'verified_carbon',
      normalizedVersion: trimmed,
      isCarbonVerified: true,
      isQuarantinedMismatch: false,
    };
  }

  return {
    status: 'non_carbon_mismatch',
    normalizedVersion: trimmed,
    isCarbonVerified: false,
    isQuarantinedMismatch: true,
  };
}
