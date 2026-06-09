# Modelo de Datos - Sistema de Control Presupuestario

## Entidades y Estructuras JSON

### Project
```json
{
  "id": "proj-002",
  "name": "La Quebrada",
  "unCode": "02",
  "contractType": "suma_alzada | admin_delegada",
  "status": "presupuestado | en_ejecucion | terminado",
  "startDate": "2025-07",
  "endDate": "2027-06",
  "durationMonths": 24,
  "replacesProject": null,
  "contract": {
    "originalAmount": 285390.89,
    "advancePercent": 10,
    "retentionPercent": 5,
    "extraordinaryWorks": [{ "description": "...", "amount": 1308.34, "month": "2026-06" }]
  },
  "budgetByCategory": {
    "materiales": 50000, "mano_de_obra": 65000, "subcontratos": 90000,
    "gastos_generales": 15000, "equipos_maquinarias": 12000,
    "edificaciones_comerciales": 0, "post_venta": 3546.76, "otros": 500
  },
  "costCurve": [0.001, 0.009, 0.010, ...],
  "revenueCurve": [0, 0, 0.042, 0.020, ...]
}
```

Para Admin Delegada, contract cambia a:
```json
{
  "cashAdvance": 1500,
  "monthlyGG": 858.63,
  "monthlyFee": 1188.50,
  "totalBudgetedCost": 263151.63
}
```

### AnnualBudget
```json
{
  "year": 2026,
  "status": "borrador | fijado",
  "projects": {
    "proj-002": {
      "monthlyRevenue": [0, 5886.26, 5886.26, ...],
      "monthlyCosts": {
        "materiales": [183.66, 367.32, ...],
        "mano_de_obra": [270.63, 541.26, ...],
        ...las 8 clasificaciones
      }
    }
  },
  "oficinaCentral": {
    "back_office": [104.75, 104.75, ...],
    "rrhh": [1331.37, 1331.37, ...],
    ...las 16 categorías
  },
  "otherIncome": { "asesorias": [77.9, 77.9, ...] }
}
```

### MonthlyActuals
```json
{
  "year": 2026, "month": 3,
  "projectCosts": {
    "proj-002": {
      "materiales": 150.91, "mano_de_obra": 999.90, "subcontratos": 1549.23,
      "gastos_generales": 364.16, "equipos_maquinarias": 171.97,
      "edificaciones_comerciales": 0, "post_venta": 0, "otros": 0
    }
  },
  "projectRevenue": { "proj-002": 0 },
  "oficinaCentral": { "back_office": 104.75, "rrhh": 1255.68, ... },
  "sourceFile": "Reporte_Manager_Marzo_2026.xlsx"
}
```

### Projection
```json
{
  "year": 2026, "lastControlMonth": 3,
  "projectCosts": {
    "proj-002": {
      "materiales": {
        "values": [805.09, 436.81, 150.91, 1000.13, ...],
        "isActual": [true, true, true, false, ...],
        "isOverride": [false, false, false, false, ...],
        "overrideValues": [null, null, null, null, ...]
      }
    }
  }
}
```

### Storage Keys
| Key | Contenido |
|---|---|
| `budget-control:config` | {activeYear, controlMonth} |
| `budget-control:projects` | Array de proyectos |
| `budget-control:budget:{year}` | Presupuesto fijo |
| `budget-control:projection:{year}` | Proyección dinámica |
| `budget-control:actuals:{year}:{month}` | Datos reales del mes |
| `budget-control:overrides:{year}` | Overrides manuales |
| `budget-control:cashflow:{year}` | Flujo de caja |
| `budget-control:uf-table` | Valores UF por mes |
| `budget-control:scenarios:{year}` | Escenarios |

---

## Lógica de Cálculos

### Proyección de Costos (mes M > mes control)
```
costoProyectado[M] = override[M] ?? (saldoPendiente × curva[M] / sumaCurvaRestante)
saldoPendiente = presupuesto_clasif − Σ(reales) − Σ(overrides_futuros)
```

### Ingresos Suma Alzada
```
EdP[M] = contratoVigente × curvaFacturacion[M]
devAnticipo[M] = −EdP[M] × anticipoPct / 100
retencion[M] = −EdP[M] × retencionPct / 100
ingresoNeto[M] = EdP[M] + devAnticipo[M] + retencion[M]
```

### Ingresos Admin Delegada
```
ingresoTotal[M] = costoReal[M] + monthlyGG + monthlyFee
```

### Resultado
```
resultadoOp = Σ(ingresosNetos) + otrosIngresos − Σ(costosProyectos)
resultado = resultadoOp − totalOficinaCentral
```

### Flujo de Caja
```
ivaPagar[M] = max(0, ivaDebito[M-1] − ivaCredito[M-1])
ppm[M] = ingresosFC[M-1] × 0.01
fcMes = ingresos + egresos + tributos + cxpCxc + inversionistas
cajaFinal = cajaInicial + fcMes
```

### Mapeo Reporte Manager → Clasificaciones
```
concepto1_codigo 100-149 → Materiales
concepto1_codigo 200-249 → Mano de Obra
concepto1_codigo 300-399 → Subcontratos
concepto1_codigo 400-499 → Gastos Generales
concepto1_codigo 500-549 → Equipos y Maquinarias
concepto1_codigo 600-649 → Edificaciones Comerciales
concepto1_codigo 700-749 → Post Venta
concepto1_codigo 800-899 → Otros
concepto1_codigo 900+    → Oficina Central (solo UN 01)
```
