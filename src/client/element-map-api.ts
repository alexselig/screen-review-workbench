import {
  elementMapKey,
  elementMapSchema,
  type ElementMap,
} from "../shared/elements";

// One request per project/version/screen. A missing map is a normal state
// (older captures have none), so every failure resolves to null.
const cache = new Map<string, Promise<ElementMap | null>>();

export function fetchElementMap(
  projectId: string,
  version: string,
  screenId: string,
): Promise<ElementMap | null> {
  const key = `${projectId}\0${elementMapKey(version, screenId)}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const url = `/api/projects/${encodeURIComponent(projectId)}/elements/${encodeURIComponent(version)}/${encodeURIComponent(screenId)}`;
  const pending = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        // Only a definite 404 is remembered; anything else may recover.
        if (response.status !== 404) cache.delete(key);
        return null;
      }
      const parsed = elementMapSchema.safeParse(await response.json());
      return parsed.success ? parsed.data : null;
    } catch {
      cache.delete(key);
      return null;
    }
  })();
  cache.set(key, pending);
  return pending;
}

export function clearElementMapCache() {
  cache.clear();
}

// Maps for several screens of one version, keyed "version/screenId".
export async function fetchElementMaps(
  projectId: string,
  version: string,
  screenIds: readonly string[],
) {
  const maps: Record<string, ElementMap> = {};
  await Promise.all(
    [...new Set(screenIds)].map(async (screenId) => {
      const map = await fetchElementMap(projectId, version, screenId);
      if (map) maps[elementMapKey(version, screenId)] = map;
    }),
  );
  return maps;
}
