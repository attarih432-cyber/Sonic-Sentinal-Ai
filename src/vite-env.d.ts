/// <reference types="vite/client" />

// Lets `import.meta.env.VITE_*` type-check without a manual ambient declaration.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
