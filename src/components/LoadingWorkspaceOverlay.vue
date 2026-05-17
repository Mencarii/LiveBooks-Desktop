<template>
  <div
    v-if="open"
    class="
      fixed
      inset-0
      z-[2147483645]
      flex flex-col
      items-center
      justify-center
      bg-gray-50
      dark:bg-gray-900
    "
    style="pointer-events: auto"
  >
    <div
      class="flex flex-col items-center gap-4 px-6 text-center"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        class="
          h-10
          w-10
          animate-spin
          rounded-full
          border-4 border-green-700 border-t-transparent
        "
      />
      <p class="text-lg font-medium text-gray-800 dark:text-gray-100">
        {{ t`Loading Workspace…` }}
      </p>
      <p class="max-w-sm text-sm text-gray-500 dark:text-gray-400">
        {{ t`Opening your company books. This may take a moment.` }}
      </p>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LoadingWorkspaceOverlay',
  props: {
    open: { type: Boolean, default: false },
  },
});
</script>
