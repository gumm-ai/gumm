// Google Fit API base URL
export const FIT_API = 'https://www.googleapis.com/fitness/v1/users/me';

// Google OAuth token endpoint
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Google Fit data type names
export const DATA_TYPES = {
  steps: 'com.google.step_count.delta',
  calories: 'com.google.calories.expended',
  distance: 'com.google.distance.delta',
  activeMinutes: 'com.google.active_minutes',
  heartRate: 'com.google.heart_rate.bpm',
  weight: 'com.google.weight',
  height: 'com.google.height',
  bodyFat: 'com.google.body.fat.percentage',
  sleep: 'com.google.sleep.segment',
} as const;

// Sleep stage labels from Google Fit
export const SLEEP_STAGES: Record<number, string> = {
  0: 'Unspecified',
  1: 'Awake (during sleep)',
  2: 'Sleep',
  3: 'Out of bed',
  4: 'Light sleep',
  5: 'Deep sleep',
  6: 'REM',
};
