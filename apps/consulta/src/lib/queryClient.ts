// Zona 4 — Instancia unica de QueryClient (TanStack Query).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000, // 60 s: el contenido legal no cambia minuto a minuto.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
