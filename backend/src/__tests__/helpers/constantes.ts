// Zona 11 — constantes compartidas por la suite de pruebas.
export const ADMIN_TEST = {
  id: 'admin-test',
  email: 'test-admin@consulta-legal.local',
  nombre: 'Admin de Prueba',
  // >= 12 caracteres (misma regla que el CLI admin:create).
  password: 'Test-Admin-Password-123',
  rol: 'administrador',
} as const;

/** Origen de administracion NO permitido en CORS (para probar el aislamiento). */
export const ORIGEN_PERMITIDO = 'http://localhost:5173';
