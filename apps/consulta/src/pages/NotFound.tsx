// Zona 4 — Ruta por defecto (404 de cliente).
import { Link } from 'react-router-dom';
import Card from '../components/Card';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16 font-sans sm:px-6">
      <Card sinAnimacion className="space-y-3 p-8 text-center">
        <p className="font-serif text-5xl font-bold text-primary">404</p>
        <h1 className="font-serif text-2xl font-semibold text-texto">Página no encontrada</h1>
        <p className="text-sm text-texto/60">La dirección que buscas no existe en la consulta legal.</p>
        <Link to="/" className="inline-block text-sm font-semibold text-primary hover:text-primary-dark">
          ← Ir al inicio
        </Link>
      </Card>
    </main>
  );
}
