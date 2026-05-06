import type { IPC } from 'main/preload';
import Vue, { VNode } from 'vue';

interface ImportMetaEnv {
  readonly VITE_LIVEBOOKS_CLOUD_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  const ipc: IPC;
  namespace JSX {
    type Element = VNode;
    type ElementClass = Vue;
    interface IntrinsicElements {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      [elem: string]: any;
    }
  }

  interface Window {
    ipc: IPC;
  }
}
