# Biblioteca de cálculo ICEMM — `src/lib`

Funciones de cálculo **puras** extraídas **verbatim** del monolito `fase1_proyectos.html`,
con tests de regresión Vitest que **fijan el comportamiento ACTUAL** (golden master).

## Propósito

Red de seguridad **antes** de modularizar el monolito. Mientras el monolito siga siendo
la app productiva, estos módulos son una copia fiel de su lógica de cálculo; cuando se
migre a Vite, el monolito importará desde acá y se elimina la duplicación.

> Regla de oro: estos módulos replican el monolito **tal cual, incluidos sus bugs**. Los
> tests afirman el valor ACTUAL, no el de la especificación. Las divergencias con la spec
> (`files/data-model.md`, `files/phases.md`) están marcadas con `// DIVERGENCIA SPEC:` y en
> bloques `describe('divergencias con spec (a corregir en Frente 3)')`. **No "arreglar" acá**:
> los arreglos van en Frente 3, actualizando el test deliberadamente.

## Módulos

| Módulo | Contenido |
|---|---|
| `curvas.js` | `monthsBetween`, `generateSCurve`, `normalizeCurve`, `reescalarCurva`, `applyShift`, `projectMonthIdx` |
| `clasificacion.js` | `classifyManagerCode` + constantes `COST_CATS` (8), `PROJ_CATS`, `DEFAULT_COST_PCTS`, `OC_CATS`, `OC_PLAN`, `emptyBudget` — **fuente única del catálogo** |
| `ingresos.js` | `calcMonthlyRevenue` (Suma Alzada / Admin Delegada), `snapshotProjects` (importa `COST_CATS` de `clasificacion.js`) |
| `flujocaja.js` | fórmulas puras de caja: `ivaDebito`, `ivaCredito`, `ivaCredAcum`, `saldoContador`, `ivaNetoMes`, `ppm`, `fcMes`, `cajaFinal` |
| `resultado.js` | `ingresosTotales`, `resultadoOperacional`, `ebitda`, agregación `ytd`/`ytg`/`fy` |
| `formato.js` | `fUF`, `fN`, parseo de número chileno |
| `migracion.js` | `reclasificarActuals`, `migrarProjectBudget` — espeja la migración v2 del monolito |
| `validacionCarga.js` | `knownUNs`, `detectarUNsDesconocidas`, `detectarSinClasificar`, `mesesYaCargados` — validación de carga del Reporte Manager |

## Frente 3 — modelo de 8 categorías (RESUELTO 2026-06-09)

- ✅ **8 categorías**: `COST_CATS` ahora tiene las 8 de la spec (+`edificaciones_comerciales`, +`post_venta`); `otros` queda último (catch-all del prorrateo).
- ✅ **`classifyManagerCode`** alineado con spec: `600-649→edificaciones_comerciales`, `700-749→post_venta`, `800-899→otros`, `900+→oficina_central`.
- ✅ **Migración de datos** (`migrateSchema` en el monolito, `migracion.js` acá): reclasifica los actuals guardados re-ejecutando classify sobre el `concepto`; idempotente; no toca filas sin código. Verificado contra datos reales: **no cambia el costo total elegible al EBITDA**, solo redistribuye familias.

### Divergencias remanentes (vigilar / próximos frentes)

- **Huecos reales** sin código de spec: `550-599`, `650-699`, `750-799` → `no_clasificado`. En los datos reales de ICEMM no aparecen; confirmar con contabilidad si alguna vez se emiten.
- **`calcMonthlyRevenue` (Suma Alzada)**: aún NO aplica devolución de anticipo (`advancePercent` informativo); ingreso neto = bruto × (1 − retención/100). Pendiente decidir si se alinea a la spec.
- **`normalizeCurve`**: el comentario dice "2 decimales" pero redondea a 4 (cosmético).

## Correr

```bash
npm install        # una vez (instala vitest)
npm test           # watch mode
npm run test:run   # una corrida (CI)
```

## Validación de carga (Frente 3 — activada 2026-06-09)

El parser del Reporte Manager (`processManagerRows`) ahora **sí puebla `warnSet`** (antes
quedaba vacío y nada se advertía): avisa de **UNs desconocidas** (no proyecto ni OC '01' →
sus costos no se imputan a ningún proyecto) y de **códigos sin clasificación** (quedan fuera
del costo de obra). `confirmManagerLoad` además **avisa antes de sobrescribir** un mes ya
cargado. Lógica espejada y testeada en `validacionCarga.js`.

Estado al 2026-06-09: **224 tests, 9 módulos, todo en verde** (rama `frente3-8-categorias`).
