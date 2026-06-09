import { describe, it, expect } from 'vitest';
import {
  COST_CATS,
  DEFAULT_COST_PCTS,
  PROJ_CATS,
  OC_CATS,
  OC_PLAN,
  emptyBudget,
  classifyManagerCode,
} from './clasificacion.js';

// Golden master: estos tests FIJAN el comportamiento ACTUAL del monolito.
// Cualquier cambio de resultado en la futura modularización debe romper estos tests.

describe('classifyManagerCode — bordes (comportamiento ACTUAL)', () => {
  it('código 0 → no_clasificado', () => {
    expect(classifyManagerCode(0)).toBe('no_clasificado');
  });

  it('cadena vacía "" → no_clasificado (+"".trim() === 0)', () => {
    expect(classifyManagerCode('')).toBe('no_clasificado');
  });

  it('null → no_clasificado (code ?? "" === "")', () => {
    expect(classifyManagerCode(null)).toBe('no_clasificado');
  });

  it('undefined → no_clasificado (code ?? "" === "")', () => {
    expect(classifyManagerCode(undefined)).toBe('no_clasificado');
  });

  it('no numérico "abc" → no_clasificado (isNaN)', () => {
    expect(classifyManagerCode('abc')).toBe('no_clasificado');
  });

  // Rango materiales 100-149
  it('100 → materiales (límite inferior)', () => {
    expect(classifyManagerCode(100)).toBe('materiales');
  });
  it('149 → materiales (límite superior)', () => {
    expect(classifyManagerCode(149)).toBe('materiales');
  });
  it('150 → no_clasificado (justo fuera del rango materiales)', () => {
    expect(classifyManagerCode(150)).toBe('no_clasificado');
  });

  // Rango mano_de_obra 200-249
  it('200 → mano_de_obra (límite inferior)', () => {
    expect(classifyManagerCode(200)).toBe('mano_de_obra');
  });
  it('249 → mano_de_obra (límite superior)', () => {
    expect(classifyManagerCode(249)).toBe('mano_de_obra');
  });

  // Rango subcontratos 300-399
  it('300 → subcontratos (límite inferior)', () => {
    expect(classifyManagerCode(300)).toBe('subcontratos');
  });
  it('399 → subcontratos (límite superior)', () => {
    expect(classifyManagerCode(399)).toBe('subcontratos');
  });

  // Rango gastos_generales 400-499
  it('400 → gastos_generales (límite inferior)', () => {
    expect(classifyManagerCode(400)).toBe('gastos_generales');
  });
  it('499 → gastos_generales (límite superior)', () => {
    expect(classifyManagerCode(499)).toBe('gastos_generales');
  });

  // Rango equipos_maquinarias 500-549
  it('500 → equipos_maquinarias (límite inferior)', () => {
    expect(classifyManagerCode(500)).toBe('equipos_maquinarias');
  });
  it('549 → equipos_maquinarias (límite superior)', () => {
    expect(classifyManagerCode(549)).toBe('equipos_maquinarias');
  });
  it('550 → no_clasificado (hueco entre 550 y 599)', () => {
    expect(classifyManagerCode(550)).toBe('no_clasificado');
  });

  // Rango otros 600-649
  it('600 → otros (límite inferior)', () => {
    expect(classifyManagerCode(600)).toBe('otros');
  });
  it('649 → otros (límite superior)', () => {
    expect(classifyManagerCode(649)).toBe('otros');
  });
  it('650 → no_clasificado (justo fuera del rango otros)', () => {
    expect(classifyManagerCode(650)).toBe('no_clasificado');
  });

  // Hueco 650-899
  it('700 → no_clasificado (sin rama; spec lo asignaría a Post Venta)', () => {
    expect(classifyManagerCode(700)).toBe('no_clasificado');
  });
  it('899 → no_clasificado (límite superior del hueco previo a 900)', () => {
    expect(classifyManagerCode(899)).toBe('no_clasificado');
  });

  // Oficina central n >= 900
  it('900 → oficina_central (límite inferior)', () => {
    expect(classifyManagerCode(900)).toBe('oficina_central');
  });
  it('1000 → oficina_central', () => {
    expect(classifyManagerCode(1000)).toBe('oficina_central');
  });

  // Casos adicionales de borde: tipos y espacios.
  it('string "100" → materiales (coerción numérica)', () => {
    expect(classifyManagerCode('100')).toBe('materiales');
  });
  it('"  300  " (espacios) → subcontratos (trim antes de coercionar)', () => {
    expect(classifyManagerCode('  300  ')).toBe('subcontratos');
  });
  it('número de control realista: cuenta 907 (OC) → oficina_central', () => {
    expect(classifyManagerCode('907')).toBe('oficina_central');
  });
  it('número de control realista: cuenta 914 (OC otros) → oficina_central', () => {
    expect(classifyManagerCode('914')).toBe('oficina_central');
  });
});

describe('Constantes de categorías (comportamiento ACTUAL)', () => {
  it('COST_CATS tiene exactamente 6 categorías', () => {
    expect(COST_CATS.length).toBe(6);
  });

  it('COST_CATS conserva ids y orden ACTUALES', () => {
    expect(COST_CATS.map(c => c.id)).toEqual([
      'materiales',
      'mano_de_obra',
      'subcontratos',
      'gastos_generales',
      'equipos_maquinarias',
      'otros',
    ]);
  });

  it('DEFAULT_COST_PCTS suma 100.00 (redondeado a 2 decimales)', () => {
    const sum = Object.values(DEFAULT_COST_PCTS).reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(100.0);
  });

  it('DEFAULT_COST_PCTS conserva los porcentajes ACTUALES', () => {
    expect(DEFAULT_COST_PCTS).toEqual({
      materiales:          17.51,
      mano_de_obra:        25.80,
      subcontratos:        45.63,
      gastos_generales:     6.10,
      equipos_maquinarias:  4.95,
      otros:                0.01,
    });
  });

  it('PROJ_CATS tiene 7 categorías (6 de costo + no_clasificado)', () => {
    expect(PROJ_CATS.length).toBe(7);
    expect(PROJ_CATS.map(c => c.id)).toEqual([
      'materiales',
      'mano_de_obra',
      'subcontratos',
      'gastos_generales',
      'equipos_maquinarias',
      'otros',
      'no_clasificado',
    ]);
  });

  it('OC_CATS tiene 16 categorías con ids ACTUALES', () => {
    expect(OC_CATS.length).toBe(16);
    expect(OC_CATS.map(c => c.id)).toEqual([
      'back_office', 'rrhh', 'marketing', 'software_redes', 'cuentas_servicio',
      'gastos_gral_of', 'arriendo_oficinas', 'costos_financieros', 'costos_legales',
      'arriendo_bodega', 'asesorias', 'directorio', 'post_venta_oc', 'dev_capital',
      'incentivos', 'otros_oc',
    ]);
  });

  it('OC_PLAN tiene 16 entradas y mapea conceptos a catIds ACTUALES', () => {
    expect(OC_PLAN.length).toBe(16);
    expect(OC_PLAN).toEqual([
      { concepto: '907', catId: 'back_office'        },
      { concepto: '901', catId: 'rrhh'               },
      { concepto: '911', catId: 'marketing'          },
      { concepto: '902', catId: 'software_redes'     },
      { concepto: '903', catId: 'cuentas_servicio'   },
      { concepto: '904', catId: 'gastos_gral_of'     },
      { concepto: '905', catId: 'arriendo_oficinas'  },
      { concepto: '906', catId: 'costos_financieros' },
      { concepto: '912', catId: 'costos_legales'     },
      { concepto: '909', catId: 'arriendo_bodega'    },
      { concepto: '910', catId: 'asesorias'          },
      { concepto: '913', catId: 'directorio'         },
      { concepto: null,  catId: 'post_venta_oc'      },
      { concepto: null,  catId: 'dev_capital'        },
      { concepto: null,  catId: 'incentivos'         },
      { concepto: '914', catId: 'otros_oc'           },
    ]);
  });
});

describe('emptyBudget (comportamiento ACTUAL)', () => {
  it('devuelve un objeto con las 6 claves de COST_CATS, todas cadena vacía', () => {
    expect(emptyBudget()).toEqual({
      materiales:          '',
      mano_de_obra:        '',
      subcontratos:        '',
      gastos_generales:    '',
      equipos_maquinarias: '',
      otros:               '',
    });
  });

  it('las claves de emptyBudget coinciden con los ids de COST_CATS', () => {
    expect(Object.keys(emptyBudget())).toEqual(COST_CATS.map(c => c.id));
  });
});

describe('divergencias con spec (a corregir en Frente 3)', () => {
  // (a) 600-649 → 'otros' ACTUAL; la spec data-model.md:158 dice "Edificaciones Comerciales".
  it('(a) 600-649 mapea a "otros" (spec: Edificaciones Comerciales)', () => {
    expect(classifyManagerCode(600)).toBe('otros');
    expect(classifyManagerCode(625)).toBe('otros');
    expect(classifyManagerCode(649)).toBe('otros');
  });

  // (b) 650-899 → 'no_clasificado' ACTUAL; la spec define 700-749 Post Venta y 800-899 Otros.
  it('(b) 700-749 (spec: Post Venta) cae en "no_clasificado"', () => {
    expect(classifyManagerCode(700)).toBe('no_clasificado');
    expect(classifyManagerCode(725)).toBe('no_clasificado');
    expect(classifyManagerCode(749)).toBe('no_clasificado');
  });
  it('(b) 800-899 (spec: Otros) cae en "no_clasificado"', () => {
    expect(classifyManagerCode(800)).toBe('no_clasificado');
    expect(classifyManagerCode(850)).toBe('no_clasificado');
    expect(classifyManagerCode(899)).toBe('no_clasificado');
  });
  it('(b) 650 y otros del hueco 650-699 caen en "no_clasificado"', () => {
    expect(classifyManagerCode(650)).toBe('no_clasificado');
    expect(classifyManagerCode(699)).toBe('no_clasificado');
  });

  // (c) COST_CATS tiene 6 categorías; la spec exige 8 (faltan edificaciones_comerciales y post_venta).
  it('(c) COST_CATS tiene 6 categorías (spec exige 8: faltan edificaciones_comerciales y post_venta)', () => {
    expect(COST_CATS.length).toBe(6);
    const ids = COST_CATS.map(c => c.id);
    expect(ids).not.toContain('edificaciones_comerciales');
    expect(ids).not.toContain('post_venta');
  });
});
