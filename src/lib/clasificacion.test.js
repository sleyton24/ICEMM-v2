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

// Golden master del modelo de 8 categorías (Frente 3). Estos tests FIJAN el
// comportamiento ACTUAL del monolito tras la migración. classifyManagerCode quedó
// alineado con la spec data-model.md:151-162.

describe('classifyManagerCode — bordes (8 categorías)', () => {
  it('código 0 → no_clasificado', () => {
    expect(classifyManagerCode(0)).toBe('no_clasificado');
  });
  it('cadena vacía "" → no_clasificado (+"".trim() === 0)', () => {
    expect(classifyManagerCode('')).toBe('no_clasificado');
  });
  it('null → no_clasificado', () => {
    expect(classifyManagerCode(null)).toBe('no_clasificado');
  });
  it('undefined → no_clasificado', () => {
    expect(classifyManagerCode(undefined)).toBe('no_clasificado');
  });
  it('no numérico "abc" → no_clasificado (isNaN)', () => {
    expect(classifyManagerCode('abc')).toBe('no_clasificado');
  });

  // materiales 100-149
  it('100 → materiales (límite inferior)', () => expect(classifyManagerCode(100)).toBe('materiales'));
  it('149 → materiales (límite superior)', () => expect(classifyManagerCode(149)).toBe('materiales'));
  it('150 → no_clasificado (hueco 150-199)', () => expect(classifyManagerCode(150)).toBe('no_clasificado'));

  // mano_de_obra 200-249
  it('200 → mano_de_obra', () => expect(classifyManagerCode(200)).toBe('mano_de_obra'));
  it('249 → mano_de_obra', () => expect(classifyManagerCode(249)).toBe('mano_de_obra'));

  // subcontratos 300-399
  it('300 → subcontratos', () => expect(classifyManagerCode(300)).toBe('subcontratos'));
  it('399 → subcontratos', () => expect(classifyManagerCode(399)).toBe('subcontratos'));

  // gastos_generales 400-499
  it('400 → gastos_generales', () => expect(classifyManagerCode(400)).toBe('gastos_generales'));
  it('499 → gastos_generales', () => expect(classifyManagerCode(499)).toBe('gastos_generales'));

  // equipos_maquinarias 500-549
  it('500 → equipos_maquinarias', () => expect(classifyManagerCode(500)).toBe('equipos_maquinarias'));
  it('549 → equipos_maquinarias', () => expect(classifyManagerCode(549)).toBe('equipos_maquinarias'));

  // GAP 550-599
  it('550 → no_clasificado (hueco real 550-599)', () => expect(classifyManagerCode(550)).toBe('no_clasificado'));
  it('599 → no_clasificado (hueco real 550-599)', () => expect(classifyManagerCode(599)).toBe('no_clasificado'));

  // edificaciones_comerciales 600-649 (NUEVO en Frente 3)
  it('600 → edificaciones_comerciales (límite inferior)', () => expect(classifyManagerCode(600)).toBe('edificaciones_comerciales'));
  it('649 → edificaciones_comerciales (límite superior)', () => expect(classifyManagerCode(649)).toBe('edificaciones_comerciales'));

  // GAP 650-699
  it('650 → no_clasificado (hueco real 650-699)', () => expect(classifyManagerCode(650)).toBe('no_clasificado'));
  it('699 → no_clasificado (hueco real 650-699)', () => expect(classifyManagerCode(699)).toBe('no_clasificado'));

  // post_venta 700-749 (NUEVO en Frente 3)
  it('700 → post_venta (límite inferior)', () => expect(classifyManagerCode(700)).toBe('post_venta'));
  it('749 → post_venta (límite superior)', () => expect(classifyManagerCode(749)).toBe('post_venta'));

  // GAP 750-799
  it('750 → no_clasificado (hueco real 750-799)', () => expect(classifyManagerCode(750)).toBe('no_clasificado'));
  it('799 → no_clasificado (hueco real 750-799)', () => expect(classifyManagerCode(799)).toBe('no_clasificado'));

  // otros 800-899 (movido en Frente 3, antes era 600-649)
  it('800 → otros (límite inferior)', () => expect(classifyManagerCode(800)).toBe('otros'));
  it('899 → otros (límite superior)', () => expect(classifyManagerCode(899)).toBe('otros'));

  // oficina_central 900+
  it('900 → oficina_central (límite inferior)', () => expect(classifyManagerCode(900)).toBe('oficina_central'));
  it('1000 → oficina_central', () => expect(classifyManagerCode(1000)).toBe('oficina_central'));

  // tipos y espacios
  it('string "100" → materiales (coerción numérica)', () => expect(classifyManagerCode('100')).toBe('materiales'));
  it('"  300  " (espacios) → subcontratos (trim)', () => expect(classifyManagerCode('  300  ')).toBe('subcontratos'));
  it('número de control: cuenta 907 (OC) → oficina_central', () => expect(classifyManagerCode('907')).toBe('oficina_central'));
  it('número de control: cuenta 914 (OC otros) → oficina_central', () => expect(classifyManagerCode('914')).toBe('oficina_central'));
});

describe('Constantes de categorías (8 categorías)', () => {
  it('COST_CATS tiene exactamente 8 categorías', () => {
    expect(COST_CATS.length).toBe(8);
  });

  it('COST_CATS conserva ids y orden de la spec (otros queda último)', () => {
    expect(COST_CATS.map(c => c.id)).toEqual([
      'materiales',
      'mano_de_obra',
      'subcontratos',
      'gastos_generales',
      'equipos_maquinarias',
      'edificaciones_comerciales',
      'post_venta',
      'otros',
    ]);
  });

  it('DEFAULT_COST_PCTS suma 100.00 (redondeado a 2 decimales)', () => {
    const sum = Object.values(DEFAULT_COST_PCTS).reduce((s, v) => s + v, 0);
    expect(Math.round(sum * 100) / 100).toBe(100.0);
  });

  it('DEFAULT_COST_PCTS incluye las 8 familias (las 2 nuevas en 0)', () => {
    expect(DEFAULT_COST_PCTS).toEqual({
      materiales:          17.51,
      mano_de_obra:        25.80,
      subcontratos:        45.63,
      gastos_generales:     6.10,
      equipos_maquinarias:  4.95,
      edificaciones_comerciales: 0,
      post_venta:           0,
      otros:                0.01,
    });
  });

  it('PROJ_CATS tiene 9 categorías (8 de costo + no_clasificado)', () => {
    expect(PROJ_CATS.length).toBe(9);
    expect(PROJ_CATS.map(c => c.id)).toEqual([
      'materiales',
      'mano_de_obra',
      'subcontratos',
      'gastos_generales',
      'equipos_maquinarias',
      'edificaciones_comerciales',
      'post_venta',
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

describe('emptyBudget (8 categorías)', () => {
  it('devuelve un objeto con las 8 claves de COST_CATS, todas cadena vacía', () => {
    expect(emptyBudget()).toEqual({
      materiales:          '',
      mano_de_obra:        '',
      subcontratos:        '',
      gastos_generales:    '',
      equipos_maquinarias: '',
      edificaciones_comerciales: '',
      post_venta:          '',
      otros:               '',
    });
  });

  it('las claves de emptyBudget coinciden con los ids de COST_CATS', () => {
    expect(Object.keys(emptyBudget())).toEqual(COST_CATS.map(c => c.id));
  });
});

describe('alineación con spec (Frente 3 — 8 categorías)', () => {
  // El monolito ahora cumple data-model.md:151-162 para estos rangos.
  it('600-649 → edificaciones_comerciales (antes "otros")', () => {
    expect(classifyManagerCode(600)).toBe('edificaciones_comerciales');
    expect(classifyManagerCode(625)).toBe('edificaciones_comerciales');
    expect(classifyManagerCode(649)).toBe('edificaciones_comerciales');
  });
  it('700-749 → post_venta (antes "no_clasificado")', () => {
    expect(classifyManagerCode(700)).toBe('post_venta');
    expect(classifyManagerCode(725)).toBe('post_venta');
    expect(classifyManagerCode(749)).toBe('post_venta');
  });
  it('800-899 → otros (antes "no_clasificado")', () => {
    expect(classifyManagerCode(800)).toBe('otros');
    expect(classifyManagerCode(850)).toBe('otros');
    expect(classifyManagerCode(899)).toBe('otros');
  });
  it('COST_CATS ahora incluye las 8 familias de la spec', () => {
    const ids = COST_CATS.map(c => c.id);
    expect(ids).toContain('edificaciones_comerciales');
    expect(ids).toContain('post_venta');
    expect(COST_CATS.length).toBe(8);
  });

  // GAPS reales remanentes (no definidos por la spec): vigilar con contabilidad.
  it('huecos reales 550-599, 650-699, 750-799 siguen en no_clasificado', () => {
    expect(classifyManagerCode(575)).toBe('no_clasificado');
    expect(classifyManagerCode(675)).toBe('no_clasificado');
    expect(classifyManagerCode(775)).toBe('no_clasificado');
  });
});
