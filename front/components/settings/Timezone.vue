<script setup lang="ts">
const { data: brainData } = await useFetch<{ config: Record<string, string> }>('/api/brain/config');

const commonTimezones = [
  { id: 'Pacific/Honolulu', label: 'Hawaii', offset: '-10:00' },
  { id: 'America/Los_Angeles', label: 'Los Angeles', offset: '-08:00' },
  { id: 'America/Denver', label: 'Denver', offset: '-07:00' },
  { id: 'America/Chicago', label: 'Chicago', offset: '-06:00' },
  { id: 'America/New_York', label: 'New York', offset: '-05:00' },
  { id: 'America/Sao_Paulo', label: 'São Paulo', offset: '-03:00' },
  { id: 'Europe/London', label: 'London', offset: '+00:00' },
  { id: 'Europe/Paris', label: 'Paris', offset: '+01:00' },
  { id: 'Europe/Berlin', label: 'Berlin', offset: '+01:00' },
  { id: 'Europe/Madrid', label: 'Madrid', offset: '+01:00' },
  { id: 'Europe/Rome', label: 'Rome', offset: '+01:00' },
  { id: 'Europe/Athens', label: 'Athens', offset: '+02:00' },
  { id: 'Europe/Istanbul', label: 'Istanbul', offset: '+03:00' },
  { id: 'Asia/Dubai', label: 'Dubai', offset: '+04:00' },
  { id: 'Asia/Kolkata', label: 'Mumbai', offset: '+05:30' },
  { id: 'Asia/Bangkok', label: 'Bangkok', offset: '+07:00' },
  { id: 'Asia/Singapore', label: 'Singapore', offset: '+08:00' },
  { id: 'Asia/Shanghai', label: 'Shanghai', offset: '+08:00' },
  { id: 'Asia/Tokyo', label: 'Tokyo', offset: '+09:00' },
  { id: 'Australia/Sydney', label: 'Sydney', offset: '+10:00' },
  { id: 'Pacific/Auckland', label: 'Auckland', offset: '+12:00' },
];

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const selectedTimezone = ref(brainData.value?.config?.['brain.timezone'] || detectedTimezone || 'UTC');
const timezoneLoading = ref(false);
const timezoneSuccess = ref(false);
const timezoneSearch = ref('');

const filteredTimezones = computed(() => {
  const q = timezoneSearch.value.toLowerCase();
  if (!q) return commonTimezones;
  return commonTimezones.filter((tz) => tz.id.toLowerCase().includes(q) || tz.label.toLowerCase().includes(q));
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
  <section class="rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden">
    <div class="flex items-center gap-3 px-5 py-4 border-b border-white/[0.04]">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04]">
        <Icon name="lucide:clock" class="h-4 w-4 text-white/50" />
      </div>
      <div>
        <h2 class="text-sm font-medium text-white">Timezone</h2>
        <p class="text-[11px] text-white/40">For schedules & reminders</p>
      </div>
    </div>

    <div class="p-4 space-y-3">
      <input
        v-model="timezoneSearch"
        type="text"
        placeholder="Search timezone..."
        class="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white outline-none transition-all focus:border-white/20 placeholder:text-white/30"
      />

      <div class="max-h-40 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.02]">
        <button
          v-for="tz in filteredTimezones"
          :key="tz.id"
          type="button"
          class="flex w-full items-center justify-between px-3 py-1.5 text-xs transition-all hover:bg-white/[0.04]"
          :class="selectedTimezone === tz.id ? 'bg-white/[0.08] text-white' : 'text-white/70'"
          @click="selectedTimezone = tz.id"
        >
          <span>{{ tz.label }}</span>
          <span class="text-white/40 font-mono text-[10px]">{{ tz.offset }}</span>
        </button>
        <p v-if="filteredTimezones.length === 0" class="px-3 py-2 text-xs text-white/40">No match</p>
      </div>

      <div class="flex items-center gap-2 text-xs text-white/40 bg-white/[0.02] rounded-lg px-3 py-2">
        <Icon name="lucide:map-pin" class="h-3 w-3 shrink-0" />
        <span>Selected: <strong class="text-white/70">{{ selectedTimezoneLabel }}</strong></span>
      </div>

      <div v-if="timezoneSuccess" class="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-2">
        <Icon name="lucide:check-circle" class="h-3.5 w-3.5 shrink-0" />
        Timezone saved
      </div>

      <button
        type="button"
        :disabled="timezoneLoading"
        class="flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-xs font-medium transition-all hover:bg-white/90 disabled:opacity-40"
        @click="saveTimezone"
      >
        <Icon :name="timezoneLoading ? 'lucide:loader-2' : 'lucide:save'" class="h-3.5 w-3.5" :class="{ 'animate-spin': timezoneLoading }" />
        {{ timezoneLoading ? 'Saving...' : 'Save' }}
      </button>
    </div>
  </section>
</template>
