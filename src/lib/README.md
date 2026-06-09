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
| `clasificacion.js` | `classifyManagerCode` + constantes `COST_CATS`, `PROJ_CATS`, `DEFAULT_COST_PCTS`, `OC_CATS`, `OC_PLAN`, `emptyBudget` |
| `ingresos.js` | `calcMonthlyRevenue` (Suma Alzada / Admin Delegada), `snapshotProjects` |
| `flujocaja.js` | fórmulas puras de caja: `ivaDebito`, `ivaCredito`, `ivaCredAcum`, `saldoContador`, `ivaNetoMes`, `ppm`, `fcMes`, `cajaFinal` |
| `resultado.js` | `ingresosTotales`, `resultadoOperacional`, `ebitda`, agregación `ytd`/`ytg`/`fy` |
| `formato.js` | `fUF`, `fN`, parseo de número chileno |

## Divergencias spec pinneadas (a resolver en Frente 3)

- **6 vs 8 categorías**: `COST_CATS.length === 6`; faltan `edificaciones_comerciales` y `post_venta`.
- **`classifyManagerCode`**: `600-649 → 'otros'` (spec: Edificaciones); `550-599` y `650-899 → 'no_clasificado'` (spec: 700-749 Post Venta, 800-899 Otros).
- **`calcMonthlyRevenue` (Suma Alzada)**: NO aplica devolución de anticipo (`advancePercent` solo informativo); ingreso neto actual = bruto × (1 − retención/100).
- **`normalizeCurve`**: el comentario dice "2 decimales" pero redondea a 4.

## Correr

```bash
npm install        # una vez (instala vitest)
npm test           # watch mode
npm run test:run   # una corrida (CI)
```

Estado al 2026-06-09: **191 tests, 6 módulos, todo en verde.**
