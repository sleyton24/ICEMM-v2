// ============================================================================
// resultado.test.js — Golden master de la cascada de Resultado/EBITDA del
// monolito ICEMM. Estos tests AFIRMAN EL COMPORTAMIENTO ACTUAL del código
// (no lo que dice la spec). Sirven de red de seguridad para la modularización.
// ============================================================================
import { describe, it, expect } from 'vitest';
import {
  ingresosTotales,
  resultadoOperacional,
  ebitda,
  ytd,
  ytg,
  fy,
} from './resultado.js';

describe('ingresosTotales (ingresos + otrosIngresos)', () => {
  it('suma ingresos operacionales y otros ingresos', () => {
    expect(ingresosTotales(1000, 50)).toBe(1050);
  });
  it('otros ingresos en 0 deja el total igual a ingresos', () => {
    expect(ingresosTotales(1234.56, 0)).toBe(1234.56);
  });
  it('admite valores negativos (verbatim, sin clamping)', () => {
    expect(ingresosTotales(-100, 30)).toBe(-70);
  });
  it('caso de borde: ambos 0', () => {
    expect(ingresosTotales(0, 0)).toBe(0);
  });
});

describe('resultadoOperacional (ingresosTotales - costos)', () => {
  it('resta costos de los ingresos totales', () => {
    expect(resultadoOperacional(1050, 800)).toBe(250);
  });
  it('costos mayores que ingresos => resultado negativo', () => {
    expect(resultadoOperacional(800, 1050)).toBe(-250);
  });
  it('caso de borde: costos 0 => igual a ingresos', () => {
    expect(resultadoOperacional(500, 0)).toBe(500);
  });
});

describe('ebitda (resultadoOperacional - oficinaCentral)', () => {
  it('resta la oficina central al resultado operacional', () => {
    expect(ebitda(250, 100)).toBe(150);
  });
  it('OC mayor que resultado => EBITDA negativo', () => {
    expect(ebitda(100, 250)).toBe(-150);
  });
  it('caso de borde: OC 0 => EBITDA = resultado operacional', () => {
    expect(ebitda(333.33, 0)).toBe(333.33);
  });
});

describe('cascada completa — número de control verificable a mano', () => {
  // Caso realista en UF: una empresa con un mes cualquiera del informe.
  //   Ingresos operacionales proyectos = 12000 UF
  //   Otros ingresos (asesorías + intereses) = 350 UF
  //   Costos de obra = 9000 UF
  //   Oficina Central (16 categorías) = 1800 UF
  // A mano:
  //   ingresosTotales = 12000 + 350           = 12350
  //   resultadoOp     = 12350 - 9000          = 3350
  //   ebitda          = 3350  - 1800          = 1550
  it('encadena ingresosTotales -> resultadoOperacional -> ebitda', () => {
    const it_ = ingresosTotales(12000, 350);
    const ro = resultadoOperacional(it_, 9000);
    const eb = ebitda(ro, 1800);
    expect(it_).toBe(12350);
    expect(ro).toBe(3350);
    expect(eb).toBe(1550);
  });

  it('identidad: ebitda === ingresosTotales - costos - oficinaCentral', () => {
    // Equivale a la fórmula directa de los KPIs (línea 9316): ingFY - cosFY - ocFY.
    const ing = 12000, otros = 350, costos = 9000, oc = 1800;
    const eb = ebitda(resultadoOperacional(ingresosTotales(ing, otros), costos), oc);
    expect(eb).toBe(ing + otros - costos - oc);
  });
});

// ── Agregación temporal YTD / YTG / FY ──────────────────────────────────────
describe('ytd / ytg / fy contra controlMonth', () => {
  // 12 valores mensuales conocidos (UF). Posición i => mes i+1.
  const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120];
  // Suma total = 780.

  it('fy suma los 12 meses', () => {
    expect(fy(v)).toBe(780);
  });

  it('ytd con controlMonth=6 suma meses 1..6', () => {
    expect(ytd(v, 6)).toBe(10 + 20 + 30 + 40 + 50 + 60); // 210
  });

  it('ytg con controlMonth=6 suma meses 7..12', () => {
    expect(ytg(v, 6)).toBe(70 + 80 + 90 + 100 + 110 + 120); // 570
  });

  it('identidad clave del monolito: fy === ytd + ytg', () => {
    for (const cm of [0, 1, 5, 6, 11, 12]) {
      expect(ytd(v, cm) + ytg(v, cm)).toBe(fy(v));
    }
  });

  it('caso de borde controlMonth=0: YTD=0, YTG=FY (ningún mes cargado)', () => {
    expect(ytd(v, 0)).toBe(0);
    expect(ytg(v, 0)).toBe(780);
  });

  it('caso de borde controlMonth=12: YTG=0, YTD=FY (año completo)', () => {
    expect(ytd(v, 12)).toBe(780);
    expect(ytg(v, 12)).toBe(0);
  });

  it('controlMonth=1: YTD = solo enero', () => {
    expect(ytd(v, 1)).toBe(10);
    expect(ytg(v, 1)).toBe(770);
  });

  it('array con huecos (undefined) se trata como 0 (operador || 0 verbatim)', () => {
    const sparse = [5, undefined, 7, , , , , , , , , 3]; // meses 1,3 y 12
    expect(fy(sparse)).toBe(15);
    expect(ytd(sparse, 3)).toBe(12); // 5 + 0 + 7
    expect(ytg(sparse, 3)).toBe(3);  // sólo mes 12
  });
});

// ── Divergencias documentadas con la spec ───────────────────────────────────
describe('divergencias con spec (a corregir en Frente 3)', () => {
  // DIVERGENCIA SPEC: data-model.md (línea 140) nombra "resultado" a la línea
  // (resultadoOp − totalOficinaCentral). El monolito y phases.md (línea 274) la
  // llaman "EBITDA". El cálculo es idéntico; sólo difiere el nombre en
  // data-model.md. Afirmamos el VALOR ACTUAL que produce la función ebitda().
  it('lo que data-model.md llama "resultado" final es el EBITDA del monolito (mismo valor)', () => {
    const resultadoOp = 3350;       // resultadoOp del ejemplo de control
    const totalOficinaCentral = 1800;
    // Spec: resultado = resultadoOp − totalOficinaCentral.
    // Monolito: ebitda = resultadoOp − oficinaCentral. Mismo número.
    expect(ebitda(resultadoOp, totalOficinaCentral)).toBe(1550);
  });
});
