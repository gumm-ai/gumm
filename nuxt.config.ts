import tailwindcss from '@tailwindcss/vite';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2024-11-01',
  devtools: { enabled: true },

  future: {
    compatibilityVersion: 4,
  },

  srcDir: 'front',
  serverDir: 'back',

  modules: ['nuxt-auth-utils', '@nuxt/icon'],

  icon: {
    mode: 'svg',
  },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    githubToken: '',
    redisUrl: '',
    session: {
      password: '',
      maxAge: 60 * 60 * 24 * 7, // 1 week
      cookie: {
        sameSite: 'strict' as const,
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  nitro: {
    preset: 'bun',
    experimental: {
      tasks: true,
    },
    scheduledTasks: {
      // Purge old events every day at 3am
      '0 3 * * *': ['cleanup:events'],
      // Health-check schedules every 15 minutes
      '*/15 * * * *': ['scheduler:healthcheck'],
    },
  },

  routeRules: {
    // Security headers on all routes
    '/**': {
      headers: {
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: https:",
          "connect-src 'self' https://openrouter.ai https://api.mistral.ai",
          "frame-ancestors 'none'",
        ].join('; '),
      },
    },
    // Block common scanner/bot probes
    '/.git/**': { redirect: { to: '/', statusCode: 404 } },
    '/.env': { redirect: { to: '/', statusCode: 404 } },
    '/.env.*': { redirect: { to: '/', statusCode: 404 } },
    '/swagger/**': { redirect: { to: '/', statusCode: 404 } },
  },
});
