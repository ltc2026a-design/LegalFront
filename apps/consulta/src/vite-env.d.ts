/// <reference types="vite/client" />

// Variables de entorno tipadas de la app de consulta.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
