import type {
  ProviderTemplate,
  ApiConnection,
  ModuleApiConfig,
} from '~/types/api';

export const providers: ProviderTemplate[] = [
  {
    id: 'google',
    name: 'Google',
    icon: 'simple-icons:google',
    color: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    defaultAuthType: 'oauth2',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'xxxxxxxx.apps.googleusercontent.com',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'GOCSPX-…',
        secret: true,
      },
    ],
    helpUrl: 'https://console.cloud.google.com/apis/credentials',
    helpSteps: [
      'Go to Google Cloud Console → Credentials',
      'Create a project (or select an existing one)',
      'Click "+ Create Credentials" → "OAuth client ID"',
      'Application type: "Web application"',
      'Add your Gumm callback URL as an authorized redirect URI',
      'Enable the APIs you need using the links below',
      'Copy the Client ID and Client Secret',
    ],
    helpLinks: [
      {
        label: 'Enable Gmail API',
        url: 'https://console.cloud.google.com/apis/library/gmail.googleapis.com',
      },
      {
        label: 'Enable Google Calendar API',
        url: 'https://console.cloud.google.com/apis/library/calendar-json.googleapis.com',
      },
      {
        label: 'Enable YouTube Data API',
        url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
      },
      {
        label: 'Enable Google Fitness API',
        url: 'https://console.cloud.google.com/apis/library/fitness.googleapis.com',
      },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: 'simple-icons:openai',
    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    defaultAuthType: 'bearer',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-…', secret: true },
    ],
    helpUrl: 'https://platform.openai.com/api-keys',
    helpSteps: [
      'Go to platform.openai.com and sign in',
      'Navigate to API Keys in the left sidebar',
      'Click "Create new secret key"',
      'Copy the key (it starts with sk-)',
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    icon: 'simple-icons:anthropic',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'sk-ant-…',
        secret: true,
      },
    ],
    helpUrl: 'https://console.anthropic.com/settings/keys',
    helpSteps: [
      'Go to console.anthropic.com and sign in',
      'Navigate to Settings → API Keys',
      'Click "Create Key"',
      'Copy the key (it starts with sk-ant-)',
    ],
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    icon: 'lucide:shuffle',
    color: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    defaultAuthType: 'bearer',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'sk-or-…', secret: true },
    ],
    helpUrl: 'https://openrouter.ai/keys',
    helpSteps: [
      'Go to openrouter.ai and sign in',
      'Navigate to Keys in your account',
      'Click "Create Key"',
      'Copy the key (it starts with sk-or-)',
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'simple-icons:github',
    color: 'text-slate-300 bg-slate-500/10 border-slate-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Personal Access Token',
        placeholder: 'ghp_…',
        secret: true,
      },
    ],
    helpUrl: 'https://github.com/settings/tokens',
    helpSteps: [
      'Go to GitHub → Settings → Developer settings',
      'Click "Personal access tokens" → "Fine-grained tokens"',
      'Click "Generate new token"',
      'Select the repositories and permissions you need',
      'Copy the token (it starts with ghp_)',
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: 'simple-icons:telegram',
    color: 'text-sky-400 bg-sky-500/10 border-sky-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'Bot Token',
        placeholder: '123456:ABC-DEF…',
        secret: true,
      },
    ],
    helpSteps: [
      'Open Telegram and search for @BotFather',
      'Send /newbot and follow the instructions',
      'Choose a name and username for your bot',
      'Copy the bot token (format: 123456:ABC-DEF…)',
    ],
  },
  {
    id: 'tailscale',
    name: 'Tailscale',
    icon: 'simple-icons:tailscale',
    color: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'tskey-api-…',
        secret: true,
      },
      {
        key: 'tailnet',
        label: 'Tailnet',
        placeholder: 'your-tailnet.ts.net',
      },
    ],
    helpUrl: 'https://login.tailscale.com/admin/settings/keys',
    helpSteps: [
      'Go to Tailscale Admin Console → Settings → Keys',
      'Click "Generate API key"',
      'Copy the key (it starts with tskey-api-)',
      'Your tailnet name is in Settings → General',
    ],
  },
  {
    id: 'netbird',
    name: 'NetBird',
    icon: 'lucide:shield-check',
    color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'setupKey',
        label: 'Setup Key',
        placeholder: 'Your NetBird setup key',
        secret: true,
      },
    ],
    helpUrl: 'https://app.netbird.io/setup-keys',
    helpSteps: [
      'Go to NetBird Dashboard at app.netbird.io',
      'Navigate to Setup Keys',
      'Click "Create Setup Key"',
      'Copy the generated key',
    ],
  },
  {
    id: 'openweather',
    name: 'OpenWeather',
    icon: 'lucide:cloud-sun',
    color: 'text-orange-300 bg-orange-500/10 border-orange-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'Your OpenWeather API key',
        secret: true,
      },
    ],
    helpUrl: 'https://home.openweathermap.org/api_keys',
    helpSteps: [
      'Go to openweathermap.org and create an account',
      'Navigate to your profile → API Keys',
      'Copy your default key or generate a new one',
    ],
  },
  {
    id: 'spotify',
    name: 'Spotify',
    icon: 'simple-icons:spotify',
    color: 'text-green-400 bg-green-500/10 border-green-500/20',
    defaultAuthType: 'oauth2',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Your Spotify Client ID',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Your Spotify Client Secret',
        secret: true,
      },
    ],
    helpUrl: 'https://developer.spotify.com/dashboard',
    helpSteps: [
      'Go to developer.spotify.com/dashboard and sign in',
      'Click "Create App"',
      'In the app settings, add this redirect URI: https://<your-gumm-domain>/api/spotify/callback',
      'Copy the Client ID and Client Secret from the app settings',
    ],
  },
  {
    id: 'ytmusic',
    name: 'YouTube Music',
    icon: 'simple-icons:youtubemusic',
    color: 'text-red-400 bg-red-500/10 border-red-500/20',
    defaultAuthType: 'oauth2',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Your Google Client ID',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Your Google Client Secret',
        secret: true,
      },
    ],
    helpSteps: [
      'Uses the same Google OAuth credentials as Google API',
      'If you already set up Google, use the same Client ID & Secret',
      'Make sure the YouTube Data API v3 is enabled (link below)',
    ],
    helpLinks: [
      {
        label: 'Enable YouTube Data API',
        url: 'https://console.cloud.google.com/apis/library/youtube.googleapis.com',
      },
    ],
  },
  {
    id: 'steam',
    name: 'Steam',
    icon: 'simple-icons:steam',
    color: 'text-slate-200 bg-slate-500/10 border-slate-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'Web API Key',
        placeholder: 'Your Steam Web API key',
        secret: true,
      },
      {
        key: 'steamId',
        label: 'Steam ID',
        placeholder: '76561198…',
      },
    ],
    helpUrl: 'https://steamcommunity.com/dev/apikey',
    helpSteps: [
      'Go to steamcommunity.com/dev/apikey',
      'Sign in with your Steam account',
      'Register a domain name (can be localhost for testing)',
      'Copy your API Key',
      'Find your Steam ID on your profile URL or use steamid.io',
    ],
  },
  {
    id: 'discord',
    name: 'Discord',
    icon: 'simple-icons:discord',
    color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Bot Token',
        placeholder: 'Your Discord bot token',
        secret: true,
      },
    ],
    helpUrl: 'https://discord.com/developers/applications',
    helpSteps: [
      'Go to Discord Developer Portal → Applications',
      'Click "New Application" and give it a name',
      'Go to the Bot section and click "Add Bot"',
      'Click "Reset Token" to reveal and copy the bot token',
      'Enable the intents you need under Privileged Gateway Intents',
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'simple-icons:notion',
    color: 'text-slate-100 bg-slate-500/10 border-slate-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Integration Token',
        placeholder: 'ntn_…',
        secret: true,
      },
    ],
    helpUrl: 'https://www.notion.so/my-integrations',
    helpSteps: [
      'Go to notion.so/my-integrations',
      'Click "+ New integration"',
      'Give it a name and select the workspace',
      'Copy the Internal Integration Secret (starts with ntn_)',
      'Share the Notion pages you want to access with this integration',
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: 'simple-icons:slack',
    color: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Bot Token',
        placeholder: 'xoxb-…',
        secret: true,
      },
    ],
    helpUrl: 'https://api.slack.com/apps',
    helpSteps: [
      'Go to api.slack.com/apps and click "Create New App"',
      'Choose "From scratch" and select your workspace',
      'Go to OAuth & Permissions and add the scopes you need',
      'Click "Install to Workspace" and authorize',
      'Copy the Bot User OAuth Token (starts with xoxb-)',
    ],
  },
  {
    id: 'twitter',
    name: 'X / Twitter',
    icon: 'simple-icons:x',
    color: 'text-sky-300 bg-sky-500/10 border-sky-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Bearer Token',
        placeholder: 'Your X API Bearer Token',
        secret: true,
      },
    ],
    helpUrl: 'https://developer.x.com/en/portal/dashboard',
    helpSteps: [
      'Go to developer.x.com and sign up for a developer account',
      'Create a new Project and App',
      'Go to Keys and Tokens in your App settings',
      'Generate and copy the Bearer Token',
    ],
  },
  {
    id: 'linear',
    name: 'Linear',
    icon: 'simple-icons:linear',
    color: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
    defaultAuthType: 'api_key',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key',
        placeholder: 'lin_api_…',
        secret: true,
      },
    ],
    helpUrl: 'https://linear.app/settings/api',
    helpSteps: [
      'Go to Linear → Settings → API',
      'Click "Create key" under Personal API keys',
      'Give it a label and copy the key (starts with lin_api_)',
    ],
  },
  {
    id: 'twitch',
    name: 'Twitch',
    icon: 'simple-icons:twitch',
    color: 'text-purple-300 bg-purple-500/10 border-purple-500/20',
    defaultAuthType: 'oauth2',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Your Twitch Client ID',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Your Twitch Client Secret',
        secret: true,
      },
    ],
    helpUrl: 'https://dev.twitch.tv/console/apps',
    helpSteps: [
      'Go to dev.twitch.tv/console and sign in',
      'Click "Register Your Application"',
      'Set the OAuth redirect URL to your Gumm callback',
      'Choose a category and click "Create"',
      'Copy the Client ID, then click "New Secret" for the Client Secret',
    ],
  },
  {
    id: 'homeassistant',
    name: 'Home Assistant',
    icon: 'simple-icons:homeassistant',
    color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Long-Lived Access Token',
        placeholder: 'eyJ…',
        secret: true,
      },
      {
        key: 'baseUrl',
        label: 'Instance URL',
        placeholder: 'http://homeassistant.local:8123',
      },
    ],
    helpSteps: [
      'Open your Home Assistant instance',
      'Click your profile picture (bottom-left)',
      'Scroll to "Long-Lived Access Tokens"',
      'Click "Create Token", give it a name',
      'Copy the token (starts with eyJ…)',
    ],
  },
  {
    id: 'replicate',
    name: 'Replicate',
    icon: 'simple-icons:replicate',
    color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'API Token',
        placeholder: 'r8_…',
        secret: true,
      },
    ],
    helpUrl: 'https://replicate.com/account/api-tokens',
    helpSteps: [
      'Go to replicate.com and sign in',
      'Navigate to Account → API Tokens',
      'Copy your token (starts with r8_)',
    ],
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    icon: 'simple-icons:cloudflare',
    color: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'API Token',
        placeholder: 'Your Cloudflare API token',
        secret: true,
      },
    ],
    helpUrl: 'https://dash.cloudflare.com/profile/api-tokens',
    helpSteps: [
      'Go to Cloudflare Dashboard → Profile → API Tokens',
      'Click "Create Token"',
      'Use a template or create a custom token',
      'Copy the token after creation',
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: 'simple-icons:stripe',
    color: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'Secret Key',
        placeholder: 'sk_live_… or sk_test_…',
        secret: true,
      },
    ],
    helpUrl: 'https://dashboard.stripe.com/apikeys',
    helpSteps: [
      'Go to Stripe Dashboard → Developers → API Keys',
      'Copy the Secret key (starts with sk_live_ or sk_test_)',
      'Use test mode keys for development',
    ],
  },
  {
    id: 'custom',
    name: 'Custom',
    icon: 'lucide:wrench',
    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    defaultAuthType: 'bearer',
    fields: [
      {
        key: 'apiKey',
        label: 'API Key / Token',
        placeholder: 'Your API key or token',
        secret: true,
      },
      {
        key: 'baseUrl',
        label: 'Base URL',
        placeholder: 'https://api.example.com',
      },
      {
        key: 'headerName',
        label: 'Auth Header Name',
        placeholder: 'Authorization',
      },
      {
        key: 'testUrl',
        label: 'Test Endpoint (optional)',
        placeholder: 'https://api.example.com/health',
      },
    ],
  },
];

export function providerTemplate(id: string): ProviderTemplate | undefined {
  return providers.find((p) => p.id === id);
}

export function statusColor(status: string): string {
  if (status === 'connected') return 'bg-emerald-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-slate-500';
}

/**
 * Convert a module-defined API connection to a ProviderTemplate.
 * This allows module configs to be displayed using the same UI as built-in providers.
 */
export function moduleConfigToProvider(
  connection: ApiConnection & { config: ModuleApiConfig },
): ProviderTemplate {
  const config = connection.config;

  return {
    id: connection.id,
    name: config._description
      ? `${connection.name} - ${config._description}`
      : connection.name,
    icon: config._icon || 'lucide:puzzle',
    color:
      config._color || 'text-purple-400 bg-purple-500/10 border-purple-500/20',
    defaultAuthType: connection.authType,
    fields: (config._fields || []).map((field) => ({
      key: field.key,
      label: field.label,
      placeholder: field.placeholder || '',
      secret: field.secret,
    })),
    helpSteps: config._helpSteps,
    helpUrl: config._helpUrl,
    helpLinks: config._helpLinks,
  };
}

/**
 * Check if a connection is a module-defined config.
 */
export function isModuleConnection(connection: ApiConnection): boolean {
  return (
    connection.id.startsWith('module-') &&
    connection.config?._moduleId !== undefined
  );
}

/**
 * Get the provider template for a connection.
 * For module configs, dynamically generates a template from the config metadata.
 * For built-in providers, returns the static template.
 */
export function getProviderForConnection(
  connection: ApiConnection,
): ProviderTemplate | undefined {
  if (isModuleConnection(connection)) {
    return moduleConfigToProvider(
      connection as ApiConnection & { config: ModuleApiConfig },
    );
  }
  return providerTemplate(connection.provider);
}

export function statusBorder(status: string): string {
  if (status === 'connected') return 'border-emerald-500/20';
  if (status === 'error') return 'border-red-500/20';
  return 'border-gumm-border';
}

export function formatDate(ts?: number | null): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString();
}

export const authTypeLabels: Record<string, string> = {
  oauth2: 'OAuth 2.0',
  api_key: 'API Key',
  bearer: 'Bearer Token',
  basic: 'Basic Auth',
  none: 'No Auth',
};
