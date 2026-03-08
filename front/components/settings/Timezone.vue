<script setup lang="ts">
// ── Brain Config (for timezone) ─────────────────────────────────
const { data: brainData } = await useFetch<{
  config: Record<string, string>;
}>('/api/brain/config');

// ── Timezone ────────────────────────────────────────────────────
const commonTimezones = [
  { id: 'Pacific/Honolulu', label: 'Hawaii (HST)', offset: '-10:00' },
  { id: 'America/Anchorage', label: 'Alaska (AKST)', offset: '-09:00' },
  { id: 'America/Los_Angeles', label: 'Los Angeles (PST)', offset: '-08:00' },
  { id: 'America/Denver', label: 'Denver (MST)', offset: '-07:00' },
  { id: 'America/Chicago', label: 'Chicago (CST)', offset: '-06:00' },
  { id: 'America/New_York', label: 'New York (EST)', offset: '-05:00' },
  { id: 'America/Sao_Paulo', label: 'São Paulo (BRT)', offset: '-03:00' },
  { id: 'Atlantic/Reykjavik', label: 'Reykjavik (GMT)', offset: '+00:00' },
  { id: 'Europe/London', label: 'London (GMT)', offset: '+00:00' },
  { id: 'Europe/Paris', label: 'Paris (CET)', offset: '+01:00' },
  { id: 'Europe/Berlin', label: 'Berlin (CET)', offset: '+01:00' },
  { id: 'Europe/Madrid', label: 'Madrid (CET)', offset: '+01:00' },
  { id: 'Europe/Rome', label: 'Rome (CET)', offset: '+01:00' },
  { id: 'Europe/Amsterdam', label: 'Amsterdam (CET)', offset: '+01:00' },
  { id: 'Europe/Brussels', label: 'Brussels (CET)', offset: '+01:00' },
  { id: 'Europe/Zurich', label: 'Zurich (CET)', offset: '+01:00' },
  { id: 'Europe/Helsinki', label: 'Helsinki (EET)', offset: '+02:00' },
  { id: 'Europe/Athens', label: 'Athens (EET)', offset: '+02:00' },
  { id: 'Europe/Bucharest', label: 'Bucharest (EET)', offset: '+02:00' },
  { id: 'Europe/Istanbul', label: 'Istanbul (TRT)', offset: '+03:00' },
  { id: 'Europe/Moscow', label: 'Moscow (MSK)', offset: '+03:00' },
  { id: 'Asia/Dubai', label: 'Dubai (GST)', offset: '+04:00' },
  { id: 'Asia/Kolkata', label: 'Mumbai (IST)', offset: '+05:30' },
  { id: 'Asia/Bangkok', label: 'Bangkok (ICT)', offset: '+07:00' },
  { id: 'Asia/Singapore', label: 'Singapore (SGT)', offset: '+08:00' },
  { id: 'Asia/Shanghai', label: 'Shanghai (CST)', offset: '+08:00' },
  { id: 'Asia/Tokyo', label: 'Tokyo (JST)', offset: '+09:00' },
  { id: 'Asia/Seoul', label: 'Seoul (KST)', offset: '+09:00' },
  { id: 'Australia/Sydney', label: 'Sydney (AEST)', offset: '+10:00' },
  { id: 'Pacific/Auckland', label: 'Auckland (NZST)', offset: '+12:00' },
];

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const selectedTimezone = ref(
  brainData.value?.config?.['brain.timezone'] || detectedTimezone || 'UTC',
);
const timezoneLoading = ref(false);
const timezoneSuccess = ref(false);
const timezoneSearch = ref('');

const filteredTimezones = computed(() => {
  const q = timezoneSearch.value.toLowerCase();
  if (!q) return commonTimezones;
  return commonTimezones.filter(
    (tz) =>
      tz.id.toLowerCase().includes(q) || tz.label.toLowerCase().includes(q),
  );
});

const selectedTimezoneLabel = computed(() => {
  const found = commonTimezones.find((tz) => tz.id === selectedTimezone.value);
  return found?.label || selectedTimezone.value;
});

async function saveTimezone() {
  timezoneLoading.value = true;
  timezoneSuccess.value = false;
  try {
    await $fetch('/api/brain/config', {
      method: 'PUT',
      body: { key: 'brain.timezone', value: selectedTimezone.value },
    });
    timezoneSuccess.value = true;
    setTimeout(() => (timezoneSuccess.value = false), 3000);
  } finally {
    timezoneLoading.value = false;
  }
}
</script>

<template>
  <section
    class="rounded-xl border border-gumm-border bg-gumm-surface p-4 max-w-lg"
  >
    <div class="flex items-center gap-2 mb-1">
      <Icon name="lucide:clock" class="h-4 w-4 text-gumm-accent" />
      <h2 class="text-sm font-semibold">Timezone</h2>
    </div>
    <p class="text-xs text-gumm-muted mb-3">
      Used for scheduling tasks, reminders and cron jobs.
    </p>

    <div class="space-y-3">
      <!-- Search + Select -->
      <div>
        <input
          v-model="timezoneSearch"
          type="text"
          placeholder="Search timezone..."
          class="w-full rounded-md border border-gumm-border bg-gumm-bg px-3 py-2 text-sm text-gumm-text placeholder-gumm-muted outline-none transition-colors focus:border-gumm-border-hover focus:ring-1 focus:ring-gumm-border-hover mb-2"
        />
        <div
          class="max-h-48 overflow-y-auto rounded-md border border-gumm-border bg-gumm-bg"
        >
          <button
            v-for="tz in filteredTimezones"
            :key="tz.id"
            type="button"
            class="flex w-full items-center justify-between px-3 py-1.5 text-sm transition-colors hover:bg-white/5"
            :class="
              selectedTimezone === tz.id
                ? 'bg-gumm-accent/10 text-gumm-accent'
                : 'text-gumm-text'
            "
            @click="selectedTimezone = tz.id"
          >
            <span>{{ tz.label }}</span>
            <span class="text-xs text-gumm-muted">{{ tz.id }}</span>
          </button>
          <p
            v-if="filteredTimezones.length === 0"
            class="px-3 py-2 text-xs text-gumm-muted"
          >
            No matching timezone
          </p>
        </div>
      </div>

      <!-- Current selection -->
      <div
        class="flex items-center gap-2 text-xs text-gumm-muted bg-gumm-bg rounded-md px-3 py-2"
      >
        <Icon name="lucide:map-pin" class="h-3 w-3 shrink-0" />
        <span
          >Selected:
          <strong class="text-gumm-text">{{
            selectedTimezoneLabel
          }}</strong></span
        >
      </div>

      <!-- Success -->
      <div
        v-if="timezoneSuccess"
        class="flex items-center gap-1.5 text-xs text-green-400 bg-green-500/10 rounded-md px-3 py-2"
      >
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Timezone saved — schedules will use the new timezone.
      </div>

      <button
        type="button"
        :disabled="timezoneLoading"
        class="flex items-center gap-2 rounded-md bg-white text-black px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
        @click="saveTimezone"
      >
        <Icon
          v-if="timezoneLoading"
          name="lucide:loader"
          class="h-3.5 w-3.5 animate-spin"
        />
        <Icon v-else name="lucide:save" class="h-3.5 w-3.5" />
        {{ timezoneLoading ? 'Saving...' : 'Save Timezone' }}
      </button>
    </div>
  </section>
</template>
