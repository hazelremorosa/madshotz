/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the deployed Cloudflare delivery Worker,
   *  e.g. https://madshotz-delivery.yourname.workers.dev */
  readonly VITE_DELIVERY_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
