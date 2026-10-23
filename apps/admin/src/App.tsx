// Zona 7 — enrutador y layout del panel de administracion.
// AppBar solo cuando hay sesion y no se esta en /login. Las rutas de negocio van
// tras RequireAuth (redirige a /login si no hay token valido).
// Zona 8 — anade /codigos (CRUD), /codigos/:slug/estructura (editor + lote) y
// /fuentes (fuentes oficiales + forzar sincronizacion).
import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/context';
import RequireAuth from './auth/RequireAuth';
import AppBar from './components/AppBar';
import Login from './pages/Login';
import Home from './pages/Home';
import Comparator from './pages/Comparator';
import Codigos from './pages/Codigos';
import Estructura from './pages/Estructura';
import Fuentes from './pages/Fuentes';
import Notificaciones from './pages/Notificaciones';
import NotFound from './pages/NotFound';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { estado } = useAuth();
  const { pathname } = useLocation();
  const mostrarAppBar = estado === 'autenticado' && pathname !== '/login';

  return (
    <div className="min-h-screen bg-background text-texto">
      <ScrollToTop />
      {mostrarAppBar && <AppBar />}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Home />
            </RequireAuth>
          }
        />
        <Route
          path="/cambios/:id"
          element={
            <RequireAuth>
              <Comparator />
            </RequireAuth>
          }
        />
        <Route
          path="/codigos"
          element={
            <RequireAuth>
              <Codigos />
            </RequireAuth>
          }
        />
        <Route
          path="/codigos/:slug/estructura"
          element={
            <RequireAuth>
              <Estructura />
            </RequireAuth>
          }
        />
        <Route
          path="/fuentes"
          element={
            <RequireAuth>
              <Fuentes />
            </RequireAuth>
          }
        />
        <Route
          path="/notificaciones"
          element={
            <RequireAuth>
              <Notificaciones />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
}
