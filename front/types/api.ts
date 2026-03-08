export interface ApiConnection {
  id: string;
  name: string;
  provider: string;
  authType: 'oauth2' | 'api_key' | 'bearer' | 'basic' | 'none';
  config: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  error?: string | null;
  lastTestedAt?: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Extended config for module-defined API connections
 */
export interface ModuleApiConfig {
  _moduleId: string;
  _configId: string;
  _fields: ConfigFieldDefinition[];
  _helpSteps?: string[];
  _helpUrl?: string;
  _helpLinks?: { label: string; url: string }[];
  _icon?: string;
  _color?: string;
  _description?: string;
  [key: string]: any; // User-entered values
}

export interface ConfigFieldDefinition {
  key: string;
  label: string;
  placeholder: string;
  type: 'string' | 'number' | 'boolean' | 'url';
  secret?: boolean;
  required?: boolean;
}

export interface ProviderTemplate {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultAuthType: ApiConnection['authType'];
  fields: {
    key: string;
    label: string;
    placeholder: string;
    secret?: boolean;
  }[];
  testUrl?: string;
  helpSteps?: string[];
  helpUrl?: string;
  helpLinks?: { label: string; url: string }[];
}

/**
 * Check if a connection is module-defined
 */
export function isModuleApiConnection(
  conn: ApiConnection,
): conn is ApiConnection & { config: ModuleApiConfig } {
  return conn.id.startsWith('module-') && conn.config?._moduleId !== undefined;
}
