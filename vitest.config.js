import { defineConfig } from 'vitest/config';

// Solo testeamos la biblioteca de cálculo del monolito (src/lib).
// El módulo ICEMM/ es una app separada con su propio toolchain de tests
// (su propio node_modules/xlsx); no se corre desde la raíz.
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.js'],
    exclude: ['**/node_modules/**', 'ICEMM/**'],
  },
});
