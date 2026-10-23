import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Capacitor } from '@capacitor/core';
import App from './App';
import { queryClient } from './lib/queryClient';
import { confirmarArranque, revisarActualizaciones } from './lib/actualizaciones';
// Fase 4 — importar el store aplica el tema y la letra guardados ANTES del primer
// paint (si no, la portada parpadea en claro al abrir con tema oscuro).
import { sincronizarAlArrancar } from './lib/preferencias';
import './index.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('No se encontro el elemento #root en index.html');
}

// Zona 5 — Service Worker (offline). Se registra tambien en desarrollo para poder
// probar el modo sin conexion; en produccion queda activo para todas las visitas.
// En la Zona 10 (Capacitor/Tauri) se complementa con almacenamiento local nativo.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Offline durante el primer arranque o navegador sin soporte de SW: la app
      // sigue funcionando, solo sin cache de contenido.
    });
  });
}

// Fase 4 — con sesion guardada, las preferencias de la cuenta sustituyen a las de
// este telefono en cuanto responde el servidor (offline se queda lo local).
void sincronizarAlArrancar();

// Zona 10 — Live Updates. El aviso de arranque le dice al plugin que este bundle
// funciona; si la app volviera a fallar al iniciar, el plugin revierte solo al
// bundle anterior. Es la red de seguridad del flujo.
//
// El push NATIVO (PushNotifications/LocalNotifications) ya no se inicializa aqui: los
// dos plugins se quitaron del APK porque, sin `google-services.json`, nunca registraban
// token y su unico efecto en el arranque era levantar Firebase y WorkManager. Volver a
// ponerlos es un TODO atado a las credenciales Firebase del dueño.
if (Capacitor.isNativePlatform()) {
  void confirmarArranque();
  // Se deja unos segundos de margen para no competir con el primer paint ni con la
  // cache de los libros. Si no hay red, simplemente no hay update en este arranque.
  window.setTimeout(() => void revisarActualizaciones(), 5000);
}

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
