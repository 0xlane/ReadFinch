export const PROJECT_URL = "https://github.com/0xlane/ReadFinch";
export const RELEASES_URL = PROJECT_URL + "/releases";
export const UPDATE_PROXY = "https://gh-proxy.com/";
export const UPDATE_MANIFEST = "readfinch-update.json";
export const projectLinks = {
  repository: PROJECT_URL,
  providerDocs: "https://ai-sdk.dev/providers/ai-sdk-providers",
  issues: PROJECT_URL + "/issues/new/choose",
  releases: RELEASES_URL,
  license: PROJECT_URL + "/blob/main/LICENSE",
  credits: PROJECT_URL + "/blob/main/THIRD_PARTY_NOTICES.md",
} as const;
export type ProjectLink = keyof typeof projectLinks;
export type UpdateSource = "github" | "gh-proxy";
export type UpdateKind = "nsis" | "portable" | "AppImage" | "deb" | "dmg";
export type UpdateStatus =
  | "idle"
  | "checking"
  | "latest"
  | "available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "error";
export type UpdateState = {
  status: UpdateStatus;
  automatic: boolean;
  currentVersion: string;
  availableVersion?: string;
  releaseDate?: string;
  notes?: string;
  checkedAt?: string;
  source: UpdateSource;
  installMode: "automatic" | "restart" | "manual" | "development";
  platform: string;
  arch: string;
  error?: string;
  progress?: {
    percent: number;
    transferred: number;
    total: number;
    bytesPerSecond: number;
  };
};
