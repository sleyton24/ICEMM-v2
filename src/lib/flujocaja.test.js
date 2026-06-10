// flujocaja.test.js — Golden master del Flujo de Caja del monolito ICEMM.
// Fija el COMPORTAMIENTO ACTUAL (no la spec). Los valores aseverados son los que
// produce hoy fase1_proyectos.html (CashFlowModule / cfRows, ~L8315-8388).
//
// Defaults de IVA configurables (cfData): pctIVACostos = 0.77, pctIVAOC = 0.05.
// Seed de proyectos: saldoIVADicAnterior = -84.

import { describe, it, expect } from 'vitest';
import {
  ivaDebito,
  ivaCredito,
  ivaCredAcum,
  saldoContador,
  ivaNetoMes,
  ppm,
  fcMes,
  cajaFinal,
  saldoIVADicFinal,
  arrastrarSaldoIVA,
} from './flujocaja.js';

describe('ivaDebito', () => {
  it('aplica 19% sobre el total de ingresos operacionales (incl. anticipos)', () => {
    expect(ivaDebito(1000)).toBe(190);
    expect(ivaDebito(0)).toBe(0);
  });

  it('preserva el signo: ingresos negativos dan débito negativo', () => {
    expect(ivaDebito(-500)).toBe(-95);
  });

  it('número de control realista en UF', () => {
    // 2480.5 UF de ingresos operacionales → 471.295 UF de débito
    expect(ivaDebito(2480.5)).toBeCloseTo(471.295, 6);
  });
});

describe('ivaCredito', () => {
  it('usa los defaults configurables pCostos=0.77 y pOC=0.05', () => {
    // totalCostos y oc llegan negativos (egresos); la fórmula toma Math.abs.
    // -(0.77*0.19*1000 + 0.05*0.19*200) = -(146.3 + 1.9) = -148.2
    expect(ivaCredito(-1000, -200)).toBeCloseTo(-148.2, 6);
  });

  it('Math.abs neutraliza el signo de costos y OC (mismo resultado con signo +)', () => {
    expect(ivaCredito(1000, 200)).toBeCloseTo(ivaCredito(-1000, -200), 10);
  });

  it('porcentajes personalizados sobreescriben los defaults', () => {
    // -(0.50*0.19*1000 + 0.10*0.19*200) = -(95 + 3.8) = -98.8
    expect(ivaCredito(-1000, -200, 0.5, 0.1)).toBeCloseTo(-98.8, 6);
  });

  it('borde: sin costos ni OC el crédito es -0', () => {
    expect(ivaCredito(0, 0)).toBe(-0);
  });
});

describe('ivaCredAcum', () => {
  it('si el saldo anterior > 0 (ya pagado al SII) reinicia con el crédito del mes', () => {
    // saldoIVAPrev=50 (>0) → devuelve ivaCredito tal cual
    expect(ivaCredAcum(50, -148.2)).toBeCloseTo(-148.2, 6);
  });

  it('si el saldo anterior <= 0 arrastra el excedente sumando el crédito', () => {
    // saldoIVAPrev=-84 → -84 + (-148.2) = -232.2
    expect(ivaCredAcum(-84, -148.2)).toBeCloseTo(-232.2, 6);
  });

  it('borde: saldo anterior exactamente 0 NO es > 0 → arrastra', () => {
    expect(ivaCredAcum(0, -148.2)).toBeCloseTo(-148.2, 6);
  });
});

describe('saldoContador', () => {
  it('suma el crédito acumulado y el débito del mes', () => {
    // ivaCredAcum=-232.2, ivaDebito=190 → -42.2
    expect(saldoContador(-232.2, 190)).toBeCloseTo(-42.2, 6);
  });

  it('puede quedar positivo cuando el débito supera al crédito acumulado', () => {
    expect(saldoContador(-100, 190)).toBeCloseTo(90, 6);
  });
});

describe('ivaNetoMes', () => {
  it('paga el saldo positivo del mes anterior', () => {
    expect(ivaNetoMes(90)).toBe(90);
  });

  it('no paga si el saldo anterior es negativo (queda crédito)', () => {
    expect(ivaNetoMes(-42.2)).toBe(0);
  });

  it('borde: saldo cero paga 0', () => {
    expect(ivaNetoMes(0)).toBe(0);
  });

  it('caso seed saldoIVADicAnterior negativo (-84) → no se paga IVA en enero', () => {
    expect(ivaNetoMes(-84)).toBe(0);
  });
});

describe('ppm', () => {
  it('aplica 1% al total de ingresos operacionales del mes anterior', () => {
    expect(ppm(1000)).toBeCloseTo(10, 10);
  });

  it('borde: mes 1 (sin previo) → el caller pasa 0', () => {
    expect(ppm(0)).toBe(0);
  });

  it('número de control: 2480.5 UF previas → 24.805 UF de PPM', () => {
    expect(ppm(2480.5)).toBeCloseTo(24.805, 6);
  });
});

describe('fcMes', () => {
  it('suma los 6 componentes con sus signos tal como llegan', () => {
    // totalIngresos (+), totalEgresos (−), ivaCredito (−), totalTributos (−),
    // totalCxPCxC (±), totalInv (±)
    const v = fcMes(1190, -1200, -148.2, -10, 0, 0);
    expect(v).toBeCloseTo(1190 - 1200 - 148.2 - 10 + 0 + 0, 10);
    expect(v).toBeCloseTo(-168.2, 6);
  });

  it('número de control con todos los términos distintos de cero', () => {
    const v = fcMes(2951.795, -1430.5, -148.2, -34.805, 15.5, -200);
    expect(v).toBeCloseTo(2951.795 - 1430.5 - 148.2 - 34.805 + 15.5 - 200, 10);
  });
});

describe('cajaFinal', () => {
  it('caja final = caja inicial + FC del mes', () => {
    expect(cajaFinal(500, -168.2)).toBeCloseTo(331.8, 6);
  });

  it('borde: FC cero deja la caja igual', () => {
    expect(cajaFinal(1234.56, 0)).toBeCloseTo(1234.56, 6);
  });
});

// ── Cadena secuencial de 3 meses (Passes 2 y 3 del monolito) ────────────────────
// Verifica el arrastre: saldoIVAPrev[m] = saldoContador[m-1], y cajaFinal[m] como
// cajaInicial + fcMes, con cajaInicial[m] = cajaFinal[m-1]. Caso seed: saldoIVADicAnterior=-84.
describe('cadena secuencial de meses (arrastre IVA + caja)', () => {
  // Defaults del monolito
  const pCostos = 0.77;
  const pOC = 0.05;

  // Datos de entrada por mes (signos como en el monolito: ingresos +, egresos −).
  const meses = [
    // m1
    { totalIngresosOp: 1000, totalIngresos: 1190, totalCostos: -800, oc: -100,
      totalTributos: 0, totalCxPCxC: 0, totalInv: 0 },
    // m2
    { totalIngresosOp: 1500, totalIngresos: 1785, totalCostos: -900, oc: -120,
      totalTributos: 0 /* se recalcula abajo con ivaNeto */, totalCxPCxC: 0, totalInv: 0 },
    // m3
    { totalIngresosOp: 2000, totalIngresos: 2380, totalCostos: -1100, oc: -150,
      totalTributos: 0, totalCxPCxC: 0, totalInv: 0 },
  ];

  it('arrastra saldoIVAPrev = saldoContador del mes anterior y calcula caja final encadenada', () => {
    const saldoIVADicAnterior = -84; // seed
    const cajaInicialEfectiva = 300;

    let saldoIVAPrev = saldoIVADicAnterior;
    let cajaAnt = cajaInicialEfectiva;
    let prevTotalIngresosOp = null;

    const out = [];
    for (let i = 0; i < meses.length; i++) {
      const r = meses[i];
      const ivD = ivaDebito(r.totalIngresosOp);
      const ivC = ivaCredito(r.totalCostos, r.oc, pCostos, pOC);
      const ivAc = ivaCredAcum(saldoIVAPrev, ivC);
      const sCont = saldoContador(ivAc, ivD);
      const ivNeto = ivaNetoMes(saldoIVAPrev);
      const ppmMes = prevTotalIngresosOp !== null ? ppm(prevTotalIngresosOp) : 0;
      // totalTributos = -(ivaNeto + ppm + impRenta); impRenta=0 acá (no es abril)
      const totalTributos = -(ivNeto + ppmMes + 0);
      const totalEgresos = r.totalCostos + r.oc;
      const fc = fcMes(r.totalIngresos, totalEgresos, ivC, totalTributos, r.totalCxPCxC, r.totalInv);
      const cajaIni = cajaAnt;
      const cajaFin = cajaFinal(cajaIni, fc);

      out.push({ ivD, ivC, ivAc, sCont, ivNeto, ppmMes, totalTributos, fc, cajaIni, cajaFin, saldoIVAPrevUsado: saldoIVAPrev });

      // Arrastres para el siguiente mes
      saldoIVAPrev = sCont;
      cajaAnt = cajaFin;
      prevTotalIngresosOp = r.totalIngresosOp;
    }

    // ── Mes 1 ──
    // ivD = 1000*0.19 = 190
    expect(out[0].ivD).toBeCloseTo(190, 6);
    // ivC = -(0.77*0.19*800 + 0.05*0.19*100) = -(117.04 + 0.95) = -117.99
    expect(out[0].ivC).toBeCloseTo(-117.99, 6);
    // saldoIVAPrev=-84 (<=0) → ivAc = -84 + (-117.99) = -201.99
    expect(out[0].ivAc).toBeCloseTo(-201.99, 6);
    // sCont = -201.99 + 190 = -11.99
    expect(out[0].sCont).toBeCloseTo(-11.99, 6);
    // ivNeto = max(0, -84) = 0 ; ppm = 0 (no hay previo) → tributos = 0
    expect(out[0].ivNeto).toBe(0);
    expect(out[0].ppmMes).toBe(0);
    expect(out[0].totalTributos).toBe(-0); // -(0+0+0) === -0
    // fc1 = 1190 + (-900) + (-117.99) + 0 + 0 + 0 = 172.01
    expect(out[0].fc).toBeCloseTo(172.01, 6);
    // caja: 300 + 172.01 = 472.01
    expect(out[0].cajaIni).toBe(300);
    expect(out[0].cajaFin).toBeCloseTo(472.01, 6);

    // ── Mes 2: saldoIVAPrev = sCont del mes 1 = -11.99 ──
    expect(out[1].saldoIVAPrevUsado).toBeCloseTo(-11.99, 6);
    // ivD = 1500*0.19 = 285
    expect(out[1].ivD).toBeCloseTo(285, 6);
    // ivC = -(0.77*0.19*900 + 0.05*0.19*120) = -(131.67 + 1.14) = -132.81
    expect(out[1].ivC).toBeCloseTo(-132.81, 6);
    // saldoIVAPrev=-11.99 (<=0) → ivAc = -11.99 + (-132.81) = -144.8
    expect(out[1].ivAc).toBeCloseTo(-144.8, 6);
    // sCont = -144.8 + 285 = 140.2
    expect(out[1].sCont).toBeCloseTo(140.2, 6);
    // ivNeto = max(0, -11.99) = 0 ; ppm = 1000*0.01 = 10 → tributos = -(0+10) = -10
    expect(out[1].ivNeto).toBe(0);
    expect(out[1].ppmMes).toBeCloseTo(10, 10);
    expect(out[1].totalTributos).toBeCloseTo(-10, 10);
    // fc2 = 1785 + (-1020) + (-132.81) + (-10) + 0 + 0 = 622.19
    expect(out[1].fc).toBeCloseTo(622.19, 6);
    // caja: 472.01 + 622.19 = 1094.2
    expect(out[1].cajaIni).toBeCloseTo(472.01, 6);
    expect(out[1].cajaFin).toBeCloseTo(1094.2, 6);

    // ── Mes 3: saldoIVAPrev = sCont del mes 2 = 140.2 (>0 → reinicia) ──
    expect(out[2].saldoIVAPrevUsado).toBeCloseTo(140.2, 6);
    // ivD = 2000*0.19 = 380
    expect(out[2].ivD).toBeCloseTo(380, 6);
    // ivC = -(0.77*0.19*1100 + 0.05*0.19*150) = -(160.93 + 1.425) = -162.355
    expect(out[2].ivC).toBeCloseTo(-162.355, 6);
    // saldoIVAPrev=140.2 (>0) → ivAc = ivC = -162.355 (REINICIA, no arrastra)
    expect(out[2].ivAc).toBeCloseTo(-162.355, 6);
    // sCont = -162.355 + 380 = 217.645
    expect(out[2].sCont).toBeCloseTo(217.645, 6);
    // ivNeto = max(0, 140.2) = 140.2 ; ppm = 1500*0.01 = 15 → tributos = -(140.2+15) = -155.2
    expect(out[2].ivNeto).toBeCloseTo(140.2, 6);
    expect(out[2].ppmMes).toBeCloseTo(15, 10);
    expect(out[2].totalTributos).toBeCloseTo(-155.2, 6);
    // fc3 = 2380 + (-1250) + (-162.355) + (-155.2) + 0 + 0 = 812.445
    expect(out[2].fc).toBeCloseTo(812.445, 6);
    // caja: 1094.2 + 812.445 = 1906.645
    expect(out[2].cajaIni).toBeCloseTo(1094.2, 6);
    expect(out[2].cajaFin).toBeCloseTo(1906.645, 6);
  });

  it('invariante: cajaFinal[m] === cajaInicial[m] + fcMes[m] y cajaInicial[m] === cajaFinal[m-1]', () => {
    const cajaInicialEfectiva = 300;
    let cajaAnt = cajaInicialEfectiva;
    let prevCajaFin = null;
    for (let i = 0; i < meses.length; i++) {
      const r = meses[i];
      const fc = fcMes(r.totalIngresos, r.totalCostos + r.oc, -100, -5, 0, 0);
      const cajaIni = cajaAnt;
      if (prevCajaFin !== null) expect(cajaIni).toBe(prevCajaFin);
      const cajaFin = cajaFinal(cajaIni, fc);
      expect(cajaFin).toBe(cajaIni + fc);
      prevCajaFin = cajaFin;
      cajaAnt = cajaFin;
    }
  });
});

// ── Arrastre del saldo IVA entre años (cruce de año) ────────────────────────────
// Golden master del fix de createNextYear: el saldo neto IVA de diciembre del año en
// curso debe pasar a ser el saldoIVADicAnterior del año siguiente.
// Convención de signo: negativo = crédito a favor, positivo = deuda al SII.
describe('arrastre del saldo IVA entre años', () => {
  describe('saldoIVADicFinal (extrae el saldoContador de diciembre)', () => {
    it('devuelve el saldoContador del mes 12', () => {
      const saldosPorMes = { 11: 50.5, 12: -123.45 };
      expect(saldoIVADicFinal(saldosPorMes)).toBeCloseTo(-123.45, 6);
    });

    it('borde: año incompleto sin diciembre → 0 (default backward-compatible)', () => {
      expect(saldoIVADicFinal({ 1: -10, 2: -20 })).toBe(0);
    });

    it('borde: entrada nula/undefined → 0', () => {
      expect(saldoIVADicFinal(null)).toBe(0);
      expect(saldoIVADicFinal(undefined)).toBe(0);
    });

    it('soporta arreglo indexado por mes (1..12)', () => {
      const arr = [];
      arr[12] = 217.645;
      expect(saldoIVADicFinal(arr)).toBeCloseTo(217.645, 6);
    });
  });

  describe('arrastrarSaldoIVA (propaga dic → enero del año siguiente)', () => {
    it('diciembre cierra con CRÉDITO (negativo) → enero arranca con ese crédito', () => {
      // Dic cierra con saldo -84 (crédito a favor) → próximo enero parte con saldoIVADicAnterior=-84.
      const saldoDic = -84;
      const saldoEneroSiguiente = arrastrarSaldoIVA(saldoDic);
      expect(saldoEneroSiguiente).toBe(-84);
      // y como es <=0, en enero del año entrante no se paga IVA (ivaNetoMes).
      expect(ivaNetoMes(saldoEneroSiguiente)).toBe(0);
    });

    it('diciembre cierra con DEUDA (positivo) → enero arranca con esa deuda', () => {
      // Dic cierra con saldo +217.645 (deuda) → próximo enero parte con ese saldo positivo.
      const saldoDic = 217.645;
      const saldoEneroSiguiente = arrastrarSaldoIVA(saldoDic);
      expect(saldoEneroSiguiente).toBeCloseTo(217.645, 6);
      // saldo > 0 → ivaCredAcum reinicia (no arrastra el crédito del mes).
      expect(ivaCredAcum(saldoEneroSiguiente, -100)).toBeCloseTo(-100, 6);
      // y el saldo positivo se paga al SII (con 1 mes de rezago) → ivaNetoMes lo refleja.
      expect(ivaNetoMes(saldoEneroSiguiente)).toBeCloseTo(217.645, 6);
    });

    it('borde: campo ausente/0 (cashflow viejo sin saldoIVADicFinal) → 0', () => {
      expect(arrastrarSaldoIVA(undefined)).toBe(0);
      expect(arrastrarSaldoIVA(0)).toBe(0);
      expect(arrastrarSaldoIVA(null)).toBe(0);
    });
  });

  it('end-to-end: el saldoContador de diciembre del año N es el saldoIVADicAnterior del año N+1', () => {
    // Año N: 3 meses (proxy de un año) — reusa los datos de la cadena secuencial.
    const pCostos = 0.77, pOC = 0.05;
    const mesesAnioN = [
      { totalIngresosOp: 1000, totalCostos: -800,  oc: -100 },
      { totalIngresosOp: 1500, totalCostos: -900,  oc: -120 },
      { totalIngresosOp: 2000, totalCostos: -1100, oc: -150 }, // "diciembre" del proxy
    ];
    let saldoIVAPrev = -84; // seed saldoIVADicAnterior del año N
    const saldosContador = {};
    for (let i = 0; i < mesesAnioN.length; i++) {
      const r = mesesAnioN[i];
      const ivD  = ivaDebito(r.totalIngresosOp);
      const ivC  = ivaCredito(r.totalCostos, r.oc, pCostos, pOC);
      const ivAc = ivaCredAcum(saldoIVAPrev, ivC);
      const sC   = saldoContador(ivAc, ivD);
      saldosContador[i + 1] = sC;
      saldoIVAPrev = sC;
    }
    // El "diciembre" (mes 3 del proxy) cerró en 217.645 (deuda) — ver cadena secuencial.
    // En el monolito ese valor se persiste como saldoIVADicFinal; mapeamos al mes 12.
    const saldosAnioN = { 12: saldosContador[mesesAnioN.length] };
    const dicFinal = saldoIVADicFinal(saldosAnioN);
    expect(dicFinal).toBeCloseTo(217.645, 6);

    // Año N+1: createNextYear propaga ese saldo como saldoIVADicAnterior inicial.
    const saldoIVAInicialAnioSiguiente = arrastrarSaldoIVA(dicFinal);
    expect(saldoIVAInicialAnioSiguiente).toBeCloseTo(217.645, 6);
    // Antes del fix, este saldo arrancaba en 0 y descuadraba el Q1 del año siguiente.
    expect(saldoIVAInicialAnioSiguiente).not.toBe(0);
  });
});

// ── Divergencias documentadas (afirman el VALOR ACTUAL, no el de la spec) ────────
describe('divergencias con spec (a corregir en Frente 3)', () => {
  it('IVA a pagar: el monolito usa max(0, saldoIVAPrev acumulado), NO max(0, ivaDebito[M-1] - ivaCredito[M-1]) de la spec', () => {
    // Spec (data-model.md L145 / phases.md L330):
    //   ivaPagar[M] = max(0, ivaDebito[M-1] - ivaCredito[M-1])
    // Con ivaDebito[M-1]=190 e ivaCredito[M-1]=-117.99 la spec daría:
    const segunSpec = Math.max(0, 190 - (-117.99)); // = 307.99
    expect(segunSpec).toBeCloseTo(307.99, 6);
    // Comportamiento ACTUAL del monolito: paga el saldoContador acumulado del mes anterior.
    // Con seed saldoIVADicAnterior=-84 el saldoContador del mes 1 fue -11.99, y como es <=0
    // el monolito NO paga nada en el mes 2 (acumula el crédito en vez de restar mes a mes).
    const saldoContadorMes1 = -11.99;
    expect(ivaNetoMes(saldoContadorMes1)).toBe(0); // VALOR ACTUAL: 0, no 307.99
  });

  it('fcMes: el monolito suma 6 términos (ivaCredito explícito), la spec lista 5', () => {
    // Spec (data-model.md L147): fcMes = ingresos + egresos + tributos + cxpCxc + inversionistas
    // El monolito agrega ivaCredito como término EXPLÍCITO separado. Demostración:
    const ingresos = 1190, egresos = -1020, ivaCred = -132.81, tributos = -10, cxpCxc = 0, inv = 0;
    const actual = fcMes(ingresos, egresos, ivaCred, tributos, cxpCxc, inv);
    const segunSpec5Terminos = ingresos + egresos + tributos + cxpCxc + inv; // sin ivaCredito
    // VALOR ACTUAL incluye el ivaCredito → difiere de la suma de 5 términos en exactamente ivaCred.
    expect(actual).toBeCloseTo(segunSpec5Terminos + ivaCred, 10);
    expect(actual).not.toBe(segunSpec5Terminos);
    expect(actual).toBeCloseTo(27.19, 6); // 1190 - 1020 - 132.81 - 10 = 27.19
  });
});
