export interface ModuleInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  source: 'local' | 'github';
  sourceUrl?: string;
  capabilities: string[];
  status: string;
  runtimeStatus: 'loaded' | 'error' | 'not-loaded';
  runtimeError?: string;
  error?: string;
  installedAt?: number;
  updatedAt?: number;
  updateAvailable?: boolean;
  remoteVersion?: string | null;
}

export interface OfficialModule {
  id: string;
  name: string;
  description: string;
  repository: string;
  capabilities: string[];
  icon: string;
  color: string;
  setup?: { type: 'gmail-oauth' } | { type: 'navigate'; route: string };
}
