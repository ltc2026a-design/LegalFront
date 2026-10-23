import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { AuthProvider } from './auth/AuthContext';
import { queryClient } from './lib/queryClient';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontro el elemento #root en index.html');
}

// El deploy publica el panel dentro de /admin (mismo host que la API y que la
// app de consulta). Vite ya deja la base en los enlaces de assets; React Router
// necesita la misma o el panel se ve pero no navega.
const base = import.meta.env.BASE_URL;
const basename = base.startsWith('/') ? base.replace(/\/$/, '') || '/' : '/';

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={basename}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
