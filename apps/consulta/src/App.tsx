// Zona 4 — Enrutador y layout de la app de consulta (nav + busqueda + vistas).
// AppBar fija arriba (salvo en /design-preview) y todas las rutas comparten scroll-to-top.
// Zona 5 — Ruta /favoritos + aviso persistente de contenido servido sin conexion.
// Code-splitting — cada pagina interior es React.lazy para que baje en su propio chunk
// solo cuando se visita. Home va EAGER: el requisito de producto es que los libros
// aparezcan de inmediato al entrar, sin esperar un segundo request de JS.
import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppBar from './components/AppBar';
import BarraInferior from './components/BarraInferior';
import AvisoSinConexion from './components/AvisoSinConexion';
import AvisoActualizacion from './components/AvisoActualizacion';
import { useSesion } from './hooks/sesion';
import { tourPendiente, useTourAbierto } from './lib/tour';
import Home from './pages/Home';

const Codigo = lazy(() => import('./pages/Codigo'));
const Articulo = lazy(() => import('./pages/Articulo'));
const Busqueda = lazy(() => import('./pages/Busqueda'));
const AsistenteChat = lazy(() => import('./pages/AsistenteChat'));
const Favoritos = lazy(() => import('./pages/Favoritos'));
const Entrar = lazy(() => import('./pages/Entrar'));
const Perfil = lazy(() => import('./pages/Perfil'));
const NotFound = lazy(() => import('./pages/NotFound'));
const DesignPreview = lazy(() => import('./pages/DesignPreview'));
const TourBienvenida = lazy(() => import('./components/TourBienvenida'));

/**
 * While a lazy page chunk loads we keep the layout stable: a simple centered
 * indicator inside the same content width so the page doesn't jump.
 */
function CargaPagina() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16 text-center font-sans text-sm text-texto/55 sm:px-6">
      Cargando…
    </div>
  );
}

/** Al cambiar de ruta, vuelve al inicio del documento (mejora la lectura de trees largos). */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

export default function App() {
  const { pathname } = useLocation();
  const sesion = useSesion();
  const autenticado = Boolean(sesion);
  const enLogin = pathname === '/entrar';

  // Fase 7 — el tour es un chunk aparte: solo se descarga en dispositivos que no lo han
  // visto (o cuando la persona lo vuelve a abrir desde Perfil), nunca para quien ya terminó.
  const tourAbierto = useTourAbierto();
  const [pendiente] = useState(() => tourPendiente());

  //
  // Candado de sesion (Fase 6): sin cuenta NO se ve ninguna pantalla — la app abre en
  // /entrar y no hay forma de navegar a otro lado. Con cuenta, /entrar ya no tiene
  // sentido y manda al inicio. El login va a pantalla completa (sin AppBar ni barra de
  // abajo) para que no queden vías de escape.
  //
  if (!autenticado && !enLogin) return <Navigate to="/entrar" replace />;
  if (autenticado && enLogin) return <Navigate to="/" replace />;

  // El chat del asistente, la vista de diseño y el login traen su propia barra (o
  // ninguna): van a pantalla completa y no llevan AppBar.
  const pantallaCompleta = ['/design-preview', '/asistente', '/entrar'].includes(pathname);

  return (
    <div className="min-h-pantalla bg-background text-texto">
      <ScrollToTop />
      {!pantallaCompleta && (
        <>
          <AppBar />
          <AvisoSinConexion />
          <BarraInferior />
        </>
      )}
      {/*
        Fuera del div `key={pathname}`: el recorrido mide elementos de la pagina y esa
        cortina no puede desmontarse cada vez que se cambia de vista. Va arriba de todo
        (z-50) y solo en las rutas con layout, porque el login y el chat van a pantalla
        completa.
      */}
      {!pantallaCompleta && (tourAbierto || pendiente) && (
        <Suspense fallback={null}>
          <TourBienvenida />
        </Suspense>
      )}
      {/*
        Publicación — aviso de versión nueva. Va en TODAS las rutas (también en las de
        pantalla completa) porque es la única manera de que quien se queda en el chat o
        apenas está entrando se entere de que hay una actualización; se puede posponer.
      */}
      <AvisoActualizacion />
      {/*
        `key={pathname}` re-monta la vista en cada cambio de ruta, que es lo que hace
        volver a correr la animacion de entrada. Solo opacidad: ver @keyframes aparecer.
        El padding de abajo deja sitio para la barra inferior en movil (sm:pb-0); las
        pantallas completas ya se miden con h-pantalla, asi que no lo llevan.
      */}
      <div
        key={pathname}
        className={'animate-aparecer ' + (pantallaCompleta ? '' : 'pb-20 sm:pb-0')}
      >
        <Suspense fallback={<CargaPagina />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/codigo/:slug" element={<Codigo />} />
            <Route path="/codigo/:slug/articulo/:numero" element={<Articulo />} />
            <Route path="/buscar" element={<Busqueda />} />
            <Route path="/asistente" element={<AsistenteChat />} />
            <Route path="/favoritos" element={<Favoritos />} />
            {/* Fase 3 — la cuenta la crea el dueno por CLI; aqui solo se entra y se ve el perfil. */}
            <Route path="/entrar" element={<Entrar />} />
            <Route path="/perfil" element={<Perfil />} />
            <Route path="/design-preview" element={<DesignPreview />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </div>
    </div>
  );
}

