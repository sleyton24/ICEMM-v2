// ─── formato.test.js ────────────────────────────────────────────────────────
// Test de regresión (GOLDEN MASTER) para src/lib/formato.js.
// AFIRMA EL COMPORTAMIENTO ACTUAL del monolito fase1_proyectos.html, NO la spec.
// Si algún assert falla tras una refactorización, la refactorización cambió el
// resultado: eso es lo que queremos detectar.
//
// Los strings es-CL esperados se calcularon ejecutando Number.toLocaleString
// con la misma config del monolito en el mismo runtime (Node/Vitest).

import { describe, it, expect } from 'vitest';
import { fUF, fN, toNumCL, parseNumCL } from './formato.js';

// Glifos de guion — distintos en el monolito (inconsistencia preservada):
const EN_DASH = '–'; // '–' usado por fUF
const EM_DASH = '—'; // '—' usado por fN

describe('fUF — formato es-CL de valores UF', () => {
  it('formatea un positivo con miles (punto) y 2 decimales (coma)', () => {
    expect(fUF(1234.56)).toBe('1.234,56');
  });

  it('formatea millones con separadores de miles', () => {
    expect(fUF(1234567.891)).toBe('1.234.567,89');
  });

  it('cero se formatea como 0,00 (NO guion)', () => {
    expect(fUF(0)).toBe('0,00');
  });

  it('formatea negativos preservando el signo', () => {
    expect(fUF(-1234.5)).toBe('-1.234,50');
  });

  it('acepta strings numéricos vía coerción +v', () => {
    expect(fUF('1234.56')).toBe('1.234,56');
  });

  it('redondea a 2 decimales (banker-free, según toLocaleString)', () => {
    expect(fUF(0.005)).toBe('0,01');
    expect(fUF(0.004)).toBe('0,00');
  });

  describe('fUF — guion para valores nulos / no numéricos (EN-DASH)', () => {
    it('fUF(null) devuelve EN-DASH "–" (U+2013)', () => {
      expect(fUF(null)).toBe(EN_DASH);
      expect(fUF(null)).toBe('–');
    });

    it('fUF(undefined) devuelve EN-DASH (v == null cubre undefined)', () => {
      expect(fUF(undefined)).toBe(EN_DASH);
    });

    it('fUF("") devuelve EN-DASH', () => {
      expect(fUF('')).toBe(EN_DASH);
    });

    it('fUF de un string no numérico devuelve EN-DASH (isNaN)', () => {
      expect(fUF('abc')).toBe(EN_DASH);
    });

    it('el guion de fUF es EN-DASH U+2013, NO em-dash', () => {
      expect(fUF(null).codePointAt(0)).toBe(0x2013);
      expect(fUF(null)).not.toBe(EM_DASH);
    });
  });
});

describe('fN — formato es-CL con umbral de cero (EM-DASH)', () => {
  it('formatea un positivo igual que fUF para valores normales', () => {
    expect(fN(1234.56)).toBe('1.234,56');
  });

  it('valor exactamente 0.005 NO cae en el umbral (no es < 0.005) → "0,01"', () => {
    expect(fN(0.005)).toBe('0,01');
  });

  describe('fN — placeholder de cero efectivo (EM-DASH)', () => {
    it('fN(0) devuelve EM-DASH "—" (U+2014)', () => {
      expect(fN(0)).toBe(EM_DASH);
      expect(fN(0)).toBe('—');
    });

    it('|v| < 0.005 devuelve EM-DASH (0.004)', () => {
      expect(fN(0.004)).toBe(EM_DASH);
      expect(fN(-0.004)).toBe(EM_DASH);
    });

    it('null/NaN → +n||0 → 0 → EM-DASH', () => {
      expect(fN(null)).toBe(EM_DASH);
      expect(fN('abc')).toBe(EM_DASH);
      expect(fN(undefined)).toBe(EM_DASH);
    });

    it('el guion de fN es EM-DASH U+2014', () => {
      expect(fN(0).codePointAt(0)).toBe(0x2014);
    });
  });
});

describe('toNumCL — parseo de número en formato chileno', () => {
  it('parsea "1.234,56" como 1234.56 (caso de control principal)', () => {
    expect(toNumCL('1.234,56')).toBe(1234.56);
  });

  it('parsea miles con punto sin decimales: "1.234" → 1234', () => {
    expect(toNumCL('1.234')).toBe(1234);
  });

  it('parsea millones chilenos "1.234.567" → 1234567', () => {
    expect(toNumCL('1.234.567')).toBe(1234567);
  });

  it('un número se devuelve tal cual si es finito', () => {
    expect(toNumCL(1234.56)).toBe(1234.56);
  });

  it('NaN/Infinity como number → 0 (isFinite)', () => {
    expect(toNumCL(NaN)).toBe(0);
    expect(toNumCL(Infinity)).toBe(0);
    expect(toNumCL(-Infinity)).toBe(0);
  });

  it('string vacío y "-" → 0', () => {
    expect(toNumCL('')).toBe(0);
    expect(toNumCL('-')).toBe(0);
    expect(toNumCL('   ')).toBe(0);
  });

  it('null / undefined → 0', () => {
    expect(toNumCL(null)).toBe(0);
    expect(toNumCL(undefined)).toBe(0);
  });

  it('elimina espacios internos antes de parsear', () => {
    expect(toNumCL('1 234,56')).toBe(1234.56);
  });

  it('preserva signo negativo en formato chileno', () => {
    expect(toNumCL('-1.234,56')).toBe(-1234.56);
  });

  it('coma sola como decimal sin miles: "1234,5" → 1234.5', () => {
    expect(toNumCL('1234,5')).toBe(1234.5);
  });

  // COMPORTAMIENTO ACTUAL documentado para inputs con punto decimal estilo US.
  // Estos NO son formato chileno; se documenta lo que el código HACE hoy.
  describe('toNumCL — comportamiento documentado (input estilo US / sin coma)', () => {
    // "1234.56": no tiene coma, y NO matchea /^-?\d{1,3}(\.\d{3})+$/
    // (porque ".56" no son 3 dígitos), por lo que cae en parseFloat directo
    // y el '.' se interpreta como DECIMAL → 1234.56.
    it('"1234.56" → 1234.56 (parseFloat trata el punto como decimal)', () => {
      expect(toNumCL('1234.56')).toBe(1234.56);
    });

    // "1234": entero plano sin separadores → parseFloat → 1234.
    it('"1234" → 1234', () => {
      expect(toNumCL('1234')).toBe(1234);
    });

    // Caso AMBIGUO real del parser chileno: "1.234" se interpreta como MILES
    // (=1234), NO como 1.234 decimal. Esto es deliberado para datos contables CL.
    it('"1.234" se interpreta como MILES (1234), no como 1.234 decimal', () => {
      expect(toNumCL('1.234')).toBe(1234);
    });

    // PERO "1.23" (2 decimales) NO matchea el patrón de miles (.23 != 3 dígitos)
    // → parseFloat lo trata como decimal → 1.23.
    it('"1.23" → 1.23 (no es patrón de miles, parseFloat decimal)', () => {
      expect(toNumCL('1.23')).toBe(1.23);
    });

    // "12.3456" (4 decimales) → tampoco matchea miles → parseFloat → 12.3456.
    it('"12.3456" → 12.3456', () => {
      expect(toNumCL('12.3456')).toBe(12.3456);
    });
  });
});

describe('parseNumCL — alias de toNumCL', () => {
  it('es la MISMA referencia de función que toNumCL', () => {
    expect(parseNumCL).toBe(toNumCL);
  });

  it('parseNumCL("1.234,56") === 1234.56', () => {
    expect(parseNumCL('1.234,56')).toBe(1234.56);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Número de control realista: monto de contrato en UF de un proyecto seed
// (montos típicos ICEMM de decenas de miles de UF).
describe('número de control realista (montos UF tipo proyecto seed)', () => {
  it('fUF(48250.5) → "48.250,50" UF', () => {
    expect(fUF(48250.5)).toBe('48.250,50');
  });

  it('fUF(125000) → "125.000,00" UF', () => {
    expect(fUF(125000)).toBe('125.000,00');
  });

  it('round-trip contable: toNumCL del formato fUF NO es identidad por la coma decimal', () => {
    // fUF produce "48.250,50"; toNumCL lo reinterpreta correctamente a 48250.5
    // (la coma fuerza la rama de formato chileno).
    const formatted = fUF(48250.5);
    expect(formatted).toBe('48.250,50');
    expect(toNumCL(formatted)).toBe(48250.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DIVERGENCIAS con la spec (a corregir en Frente 3).
// AFIRMAN EL VALOR ACTUAL del monolito, no el de files/data-model.md ni phases.md.
describe('divergencias con spec (a corregir en Frente 3)', () => {
  // DIVERGENCIA: glifo de guion inconsistente entre fUF y fN.
  // La spec (de existir) esperaría un único glifo de "valor nulo / cero".
  // Hoy fUF usa EN-DASH (U+2013) y fN usa EM-DASH (U+2014).
  it('fUF usa EN-DASH (U+2013) y fN usa EM-DASH (U+2014): glifos distintos', () => {
    const dashFUF = fUF(null);
    const dashFN = fN(0);
    expect(dashFUF.codePointAt(0)).toBe(0x2013); // –
    expect(dashFN.codePointAt(0)).toBe(0x2014);  // —
    expect(dashFUF).not.toBe(dashFN); // confirma la inconsistencia ACTUAL
  });

  // DIVERGENCIA: fUF y fN tratan el "cero/nulo" de forma distinta.
  // fUF(0) === '0,00' (muestra el cero), mientras que fN(0) === '—' (lo oculta).
  // Comportamiento distinto para el MISMO valor 0; se afirma el actual.
  it('fUF(0) muestra "0,00" pero fN(0) lo oculta como "—"', () => {
    expect(fUF(0)).toBe('0,00');
    expect(fN(0)).toBe('—');
  });
});
