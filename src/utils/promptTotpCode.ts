import { t } from 'fyo';
import Button from 'src/components/Button.vue';
import { createApp, h, ref } from 'vue';

/**
 * Modal prompt for a LiveBooks Cloud authenticator code (Plaid step-up, etc.).
 */
export async function promptTotpCode(options?: {
  title?: string;
  detail?: string;
}): Promise<string | null> {
  const title = options?.title ?? t`Authenticator code`;
  const detail =
    options?.detail ??
    t`Enter the 6-digit code from your authenticator app to continue.`;

  return await new Promise((resolve) => {
    const code = ref('');
    let app: ReturnType<typeof createApp> | null = null;

    const close = (value: string | null) => {
      app?.unmount();
      resolve(value);
    };

    app = createApp({
      setup() {
        return () =>
          h(
            'div',
            {
              class:
                'fixed inset-0 z-50 flex items-center justify-center bg-black/40',
              onClick: (e: MouseEvent) => {
                if (e.target === e.currentTarget) {
                  close(null);
                }
              },
            },
            [
              h(
                'div',
                {
                  class:
                    'bg-white dark:bg-gray-850 border dark:border-gray-800 rounded-lg shadow-2xl p-6 w-full max-w-md mx-4',
                  onClick: (e: Event) => e.stopPropagation(),
                },
                [
                  h('h2', { class: 'text-lg font-semibold mb-2' }, title),
                  h(
                    'p',
                    { class: 'text-sm text-gray-600 dark:text-gray-400 mb-4' },
                    detail
                  ),
                  h('input', {
                    class:
                      'w-full rounded border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm dark:bg-gray-900 mb-4',
                    type: 'text',
                    inputmode: 'numeric',
                    autocomplete: 'one-time-code',
                    maxlength: 32,
                    placeholder: t`6-digit code`,
                    value: code.value,
                    onInput: (e: Event) => {
                      code.value = (e.target as HTMLInputElement).value;
                    },
                    onKeydown: (e: KeyboardEvent) => {
                      if (e.key === 'Enter' && code.value.trim()) {
                        close(code.value.trim());
                      }
                    },
                  }),
                  h('div', { class: 'flex justify-end gap-3' }, [
                    h(
                      Button,
                      {
                        onClick: () => close(null),
                      },
                      () => t`Cancel`
                    ),
                    h(
                      Button,
                      {
                        type: 'primary',
                        onClick: () => {
                          const v = code.value.trim();
                          if (v) {
                            close(v);
                          }
                        },
                      },
                      () => t`Continue`
                    ),
                  ]),
                ]
              ),
            ]
          );
      },
    });

    const el = document.createElement('div');
    document.body.appendChild(el);
    app.mount(el);
  });
}
