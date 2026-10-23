// Zona 4b — Puerta barata del lado del cliente para la busqueda por numero de articulo.
//
// El que se sabe los articulos escribe "art 151", "11 bis cpf" o "transitorio primero
// civil". Solo si la consulta tiene esa forma merece la pena llamar a /api/salto antes
// de navegar; cualquier otra consulta va directo a la busqueda de texto completo, sin
// una peticion extra por delante.
//
// El analisis fino (de que libro habla, que numero exacto existe) lo hace el backend.

/** "151", "11 bis", "40 a", "139 quáter", "151 penal qroo"… */
const RE_NUMERO_SUELTO =
  /^\d{1,4}\s*(?:bis|ter|qu[aá]ter|quintus|quinquies|sexies|septies|decies|undecies|duodecies|vicies|[a-z])?(?:\s[\s\S]{0,30})?$/i;

/** "art 151", "ARTÍCULO 151", "arts. 151", "el articulo 151 del civil". */
const RE_CON_MARCADOR =
  /^(?:el\s+)?art(?:[íi]culo(?:s)?|s|\.?)?\s+\d{1,4}(?:\s[\s\S]{0,30})?$/i;

/** "transitorio primero", "transitorios 2 penal"… */
const RE_TRANSITORIO = /^transitor(?:ios?|ias?)\.?\s+(?:\d{1,3}|[a-záéíóúñ]+)(?:\s[\s\S]{0,30})?$/i;

export function pareceNumeroArticulo(consulta: string): boolean {
  const t = consulta.trim();
  if (!t || t.length > 48) return false;
  return RE_CON_MARCADOR.test(t) || RE_TRANSITORIO.test(t) || RE_NUMERO_SUELTO.test(t);
}
