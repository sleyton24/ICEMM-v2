import { describe, it, expect } from 'vitest';
import { variacionPartida, estadoControl, controlPartida, kpisControl } from './controlCostos.js';

describe('variacionPartida', () => {
  it('variación absoluta = real - ppto', () => {
    expect(variacionPartida(100, 130).variacionUf).toBe(30);
  });
  it('variación % respecto al ppto', () => {
    expect(variacionPartida(100, 130).variacionPct).toBeCloseTo(30, 6);
  });
  it('ppto 0 → variacionPct null (no divide por cero)', () => {
    expect(variacionPartida(0, 50).variacionPct).toBeNull();
  });
});

describe('estadoControl (port informe_lq.py:302-315)', () => {
  it('real 0 → SIN EJECUCION (aunque haya ppto)', () => {
    expect(estadoControl(100, 0)).toBe('SIN EJECUCION');
  });
  it('ppto 0 con real > 0 → SOLO REAL', () => {
    expect(estadoControl(0, 40)).toBe('SOLO REAL');
  });
  it('variación > 15% → CRITICO', () => {
    expect(estadoControl(100, 120)).toBe('CRITICO'); // +20%
  });
  it('variación > 5% y <= 15% → ALERTA', () => {
    expect(estadoControl(100, 110)).toBe('ALERTA'); // +10%
    expect(estadoControl(100, 115)).toBe('ALERTA'); // +15% (no es > 15)
  });
  it('borde exacto +15% → ALERTA (no CRITICO)', () => {
    expect(estadoControl(100, 115)).toBe('ALERTA');
  });
  it('borde +15.01% → CRITICO', () => {
    expect(estadoControl(100, 115.01)).toBe('CRITICO');
  });
  it('variación entre -5% y +5% → EN CONTROL', () => {
    expect(estadoControl(100, 103)).toBe('EN CONTROL');
    expect(estadoControl(100, 97)).toBe('EN CONTROL');
    expect(estadoControl(100, 95)).toBe('EN CONTROL'); // -5% exacto (>= -5)
    expect(estadoControl(100, 105)).toBe('EN CONTROL'); // +5% exacto (no > 5)
  });
  it('variación < -5% → FAVORABLE', () => {
    expect(estadoControl(100, 90)).toBe('FAVORABLE'); // -10%
  });
  it('borde -5.01% → FAVORABLE', () => {
    expect(estadoControl(100, 94.99)).toBe('FAVORABLE');
  });
});

describe('controlPartida', () => {
  it('arma la fila completa', () => {
    expect(controlPartida(100, 130)).toEqual({
      ppto: 100, real: 130, variacionUf: 30, variacionPct: 30, estado: 'CRITICO',
    });
  });
  it('partida sin ejecución', () => {
    const r = controlPartida(50, 0);
    expect(r.estado).toBe('SIN EJECUCION');
    expect(r.variacionUf).toBe(-50);
  });
});

describe('kpisControl', () => {
  it('totales, variación y % de ejecución', () => {
    const k = kpisControl([
      { ppto: 100, real: 80 },
      { ppto: 100, real: 140 },
    ]);
    expect(k.pptoTotal).toBe(200);
    expect(k.realTotal).toBe(220);
    expect(k.variacionUf).toBe(20);
    expect(k.variacionPct).toBeCloseTo(10, 6);
    expect(k.pctEjecucion).toBeCloseTo(110, 6);
  });
  it('lista vacía → totales 0 y pct null', () => {
    const k = kpisControl([]);
    expect(k.pptoTotal).toBe(0);
    expect(k.realTotal).toBe(0);
    expect(k.variacionPct).toBeNull();
    expect(k.pctEjecucion).toBeNull();
  });
});
