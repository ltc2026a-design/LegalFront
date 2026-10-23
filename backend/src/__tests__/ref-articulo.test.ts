// Zona 4b — Pruebas del parser de referencias por numero de articulo.
//
// Los casos salen de los formatos REALES que hay en la base de datos: sufijos
// latinos con acento ("139 QUÁTER" del espejo federal) y sin el ("113 QUINQUIES"
// del POE), repetidos parentetizados ("1 (2)"), transitorios con ordinales
// compuestos ("TRANSITORIO DÉCIMO OCTAVO") o escritos juntos
// ("TRANSITORIO DECIMOSEGUNDO").
import { describe, expect, it } from 'vitest';
import { compacterClave, normalizarClave, parsearReferencia } from '../utils/ref-articulo.js';

describe('normalizarClave / compacterClave', () => {
  it('quita acentos, puntuacion y espacios sobrantes', () => {
    expect(normalizarClave(' 139 QUÁTER. ')).toBe('139 QUATER');
    expect(normalizarClave('Artículo 151 del Código Penal')).toBe('ARTICULO 151 DEL CODIGO PENAL');
  });

  it('une los ordinales escritos juntos o separados', () => {
    expect(compacterClave('TRANSITORIO DECIMOSEGUNDO')).toBe(compacterClave('transitorio décimo segundo'));
  });
});

describe('parsearReferencia · numeros con marcador', () => {
  it('reconoce las abreviaturas habituales', () => {
    for (const q of ['art 151', 'ARTICULO 151', 'artículo 151', 'arts 151', 'el articulo 151']) {
      expect(parsearReferencia(q)).toMatchObject({ clave: '151', base: '151', restante: [] });
    }
  });

  it('guarda los digitos en `base` para filtrar en SQL', () => {
    expect(parsearReferencia('art 11 bis')?.base).toBe('11');
    expect(parsearReferencia('art 11 bis')?.clave).toBe('11 BIS');
  });

  it('acepta sufijos latinos, letras sueltas y repeticiones', () => {
    expect(parsearReferencia('art 16 bis')?.clave).toBe('16 BIS');
    expect(parsearReferencia('art 113 quinquies')?.clave).toBe('113 QUINQUIES');
    expect(parsearReferencia('40 a')?.clave).toBe('40 A');
    expect(parsearReferencia('art 139 QUÁTER')?.clave).toBe('139 QUATER');
    expect(parsearReferencia('art 1 bis 2')?.clave).toBe('1 BIS 2');
  });

  it('deja el nombre del libro en `restante`', () => {
    expect(parsearReferencia('art 151 penal federal')?.restante).toEqual(['PENAL', 'FEDERAL']);
    expect(parsearReferencia('art 33 constitución')?.restante).toEqual(['CONSTITUCION']);
  });

  it('quiere decir articulo 5 cuando se escribe "5o"', () => {
    expect(parsearReferencia('art 5o')?.clave).toBe('5');
  });
});

describe('parsearReferencia · numeros sin marcador', () => {
  it('acepta la consulta corta, que es la que se usa dentro de un libro', () => {
    expect(parsearReferencia('151')?.clave).toBe('151');
    expect(parsearReferencia('151 cpf')?.clave).toBe('151');
    expect(parsearReferencia('11 bis')?.clave).toBe('11 BIS');
  });

  it('rechaza frases largas que empiezan con digitos (son busquedas de tema)', () => {
    expect(parsearReferencia('30 dias naturales para acreditar la prueba')).toBeNull();
    expect(parsearReferencia('articulo 151 y 152 del codigo penal')).toBeNull();
  });

  it('rechaza cualquier cosa sin digitos', () => {
    expect(parsearReferencia('libertad de expresión')).toBeNull();
    expect(parsearReferencia('')).toBeNull();
  });
});

describe('parsearReferencia · transitorios', () => {
  it('traduce el ordinal a la clave almacenada', () => {
    expect(parsearReferencia('transitorio primero')?.clave).toBe('TRANSITORIO PRIMERO');
    expect(parsearReferencia('TRANSITORIOS SEGUNDO civil')?.clave).toBe('TRANSITORIO SEGUNDO');
    expect(parsearReferencia('transitorio único')?.clave).toBe('TRANSITORIO UNICO');
  });

  it('permite ordinales compuestos', () => {
    expect(parsearReferencia('transitorio décimo octavo nacional')?.clave).toBe(
      'TRANSITORIO DECIMO OCTAVO',
    );
    expect(parsearReferencia('art 3 transitorios vigésimo')?.clave).toBe('TRANSITORIO VIGESIMO');
  });

  it('acepta el numero despues de la palabra y lo traduce al ordinal', () => {
    expect(parsearReferencia('transitorio 2')).toMatchObject({
      clave: 'TRANSITORIO 2',
      alternativas: ['TRANSITORIO SEGUNDO'],
    });
    expect(parsearReferencia('transitorio 1')?.alternativas).toEqual([
      'TRANSITORIO PRIMERO',
      'TRANSITORIO UNICO',
    ]);
  });

  it('entiende "ARTÍCULO 5o TRANSITORIO", donde el numero va antes', () => {
    expect(parsearReferencia('art 5o transitorio')?.clave).toBe('TRANSITORIO 5');
    expect(parsearReferencia('art 5o transitorio')?.alternativas).toEqual(['TRANSITORIO QUINTO']);
  });

  it('no inventa un articulo cuando solo dice "transitorios"', () => {
    expect(parsearReferencia('transitorios')).toBeNull();
    expect(parsearReferencia('transitorios del codigo penal')).toBeNull();
  });
});
