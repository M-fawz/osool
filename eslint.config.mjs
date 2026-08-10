import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

/**
 * Lint.
 *
 * `next lint` was removed as a command, and the script in package.json had been
 * pointing at a binary that was never installed — so "lint passes" had been
 * true only in the sense that nothing ran. This is the actual configuration.
 *
 * `next/core-web-vitals` carries the rules that catch the mistakes this
 * codebase can genuinely make: a raw <img> where next/image belongs, a
 * synchronous script in a Server Component, a missing hook dependency. It is
 * deliberately not extended with a house style — formatting disagreements are
 * not what a government register needs its CI minutes spent on.
 */

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      // The design tooling vendored under .claude, the local database, the
      // local object store, and generated proof artefacts. None of it is this
      // project's source.
      '.claude/**',
      '.postgres/**',
      '.storage/**',
      '.proof/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Prisma's generated types surface `any` in a few places that this code
      // has to name; an error here would be a lint failure about someone
      // else's type definitions.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Deliberate discards are written `void x` or `_x` in this codebase.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
    },
  },
]

export default config
