<script setup lang="ts">
definePageMeta({ layout: 'default' });

interface UsageData {
  balance: {
    total: number;
    used: number;
    remaining: number;
  } | null;
  periods: {
    today: { cost: number; tokens: { prompt: number; completion: number } };
    week: { cost: number; tokens: { prompt: number; completion: number } };
    month: { cost: number; tokens: { prompt: number; completion: number } };
  };
  dailySeries: Array<{ date: string; cost: number }>;
  modelBreakdown: Array<{
    model: string;
    cost: number;
    requests: number;
    tokensPrompt: number;
    tokensCompletion: number;
  }>;
}

const {
  data: usage,
  status,
  refresh,
} = await useFetch<UsageData>('/api/brain/openrouter-credits');

const loading = computed(() => status.value === 'pending');

// Format helpers
function usd(val: number | undefined | null): string {
  if (val == null) return '—';
  return `$${val.toFixed(4)}`;
}

function usdShort(val: number | undefined | null): string {
  if (val == null) return '—';
  if (val >= 1) return `$${val.toFixed(2)}`;
  return `$${val.toFixed(4)}`;
}

function tokens(val: number | undefined | null): string {
  if (val == null) return '—';
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(1)}k`;
  return val.toString();
}

function shortModel(name: string): string {
  // "google/gemini-3-flash-preview" → "gemini-3-flash-preview"
  return name.includes('/') ? name.split('/').pop()! : name;
}

// Chart: compute bar heights from dailySeries
const maxDailyCost = computed(() => {
  if (!usage.value?.dailySeries?.length) return 0;
  return Math.max(...usage.value.dailySeries.map((d) => d.cost), 0.0001);
});

function barHeight(cost: number): string {
  const pct = (cost / maxDailyCost.value) * 100;
  return `${Math.max(pct, 1)}%`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Balance percentage
const balancePct = computed(() => {
  if (!usage.value?.balance) return 0;
  const { total, remaining } = usage.value.balance;
  if (total <= 0) return 0;
  return Math.round((remaining / total) * 100);
});

const balanceColor = computed(() => {
  const pct = balancePct.value;
  if (pct > 50) return 'text-emerald-400';
  if (pct > 20) return 'text-amber-400';
  return 'text-red-400';
});

const balanceBarColor = computed(() => {
  const pct = balancePct.value;
  if (pct > 50) return 'bg-emerald-500';
  if (pct > 20) return 'bg-amber-500';
  return 'bg-red-500';
});

// Period cards config
const periodCards = computed(() => [
  {
    label: 'Today',
    cost: usage.value?.periods?.today?.cost ?? 0,
    tokens: usage.value?.periods?.today?.tokens,
    icon: 'lucide:calendar-clock',
    gradient: 'from-indigo-500/10 to-violet-500/10',
    iconColor: 'text-indigo-400',
  },
  {
    label: 'This Week',
    cost: usage.value?.periods?.week?.cost ?? 0,
    tokens: usage.value?.periods?.week?.tokens,
    icon: 'lucide:calendar-range',
    gradient: 'from-cyan-500/10 to-blue-500/10',
    iconColor: 'text-cyan-400',
  },
  {
    label: 'This Month',
    cost: usage.value?.periods?.month?.cost ?? 0,
    tokens: usage.value?.periods?.month?.tokens,
    icon: 'lucide:calendar',
    gradient: 'from-amber-500/10 to-orange-500/10',
    iconColor: 'text-amber-400',
  },
]);
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- Header -->
    <header
      class="flex items-center justify-between border-b border-gumm-border px-4 py-2.5"
    >
      <div class="flex items-center gap-2.5">
        <NuxtLink
          to="/isles"
          class="flex items-center gap-1 text-gumm-muted transition-colors hover:text-gumm-text"
        >
          <Icon name="lucide:arrow-left" class="h-3.5 w-3.5" />
        </NuxtLink>
        <Icon name="lucide:activity" class="h-4 w-4 text-amber-400" />
        <h1 class="text-base font-semibold">OpenRouter Credits</h1>
      </div>
      <button
        class="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gumm-muted transition-colors hover:bg-white/5 hover:text-gumm-text"
        :disabled="loading"
        @click="refresh()"
      >
        <Icon
          name="lucide:refresh-cw"
          class="h-3 w-3"
          :class="{ 'animate-spin': loading }"
        />
        Refresh
      </button>
    </header>

    <div class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Loading state -->
      <div
        v-if="loading && !usage"
        class="flex items-center justify-center py-20"
      >
        <Icon
          name="lucide:loader-2"
          class="h-5 w-5 animate-spin text-gumm-muted"
        />
      </div>

      <!-- Error state: no API key -->
      <div
        v-else-if="!usage"
        class="rounded-xl border border-gumm-border bg-gumm-surface p-6 text-center"
      >
        <Icon name="lucide:key" class="mx-auto h-8 w-8 text-gumm-muted mb-3" />
        <p class="text-sm text-gumm-muted">
          OpenRouter API key not configured.
        </p>
        <NuxtLink
          to="/brain"
          class="mt-2 inline-flex items-center gap-1 text-xs text-gumm-accent hover:underline"
        >
          <Icon name="lucide:settings" class="h-3 w-3" />
          Configure in Brain settings
        </NuxtLink>
      </div>

      <template v-else>
        <!-- Balance Card -->
        <section
          v-if="usage.balance"
          class="rounded-xl border border-gumm-border bg-gumm-surface p-4"
        >
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:wallet" class="h-4 w-4 text-emerald-400" />
            <h2 class="text-sm font-semibold">Balance</h2>
          </div>

          <div class="flex items-end gap-6 mb-3">
            <div>
              <p class="text-2xl font-bold" :class="balanceColor">
                {{ usdShort(usage.balance.remaining) }}
              </p>
              <p class="text-xs text-gumm-muted mt-0.5">remaining</p>
            </div>
            <div>
              <p class="text-sm text-gumm-muted">
                {{ usdShort(usage.balance.used) }}
                <span class="text-xs">used</span>
              </p>
              <p class="text-xs text-gumm-muted">
                of {{ usdShort(usage.balance.total) }} total
              </p>
            </div>
          </div>

          <!-- Progress bar -->
          <div class="h-1.5 w-full rounded-full bg-white/5">
            <div
              class="h-full rounded-full transition-all duration-300"
              :class="balanceBarColor"
              :style="{ width: `${balancePct}%` }"
            />
          </div>
        </section>

        <!-- Period Cards -->
        <section class="grid grid-cols-3 gap-3">
          <div
            v-for="period in periodCards"
            :key="period.label"
            class="rounded-xl border border-gumm-border bg-linear-to-br p-3.5 transition-all duration-150 hover:border-gumm-border-hover"
            :class="period.gradient"
          >
            <div class="flex items-center gap-1.5 mb-2">
              <Icon
                :name="period.icon"
                class="h-3.5 w-3.5"
                :class="period.iconColor"
              />
              <span class="text-xs text-gumm-muted">{{ period.label }}</span>
            </div>
            <p class="text-xl font-bold text-gumm-text">
              {{ usdShort(period.cost) }}
            </p>
            <div
              v-if="period.tokens"
              class="mt-1.5 flex gap-3 text-[10px] text-gumm-muted"
            >
              <span
                >↑ {{ tokens(period.tokens.prompt) }}
                <span class="opacity-60">in</span></span
              >
              <span
                >↓ {{ tokens(period.tokens.completion) }}
                <span class="opacity-60">out</span></span
              >
            </div>
          </div>
        </section>

        <!-- Daily Chart (last 30 days) -->
        <section
          v-if="usage.dailySeries?.length"
          class="rounded-xl border border-gumm-border bg-gumm-surface p-4"
        >
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:bar-chart-3" class="h-4 w-4 text-indigo-400" />
            <h2 class="text-sm font-semibold">Daily Spend</h2>
            <span class="text-[10px] text-gumm-muted ml-auto"
              >Last 30 days</span
            >
          </div>

          <div class="flex items-end gap-px h-32">
            <div
              v-for="day in usage.dailySeries"
              :key="day.date"
              class="group relative flex-1 flex flex-col justify-end"
            >
              <div
                class="w-full rounded-t-sm bg-indigo-500/60 transition-colors group-hover:bg-indigo-400"
                :style="{ height: barHeight(day.cost) }"
              />
              <!-- Tooltip -->
              <div
                class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-10"
              >
                <div
                  class="rounded-md bg-gumm-bg border border-gumm-border px-2 py-1 text-[10px] whitespace-nowrap shadow-lg"
                >
                  <p class="font-medium text-gumm-text">
                    {{ usd(day.cost) }}
                  </p>
                  <p class="text-gumm-muted">{{ formatDate(day.date) }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- X-axis labels -->
          <div class="flex justify-between mt-1.5 text-[9px] text-gumm-muted">
            <span>{{ formatDate(usage.dailySeries[0]?.date ?? '') }}</span>
            <span>{{
              formatDate(
                usage.dailySeries[Math.floor(usage.dailySeries.length / 2)]
                  ?.date ?? '',
              )
            }}</span>
            <span>{{
              formatDate(
                usage.dailySeries[usage.dailySeries.length - 1]?.date ?? '',
              )
            }}</span>
          </div>
        </section>

        <!-- Model Breakdown -->
        <section
          v-if="usage.modelBreakdown?.length"
          class="rounded-xl border border-gumm-border bg-gumm-surface p-4"
        >
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:cpu" class="h-4 w-4 text-violet-400" />
            <h2 class="text-sm font-semibold">Models</h2>
            <span class="text-[10px] text-gumm-muted ml-auto">This month</span>
          </div>

          <div class="space-y-2">
            <div
              v-for="model in usage.modelBreakdown"
              :key="model.model"
              class="flex items-center gap-3 rounded-lg px-2.5 py-2 hover:bg-white/2 transition-colors"
            >
              <!-- Model name -->
              <div class="flex-1 min-w-0">
                <p class="text-xs font-medium text-gumm-text truncate">
                  {{ shortModel(model.model) }}
                </p>
                <p class="text-[10px] text-gumm-muted">
                  {{ model.requests }} request{{
                    model.requests !== 1 ? 's' : ''
                  }}
                  ·
                  {{ tokens(model.tokensPrompt + model.tokensCompletion) }}
                  tokens
                </p>
              </div>

              <!-- Cost -->
              <span class="text-xs font-mono text-gumm-text shrink-0">
                {{ usd(model.cost) }}
              </span>

              <!-- Cost bar -->
              <div class="w-20 h-1 rounded-full bg-white/5 shrink-0">
                <div
                  class="h-full rounded-full bg-violet-500/60"
                  :style="{
                    width: `${Math.max(
                      (model.cost / (usage!.modelBreakdown[0]?.cost || 1)) *
                        100,
                      2,
                    )}%`,
                  }"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Empty state for activity -->
        <div
          v-if="
            !usage.modelBreakdown?.length &&
            !usage.dailySeries?.some((d) => d.cost > 0)
          "
          class="rounded-xl border border-gumm-border bg-gumm-surface p-6 text-center"
        >
          <Icon
            name="lucide:bar-chart-3"
            class="mx-auto h-8 w-8 text-gumm-muted mb-3"
          />
          <p class="text-sm text-gumm-muted">No usage activity yet.</p>
          <p class="text-xs text-gumm-muted mt-1">
            Start chatting and your consumption will appear here.
          </p>
        </div>
      </template>
    </div>
  </div>
</template>
