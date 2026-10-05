import type { ReviewScreen } from "./manifest";

// What the browser sees of a registered project: no file paths, proxy
// settings, or injected headers.
export type PublicScreen = Pick<
  ReviewScreen,
  "id" | "ordinal" | "title" | "group" | "viewport" | "liveUrl"
> & { hasCapture: boolean };

export type PublicProject = {
  id: string;
  name: string;
  versions: string[];
  screens: PublicScreen[];
};

export type ProjectList = {
  projects: PublicProject[];
  problems: string[];
};

export function captureUrl(
  projectId: string,
  version: string,
  screenId: string,
) {
  return `/api/projects/${encodeURIComponent(projectId)}/captures/${encodeURIComponent(version)}/${encodeURIComponent(screenId)}`;
}
