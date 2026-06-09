// ─── MÓDULO: clasificacion ───────────────────────────────────────────────────
// Extraído VERBATIM del monolito fase1_proyectos.html.
// Golden master: preserva el comportamiento ACTUAL del monolito. NO corregir bugs aquí.

// Familias de costo directo (monolito líneas ~65-74). Frente 3: modelo de 8 categorías
// (alineado con la spec data-model.md/SKILL.md). 'otros' queda último (catch-all del prorrateo).
export const COST_CATS = [
  { id: 'materiales',          label: 'Materiales' },
  { id: 'mano_de_obra',        label: 'Mano de Obra' },
  { id: 'subcontratos',        label: 'Subcontratos' },
  { id: 'gastos_generales',    label: 'Gastos Generales' },
  { id: 'equipos_maquinarias', label: 'Equipos y Maquinarias' },
  { id: 'edificaciones_comerciales', label: 'Edificaciones Comerciales' },
  { id: 'post_venta',          label: 'Post Venta' },
  { id: 'otros',               label: 'Otros' },
];

// Prorrateo estándar por familia de costo (%) (monolito líneas ~75-82).
export const DEFAULT_COST_PCTS = {
  materiales:          17.51,
  mano_de_obra:        25.80,
  subcontratos:        45.63,
  gastos_generales:     6.10,
  equipos_maquinarias:  4.95,
  edificaciones_comerciales: 0,
  post_venta:           0,
  otros:                0.01,
};

// Categorías de proyecto (monolito líneas ~86-94). Igual a COST_CATS + 'no_clasificado'.
export const PROJ_CATS = [
  { id: 'materiales',          label: 'Materiales' },
  { id: 'mano_de_obra',        label: 'Mano de Obra' },
  { id: 'subcontratos',        label: 'Subcontratos' },
  { id: 'gastos_generales',    label: 'Gastos Generales' },
  { id: 'equipos_maquinarias', label: 'Equipos y Maq.' },
  { id: 'edificaciones_comerciales', label: 'Edificaciones Comerciales' },
  { id: 'post_venta',          label: 'Post Venta' },
  { id: 'otros',               label: 'Otros' },
  { id: 'no_clasificado',      label: 'Sin Clasificar' },
];

// Categorías de Oficina Central (monolito líneas ~124-141).
export const OC_CATS = [
  { id: 'back_office',        label: 'Back Office Servicios SANVEST' },
  { id: 'rrhh',               label: 'Recursos Humanos Of Central' },
  { id: 'marketing',          label: 'Marketing y Ventas' },
  { id: 'software_redes',     label: 'Uso de Softwares y Redes' },
  { id: 'cuentas_servicio',   label: 'Cuentas de Servicio' },
  { id: 'gastos_gral_of',     label: 'Gastos Generales Oficina' },
  { id: 'arriendo_oficinas',  label: 'Arriendo Oficinas' },
  { id: 'costos_financieros', label: 'Costos Financieros' },
  { id: 'costos_legales',     label: 'Costos Legales' },
  { id: 'arriendo_bodega',    label: 'Arriendos Bodega Central' },
  { id: 'asesorias',          label: 'Asesorías - Consultorías - Proyectos' },
  { id: 'directorio',         label: 'Directorio' },
  { id: 'post_venta_oc',      label: 'Costos de Post Venta' },
  { id: 'dev_capital',        label: 'Devolución de Capital de Trabajo' },
  { id: 'incentivos',         label: 'Política de Incentivos Of Central' },
  { id: 'otros_oc',           label: 'Otros' },
];

// Plan de cuentas OC: código Manager → categoría presupuesto (en orden del plan)
// (monolito líneas ~144-161).
export const OC_PLAN = [
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
];

// Presupuesto vacío por familia de costo (monolito líneas ~346-348). Depende de COST_CATS.
export function emptyBudget() {
  return Object.fromEntries(COST_CATS.map(c => [c.id, '']));
}

// Clasificación de código de cuenta Manager → familia de costo (monolito líneas ~2245-2262).
// Frente 3: alineado con la spec data-model.md:151-162 (8 categorías):
//   600-649 → edificaciones_comerciales, 700-749 → post_venta, 800-899 → otros.
// GAPS reales (no definidos ni por la spec ni por el código): 550-599, 650-699, 750-799
//   caen en 'no_clasificado'. Vigilar: si contabilidad emite esos códigos, hay que mapearlos.
export function classifyManagerCode(code) {
  const n = +String(code ?? '').trim();
  if (isNaN(n) || n === 0) return 'no_clasificado';
  if (n >= 100 && n <= 149) return 'materiales';
  if (n >= 200 && n <= 249) return 'mano_de_obra';
  if (n >= 300 && n <= 399) return 'subcontratos';
  if (n >= 400 && n <= 499) return 'gastos_generales';
  if (n >= 500 && n <= 549) return 'equipos_maquinarias';
  if (n >= 600 && n <= 649) return 'edificaciones_comerciales';
  if (n >= 700 && n <= 749) return 'post_venta';
  if (n >= 800 && n <= 899) return 'otros';
  if (n >= 900)             return 'oficina_central';
  return 'no_clasificado';
}
