/**
 * @file eslint.config.js
 * @description ESLint flat config (ESLint 8.57+): enforces cyclomatic complexity < 10 on every function.
 */

const BROWSER_GLOBALS = [
  'window', 'document', 'localStorage', 'sessionStorage', 'fetch', 'console', 'setTimeout',
  'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'AbortController',
  'alert', 'confirm', 'navigator', 'location', 'history', 'URL', 'URLSearchParams', 'Blob',
  'FormData', 'Event', 'CustomEvent', 'HTMLElement', 'MutationObserver', 'IntersectionObserver',
  'matchMedia', 'getComputedStyle', 'crypto', 'structuredClone', 'queueMicrotask', 'Intl',
  'AbortSignal', 'DOMException', 'setImmediate', 'performance', 'TextEncoder', 'TextDecoder'
];
const NODE_GLOBALS = ['process', 'Buffer', 'global', 'globalThis', '__dirname'];

const readonly = (names) => Object.fromEntries(names.map(name => [name, 'readonly']));

export default [
  { ignores: ['**/node_modules/**', '**/playwright-report/**', '**/test-results/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...readonly(BROWSER_GLOBALS), ...readonly(NODE_GLOBALS) }
    },
    rules: {
      complexity: ['error', 9],
      'no-unused-vars': 'error',
      'no-undef': 'error'
    }
  }
];
