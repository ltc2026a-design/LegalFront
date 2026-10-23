// Zona 5 — Aviso persistente de contenido sin conexion (tono ambar del sistema de diseño).
// Aparece cuando el Service Worker sirvio el ultimo GET desde su cache o el
// navegador no tiene red. Es informativo: nunca tapa la navegacion.
import { useSinConexion } from '../hooks/offline';

export default function AvisoSinConexion() {
  const sinConexion = useSinConexion();
  if (!sinConexion) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-derogado/30 bg-derogado/10 px-4 py-2 text-center font-sans text-xs font-semibold text-derogado sm:px-6"
    >
      Mostrando contenido guardado (sin conexión)
    </div>
  );
}
