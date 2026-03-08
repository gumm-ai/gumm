<script setup lang="ts">
import { languageChoices } from '~/utils/setupConstants';

defineProps<{ form: any }>();
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2
        class="text-base font-semibold text-gumm-text flex items-center gap-2"
      >
        <Icon name="lucide:globe" class="h-4 w-4 text-gumm-accent" />
        Language
      </h2>
      <p class="mt-1 text-xs text-gumm-muted">
        Choose the language Gumm will use to communicate with you.
      </p>
    </div>

    <div class="grid grid-cols-2 gap-2 max-h-70 overflow-y-auto pr-1">
      <button
        v-for="lang in languageChoices"
        :key="lang.id"
        type="button"
        class="flex items-center gap-2.5 rounded-md border px-3 py-2.5 text-left transition-colors duration-150"
        :class="
          form.language === lang.id
            ? 'border-gumm-accent bg-gumm-accent/5'
            : 'border-gumm-border bg-gumm-bg hover:border-gumm-border-hover'
        "
        @click="form.language = lang.id"
      >
        <span class="text-lg">{{ lang.flag }}</span>
        <span class="text-sm font-medium text-gumm-text">{{ lang.name }}</span>
      </button>
    </div>
  </div>
</template>
