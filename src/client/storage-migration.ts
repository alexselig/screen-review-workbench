const LEGACY_PREFIX = "screen-review-workbench";
const PREFIX = "screencheck";

// The tool was renamed from Screen Review Workbench. Copy any browser state
// saved under the old key names (unsaved drafts, collapsed sections, hidden
// pins) to the new names once, without overwriting anything newer.
export function migrateLegacyStorage(storage: Storage = localStorage) {
  const legacyKeys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(LEGACY_PREFIX)) legacyKeys.push(key);
  }
  for (const key of legacyKeys) {
    const next = PREFIX + key.slice(LEGACY_PREFIX.length);
    const value = storage.getItem(key);
    if (value !== null && storage.getItem(next) === null) {
      storage.setItem(next, value);
    }
    storage.removeItem(key);
  }
}
