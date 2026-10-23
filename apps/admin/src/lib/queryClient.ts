// Zona 7 — QueryClient unico del admin.
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000, // bandeja de pendientes: revalida tras aprobar/rechazar.
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
