---
name: construction-budget-control
description: >
  Skill para generar una interfaz HTML/React de control presupuestario integral para una empresa constructora chilena.
  El sistema modela el presupuesto anual versus la proyección dinámica mensual de proyectos de construcción,
  calculando resultado operacional de proyectos menos costos fijos de oficina central.
  Úsalo SIEMPRE que el usuario pida crear, generar o actualizar la interfaz o aplicación web del modelo de control
  presupuestario, el dashboard de gestión de la constructora, el sistema de seguimiento de proyectos y flujo de caja,
  o cualquier referencia a "el modelo", "la interfaz", "el dashboard" o "el sistema de control" en el contexto
  de presupuesto de construcción. También se activa cuando el usuario quiera agregar un proyecto nuevo al modelo,
  cargar datos mensuales de contabilidad, ajustar proyecciones, ver escenarios, o generar informes de gestión.
  NO usar para análisis de presupuestos unitarios por m² (usar construction-budget-analyst) ni para análisis
  contractual (usar construction-contract-analyst).
---

# Sistema de Control Presupuestario - Constructora ICEMM

## IMPORTANTE: Construcción por Fases

Este modelo es complejo. NUNCA intentar generarlo completo de una sola vez.
Se construye en 7 fases incrementales. Cada fase produce un archivo .jsx funcional
que se amplía en la fase siguiente.

**Lee `references/phases.md` para los prompts específicos de cada fase.**
Lee `references/data-model.md` para el modelo de datos y lógica de cálculos.
Lee `references/interface-spec.md` para la especificación visual de cada módulo.

## Contexto del Negocio

Empresa constructora chilena de mediano tamaño, alta calidad. Construye edificios
habitacionales, comerciales, de equipamiento y hoteles.

**Resultado Empresa = Margen Operacional Proyectos − Costos Fijos Oficina Central**

Todos los montos en UF (Unidad de Fomento chilena).

## Conceptos Clave

### Tipos de Contrato
- **Suma Alzada**: Anticipo (10%) + Estados de Pago − Dev. anticipo − Retención (5%)
- **Administración Delegada**: Rendiciones (=costo) + GG Of. Central + Honorario (=margen)

### Plan de Cuentas de Gestión (8 clasificaciones, igual para todos los proyectos)
1. Materiales  2. Mano de Obra  3. Subcontratos  4. Gastos Generales
5. Equipos y Maquinarias  6. Edificaciones Comerciales  7. Post Venta  8. Otros

### Unidades de Negocio
01=Oficina Central, 02+=Proyectos (dinámicos)

### Inputs Mensuales
- **Reporte Manager** (xlsx/csv): costos por UN y cuenta de gestión
- **Mayor ICEMM** (xlsx/csv): libro mayor para cuadratura contable

### Reglas Críticas
1. Presupuesto fijo NUNCA se modifica  
2. Proyección editable con override manual (celdas amarillas)
3. CxC en flujo de caja siempre manual
4. Oficina central = costo fijo independiente de proyectos
5. Multi-año: proyectos cruzan años, caja se concatena

## Tecnología
React .jsx único: Tailwind, Recharts, PapaParse, SheetJS (xlsx), window.storage API.
