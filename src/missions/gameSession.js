import { PREPARATION_KEY, ROVER_SAVE_KEY } from './missionTransfer.js';

export function readGameSession(storage) {
  try {
    const data = JSON.parse(storage.getItem(PREPARATION_KEY));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    // Recognize saves from before the title screen had a Resume button.
    if (data.started !== true && !data.launch && !data.guideProgress?.length
      && !data.guideConversations?.length && !Object.values(data.rover ?? {}).some(Boolean)) return null;
    return data;
  } catch { return null; }
}

export function writeGameSession(storage, data) {
  try {
    storage.setItem(PREPARATION_KEY, JSON.stringify({ ...data, started: true }));
    return true;
  } catch { return false; }
}

export function clearGameSession(storage) {
  try {
    storage.removeItem(PREPARATION_KEY);
    storage.removeItem(ROVER_SAVE_KEY);
  } catch { /* storage may be unavailable */ }
}
