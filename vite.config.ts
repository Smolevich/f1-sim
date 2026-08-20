/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

export default defineConfig({
  // Игра живёт в подкаталоге /f1/: в корне домена лежит лендинг с выбором
  // игры. Без base ссылки на бандл и модель уводили бы в корень.
  base: '/f1/',
  build: { target: 'es2022' },
  test: { environment: 'node', globals: true },
})
