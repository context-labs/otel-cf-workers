import { describe, it, expect } from 'vitest'

import { instrumentEnv } from '../../src/instrumentation/env'

describe('instrumentEnv', () => {
	// V8 keeps every distinct property name read from a workerd binding, so the
	// binding-type probe must read the same names on every access.
	it('reads the same property names from a binding on every access', () => {
		const names = new Set<string | symbol>()
		const binding = new Proxy({}, { get: (_target, prop) => (names.add(prop), undefined) })
		const env = instrumentEnv({ BINDING: binding })

		void env.BINDING
		const afterFirst = names.size
		for (let i = 0; i < 10; i++) void env.BINDING

		expect(afterFirst).toBeGreaterThan(0)
		expect(names.size).toBe(afterFirst)
	})
})
