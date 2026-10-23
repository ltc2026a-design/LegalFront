// Zona 7 — ruta desconocida del panel.
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
      <h1 className="font-serif text-3xl font-bold text-primary-dark">Página no encontrada</h1>
      <p className="mt-2 text-texto/60">La ruta solicitada no existe en el panel.</p>
      <Link
        to="/"
        className="mt-4 inline-block font-semibold text-primary hover:text-primary-dark"
      >
        Volver a la bandeja
      </Link>
    </main>
  );
}
