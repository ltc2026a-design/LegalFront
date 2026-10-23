// Zona 9 — Mini-aviso de push NO intrusivo (toast).
//
// Solo se muestra tras una accion del usuario (la primera vez que marca un
// favorito con exito) y JAMAS al abrir la app. Ofrece activar avisos de reformas
// para sus favoritos. El permiso nativo de notificacion se pide DENTRO del click
// en "Activar" (gesto del usuario), nunca de forma automatica.
import { useState } from 'react';
import Button from './Button';
import { activarPushDesdeGesto, posponerAviso } from '../lib/push';

interface PromptPushProps {
  abierto: boolean;
  onCerrar: () => void;
}

export default function PromptPush({ abierto, onCerrar }: PromptPushProps) {
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  if (!abierto) return null;

  async function activar() {
    setProcesando(true);
    setMensaje(null);
    const r = await activarPushDesdeGesto();
    setProcesando(false);
    if (r.ok) {
      setMensaje('¡Listo! Recibirás avisos de reformas de tus favoritos.');
      window.setTimeout(onCerrar, 1600);
    } else if (r.estado === 'denegado') {
      // El usuario rechazo el permiso nativo: no volver a ofrecer.
      posponerAviso();
      onCerrar();
    } else if (r.estado === 'no-soportado') {
      setMensaje('Tu navegador no admite avisos.');
      window.setTimeout(onCerrar, 1600);
    } else {
      setMensaje('No se pudo activar ahora. Intentalo de nuevo.');
    }
  }

  function ahoraNo() {
    posponerAviso();
    onCerrar();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-entrada fixed inset-x-0 bottom-4 z-30 mx-auto flex max-w-md px-4 max-sm:sobre-barra"
    >
      <div className="w-full rounded-xl border border-primary/20 bg-tarjeta/95 p-4 shadow-lg backdrop-blur">
        <p className="font-serif text-sm font-semibold text-texto">
          Activa avisos de reformas para tus favoritos
        </p>
        <p className="mt-1 text-xs text-texto/60">
          Te avisaremos cuando un artículo guardado cambie. Sin cuentas y sin spam.
        </p>
        {mensaje ? (
          <p className="mt-2 text-xs font-medium text-vigente">{mensaje}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variante="primary" disabled={procesando} onClick={activar}>
              {procesando ? 'Activando…' : 'Activar'}
            </Button>
            <Button variante="ghost" disabled={procesando} onClick={ahoraNo}>
              Ahora no
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
