// cashflowMatrix.test.js — Golden master de la MATRIZ DE FLUJO DE CAJA (cfRowsMatrix).
//
// Port VERBATIM de la función `cfRows` del monolito ICEMM
// (fase1_proyectos.html, componente CashFlowModule, useMemo `cfRows`, ~L8435-8511).
// Los valores aseverados son los que produce HOY el monolito (golden master, NO la spec):
// mismas fórmulas, mismos signos, mismas constantes (0.19, 0.01, 1.19), mismo arrastre
// secuencial del saldo IVA, misma caja acumulada. Montos en UF.
//
// La función vive en flujocaja.js (reusa ivaDebito/ivaCredito/ivaCredAcum/saldoContador/
// ivaNetoMes/ppm/fcMes/cajaFinal ya portados). Acá probamos la ORQUESTACIÓN de las 3 pasadas.

import { describe, it, expect } from 'vitest';
import { cfRowsMatrix } from './flujocaja.js';

// ── Escenario representativo: 1 año (4 meses activos), 2 proyectos ──────────────────
// P1 = Suma Alzada (con anticipo en enero), P2 = Admin Delegada (cobra al contado → se
// excluye del CxC default). controlMonth=2 (m1,m2 históricos; m3,m4 proyección → CxC default).
// Seed saldoIVADicAnterior=-84 (crédito a favor arrastrado del año anterior).
// impuestoRenta=200 (se imputa en abril). Aporte de inversionista en m3; devolución en m4.
describe('cfRowsMatrix — escenario representativo (2 proyectos, 4 meses)', () => {
  const ingP1   = { 1: 1000, 2: 1200, 3: 1500, 4: 0 };
  const ingP2   = { 1: 500,  2: 600,  3: 700,  4: 800 };   // AD
  const antP1   = { 1: 300,  2: 0,    3: 0,    4: 0 };
  const costoP1 = { 1: 600,  2: 700,  3: 900,  4: 0 };
  const costoP2 = { 1: 400,  2: 450,  3: 500,  4: 550 };
  const ocM     = { 1: 100,  2: 120,  3: 130,  4: 140 };
  const otrosM  = { 1: 50,   2: 0,    3: 80,   4: 0 };

  const input = {
    activeProjects: [
      { id: 'P1', contractType: 'suma_alzada' },
      { id: 'P2', contractType: 'admin_delegada' },
    ],
    getAnticipo: (id, m) => (id === 'P1' ? (antP1[m] || 0) : 0),
    getCosto:    (id, m) => (id === 'P1' ? (costoP1[m] || 0) : (costoP2[m] || 0)),
    getIngreso:  (id, m) => (id === 'P1' ? (ingP1[m] || 0) : (ingP2[m] || 0)),
    getOtrosIng: (m) => otrosM[m] || 0,
    getOC:       (m) => ocM[m] || 0,
    controlMonth: 2,
    cajaInicialEfectiva: 300,
    cfData: {
      pctIVACostos: 0.77, pctIVAOC: 0.05, saldoIVADicAnterior: -84, impuestoRenta: 200,
      cxp: { 2: 10 }, cxc: {}, aportes: { 3: 500 }, devoluciones: { 4: 50 },
    },
  };

  const rows = cfRowsMatrix(input);

  it('produce 12 filas indexadas 1..12 (meses sin movimiento incluidos)', () => {
    for (let m = 1; m <= 12; m++) expect(rows[m]).toBeDefined();
    expect(Object.keys(rows).length).toBe(12);
  });

  // ── Pasada 1: ingresos/egresos ──────────────────────────────────────────────────
  it('Pasada 1 — mes 1: ingresos operacionales, IVA débito, costos y egresos', () => {
    const r = rows[1];
    // totalIngresosOp = anticipos(300) + edp(1000+500) + otros(50) = 1850
    expect(r.totalAnticipos).toBeCloseTo(300, 6);
    expect(r.totalEdp).toBeCloseTo(1500, 6);
    expect(r.otrosIng).toBeCloseTo(50, 6);
    expect(r.totalIngresosOp).toBeCloseTo(1850, 6);
    // IVA débito = 1850 * 0.19 = 351.5 (base incluye anticipos)
    expect(r.ivaDebito).toBeCloseTo(351.5, 6);
    expect(r.totalIngresos).toBeCloseTo(2201.5, 6);
    // costos llegan negativos: -(600+400) = -1000 ; oc = -100 ; egresos = -1100
    expect(r.costos.P1).toBeCloseTo(-600, 6);
    expect(r.costos.P2).toBeCloseTo(-400, 6);
    expect(r.totalCostos).toBeCloseTo(-1000, 6);
    expect(r.oc).toBeCloseTo(-100, 6);
    expect(r.totalEgresos).toBeCloseTo(-1100, 6);
  });

  // ── Pasada 2: IVA acumulado, tributos, CxC default ───────────────────────────────
  it('Pasada 2 — mes 1: IVA crédito, arrastre seed (-84), saldoContador, sin tributos', () => {
    const r = rows[1];
    // ivaCredito = -(0.77*0.19*1000 + 0.05*0.19*100) = -(146.3 + 0.95) = -147.25
    expect(r.ivaCredito).toBeCloseTo(-147.25, 6);
    // saldoIVAPrev=-84 (<=0) → arrastra: ivaCredAcum = -84 + (-147.25) = -231.25
    // saldoContador = -231.25 + 351.5 = 120.25
    expect(r.saldoContador).toBeCloseTo(120.25, 6);
    // ivaNeto = max(0, -84) = 0 ; ppm = 0 (no hay mes previo) ; impRenta = 0 (no es abril)
    expect(r.ivaNeto).toBe(0);
    expect(r.ppm).toBe(0);
    expect(r.impRenta).toBe(0);
    expect(r.totalTributos).toBe(-0);
    // sin CxC/CxP/inversiones en m1 (m1 <= controlMonth → no hay CxC default)
    expect(r.cxcDefault).toBe(0);
    expect(r.cxc).toBe(0);
    expect(r.totalCxPCxC).toBe(0);
    expect(r.totalInv).toBe(0);
    // fcMes = 2201.5 - 1100 - 147.25 + 0 + 0 + 0 = 954.25
    expect(r.fcMes).toBeCloseTo(954.25, 6);
  });

  it('Pasada 2 — mes 2: arrastra saldoIVAPrev (120.25>0 → ivaNeto se paga, ivaCredAcum reinicia), PPM del mes anterior, CxP override', () => {
    const r = rows[2];
    // totalIngresosOp = 0(ant) + (1200+600) + 0(otros) = 1800
    expect(r.totalIngresosOp).toBeCloseTo(1800, 6);
    expect(r.ivaDebito).toBeCloseTo(342, 6);
    // ivaCredito = -(0.77*0.19*1150 + 0.05*0.19*120) = -(168.245 + 1.14) = -169.385
    expect(r.ivaCredito).toBeCloseTo(-169.385, 6);
    // saldoIVAPrev = saldoContador m1 = 120.25 (>0) → ivaCredAcum = ivaCredito (REINICIA)
    // saldoContador = -169.385 + 342 = 172.615
    expect(r.saldoContador).toBeCloseTo(172.615, 6);
    // ivaNeto = max(0, 120.25) = 120.25 (se paga el saldo positivo del mes anterior)
    expect(r.ivaNeto).toBeCloseTo(120.25, 6);
    // ppm = 1% del totalIngresosOp del mes 1 (1850) = 18.5
    expect(r.ppm).toBeCloseTo(18.5, 6);
    expect(r.impRenta).toBe(0);
    // totalTributos = -(120.25 + 18.5 + 0) = -138.75
    expect(r.totalTributos).toBeCloseTo(-138.75, 6);
    // CxP override del mes 2 = 10 ; m2 <= controlMonth → sin CxC default
    expect(r.cxp).toBe(10);
    expect(r.cxcDefault).toBe(0);
    expect(r.totalCxPCxC).toBe(10);
    // fcMes = 2142 - 1270 - 169.385 - 138.75 + 10 + 0 = 573.865
    expect(r.fcMes).toBeCloseTo(573.865, 6);
  });

  it('Pasada 2 — mes 3: CxC default excluye AD (P2), aporte de inversionista, arrastre IVA', () => {
    const r = rows[3];
    // m3 > controlMonth(2) → CxC default activo.
    // adPrev (P2) = edp m2(600) + ant m2(0) = 600 ; adCur = edp m3(700) + 0 = 700
    // cxcDefault = (1800 - 600 - (2280 - 700)) * 1.19 = (1200 - 1580) * 1.19 = -452.2
    expect(r.cxcDefault).toBeCloseTo(-452.2, 6);
    // cfData.cxc[3] vacío/0 → usa cxcDefault
    expect(r.cxc).toBeCloseTo(-452.2, 6);
    expect(r.totalCxPCxC).toBeCloseTo(-452.2, 6);
    // ppm = 1% de totalIngresosOp m2 (1800) = 18
    expect(r.ppm).toBeCloseTo(18, 6);
    // ivaNeto = max(0, saldoContador m2 = 172.615) = 172.615
    expect(r.ivaNeto).toBeCloseTo(172.615, 6);
    // totalTributos = -(172.615 + 18 + 0) = -190.615
    expect(r.totalTributos).toBeCloseTo(-190.615, 6);
    // aporte inversionista m3 = 500
    expect(r.aportes).toBe(500);
    expect(r.devoluciones).toBe(-0); // -(Math.abs(0)) === -0
    expect(r.totalInv).toBe(500);
    // saldoContador m3: ivaCredito = -(0.77*0.19*1400 + 0.05*0.19*130) = -206.055
    //   saldoIVAPrev=172.615 (>0) → reinicia → saldoContador = -206.055 + 433.2 = 227.145
    expect(r.saldoContador).toBeCloseTo(227.145, 6);
    // fcMes = 2713.2 - 1530 - 206.055 - 190.615 - 452.2 + 500 = 834.33
    expect(r.fcMes).toBeCloseTo(834.33, 6);
  });

  it('Pasada 2 — mes 4: impuesto renta en abril (siempre egreso, abs), devolución inversionista', () => {
    const r = rows[4];
    // impRenta = Math.abs(200) = 200 (abril)
    expect(r.impRenta).toBe(200);
    // devoluciones = -(abs(50)) = -50 ; totalInv = 0 + (-50) = -50
    expect(r.devoluciones).toBeCloseTo(-50, 6);
    expect(r.totalInv).toBe(-50);
    // ivaNeto = max(0, saldoContador m3 = 227.145) ; ppm = 1% de 2280 = 22.8
    expect(r.ivaNeto).toBeCloseTo(227.145, 6);
    expect(r.ppm).toBeCloseTo(22.8, 6);
    // totalTributos = -(227.145 + 22.8 + 200) = -449.945
    expect(r.totalTributos).toBeCloseTo(-449.945, 6);
  });

  // ── Pasada 3: caja acumulada ──────────────────────────────────────────────────────
  it('Pasada 3 — caja acumulada: enero parte de cajaInicialEfectiva y encadena mes a mes', () => {
    // m1: cajaInicial=300, cajaFinal=300+954.25=1254.25
    expect(rows[1].cajaInicial).toBe(300);
    expect(rows[1].cajaFinal).toBeCloseTo(1254.25, 6);
    // m2: cajaInicial = cajaFinal m1 ; cajaFinal = +573.865
    expect(rows[2].cajaInicial).toBeCloseTo(1254.25, 6);
    expect(rows[2].cajaFinal).toBeCloseTo(1828.115, 6);
    // m3
    expect(rows[3].cajaInicial).toBeCloseTo(1828.115, 6);
    expect(rows[3].cajaFinal).toBeCloseTo(2662.445, 6);
    // m4
    expect(rows[4].cajaInicial).toBeCloseTo(2662.445, 6);
    expect(rows[4].cajaFinal).toBeCloseTo(4222.905, 6);
  });

  it('invariante: cajaInicial[m] === cajaFinal[m-1] y cajaFinal[m] === cajaInicial[m] + fcMes[m]', () => {
    for (let m = 1; m <= 12; m++) {
      const r = rows[m];
      expect(r.cajaFinal).toBeCloseTo(r.cajaInicial + r.fcMes, 9);
      if (m > 1) expect(r.cajaInicial).toBeCloseTo(rows[m - 1].cajaFinal, 9);
    }
    expect(rows[1].cajaInicial).toBe(300);
  });

  it('meses sin movimiento (5..12): ingresos/costos en cero; el único egreso es el rezago de tributos', () => {
    for (let m = 5; m <= 12; m++) {
      const r = rows[m];
      expect(r.totalIngresosOp).toBe(0);
      expect(r.ivaDebito).toBe(0);
      expect(r.totalCostos).toBe(0);
      expect(r.oc).toBe(-0);          // -getOC(m) con getOC=0 → -0
      // sin ingresos/costos/oc, el FC del mes son solo los tributos rezagados (IVA + PPM del mes anterior)
      expect(r.fcMes).toBeCloseTo(r.totalTributos, 9);
    }
    // m5: rezago del mes 4 → ivaNeto = max(0, saldoContador m4 = 70.205) = 70.205,
    //     ppm = 1% de totalIngresosOp m4 (800) = 8 → fcMes = -(70.205 + 8) = -78.205
    expect(rows[5].ivaNeto).toBeCloseTo(70.205, 6);
    expect(rows[5].ppm).toBeCloseTo(8, 6);
    expect(rows[5].fcMes).toBeCloseTo(-78.205, 6);
    // de m6 en adelante el mes anterior no tuvo ingresos ni saldo IVA positivo → todo 0, caja plana
    expect(rows[6].ivaNeto).toBe(0);
    expect(rows[6].ppm).toBe(0);
    expect(rows[6].fcMes).toBe(0);
    expect(rows[12].cajaFinal).toBeCloseTo(rows[6].cajaFinal, 6);
  });
});

// ── Borde: signo del saldo IVA (crédito vs deuda) ───────────────────────────────────
describe('cfRowsMatrix — saldo IVA negativo (crédito) vs positivo (deuda)', () => {
  // Un solo proyecto, sin OC ni otros ingresos, controlMonth=12 (todo histórico → sin CxC default).
  function build(saldoIVADicAnterior, ingreso, costo) {
    return cfRowsMatrix({
      activeProjects: [{ id: 'A', contractType: 'suma_alzada' }],
      getAnticipo: () => 0,
      getCosto:    (id, m) => (m === 1 ? costo : 0),
      getIngreso:  (id, m) => (m === 1 ? ingreso : 0),
      getOtrosIng: () => 0,
      getOC:       () => 0,
      controlMonth: 12,
      cajaInicialEfectiva: 0,
      cfData: { pctIVACostos: 0.77, pctIVAOC: 0.05, saldoIVADicAnterior },
    });
  }

  it('seed NEGATIVO (crédito a favor): se arrastra y NO se paga IVA en enero', () => {
    // saldoIVADicAnterior=-84 (<=0) → ivaNeto enero = max(0,-84) = 0
    const rows = build(-84, 1000, 600);
    expect(rows[1].ivaNeto).toBe(0);
    // ivaCredito = -(0.77*0.19*600) = -87.78 ; ivaCredAcum = -84 + (-87.78) = -171.78
    // saldoContador = -171.78 + 190 = 18.22 (queda deuda al cierre del mes)
    expect(rows[1].ivaCredito).toBeCloseTo(-87.78, 6);
    expect(rows[1].saldoContador).toBeCloseTo(18.22, 6);
  });

  it('seed POSITIVO (deuda): se paga el saldo en enero y el crédito del mes NO se arrastra (reinicia)', () => {
    // saldoIVADicAnterior=50 (>0) → ivaNeto enero = max(0,50) = 50
    const rows = build(50, 1000, 600);
    expect(rows[1].ivaNeto).toBe(50);
    // saldoIVAPrev>0 → ivaCredAcum = ivaCredito (reinicia, no suma el seed)
    // saldoContador = -87.78 + 190 = 102.22
    expect(rows[1].saldoContador).toBeCloseTo(102.22, 6);
    // y ese saldo positivo se paga al SII el mes SIGUIENTE
    expect(rows[2].ivaNeto).toBeCloseTo(102.22, 6);
  });

  it('borde: seed 0 NO es > 0 → arrastra el crédito del mes (igual que negativo)', () => {
    const rows = build(0, 1000, 600);
    // ivaCredAcum = 0 + (-87.78) = -87.78 ; saldoContador = -87.78 + 190 = 102.22
    expect(rows[1].saldoContador).toBeCloseTo(102.22, 6);
    expect(rows[1].ivaNeto).toBe(0); // max(0,0)=0
  });
});

// ── Borde: matriz vacía (sin proyectos, sin cfData) ────────────────────────────────
describe('cfRowsMatrix — defaults y matriz vacía', () => {
  it('sin proyectos ni cfData: 12 filas en cero, caja plana en la inicial', () => {
    const rows = cfRowsMatrix({ cajaInicialEfectiva: 500 });
    for (let m = 1; m <= 12; m++) {
      expect(rows[m].totalIngresosOp).toBe(0);
      expect(rows[m].ivaDebito).toBe(0);
      expect(rows[m].fcMes).toBe(0);    // todo cero (sin tributos: ingresos previos 0)
      expect(rows[m].cajaInicial).toBe(500);
      expect(rows[m].cajaFinal).toBe(500);
    }
    // defaults de IVA: ivaCredito = -0 (sin costos), saldoContador arranca del seed 0
    expect(rows[1].saldoContador).toBe(0);
  });

  it('argumento undefined: no rompe (input || {}), entrega matriz vacía con caja 0', () => {
    const rows = cfRowsMatrix();
    expect(Object.keys(rows).length).toBe(12);
    expect(rows[1].cajaInicial).toBe(0);
    expect(rows[12].cajaFinal).toBe(0);
  });

  it('aplica los defaults pctIVACostos=0.77 y pctIVAOC=0.05 cuando cfData no los trae', () => {
    const rows = cfRowsMatrix({
      activeProjects: [{ id: 'A', contractType: 'suma_alzada' }],
      getCosto: (id, m) => (m === 1 ? 1000 : 0),
      getOC:    (m) => (m === 1 ? 200 : 0),
      controlMonth: 12,
      cfData: {}, // sin pctIVACostos/pctIVAOC → defaults
    });
    // ivaCredito = -(0.77*0.19*1000 + 0.05*0.19*200) = -(146.3 + 1.9) = -148.2
    expect(rows[1].ivaCredito).toBeCloseTo(-148.2, 6);
  });
});

// ── Override de CxC reemplaza al default; default solo en meses de proyección ───────
describe('cfRowsMatrix — CxC override vs default', () => {
  const base = {
    activeProjects: [{ id: 'A', contractType: 'suma_alzada' }],
    getAnticipo: () => 0,
    getCosto:    () => 0,
    getIngreso:  (id, m) => (m <= 2 ? 1000 : 500), // baja el ingreso en proyección → CxC default ≠ 0
    getOtrosIng: () => 0,
    getOC:       () => 0,
    controlMonth: 2,
    cajaInicialEfectiva: 0,
  };

  it('mes de proyección sin override usa cxcDefault (1 mes de desfase, factor 1.19)', () => {
    const rows = cfRowsMatrix({ ...base, cfData: { cxc: {} } });
    // m3: (totalIngOp m2 - 0 - (totalIngOp m3 - 0)) * 1.19 = (1000 - 500) * 1.19 = 595
    expect(rows[3].cxcDefault).toBeCloseTo(595, 6);
    expect(rows[3].cxc).toBeCloseTo(595, 6);
  });

  it('override de CxC distinto de 0 reemplaza al default', () => {
    const rows = cfRowsMatrix({ ...base, cfData: { cxc: { 3: -100 } } });
    expect(rows[3].cxcDefault).toBeCloseTo(595, 6); // el default se computa igual...
    expect(rows[3].cxc).toBe(-100);                  // ...pero el override (≠0) manda
  });

  it('override de CxC en 0 NO reemplaza (cae al default)', () => {
    const rows = cfRowsMatrix({ ...base, cfData: { cxc: { 3: 0 } } });
    expect(rows[3].cxc).toBeCloseTo(595, 6); // 0 se trata como "sin override"
  });
});
