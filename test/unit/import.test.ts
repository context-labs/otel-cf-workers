import { expect, it } from '@effect/vitest'
import { Effect } from 'effect'

import * as otelCfWorkers from '../../src/index'
import { instrument } from '../../src/index'

it.effect('can import in esm', () =>
	Effect.sync(() => {
		expect(otelCfWorkers).toBeDefined()
		expect(otelCfWorkers.instrument).toBeTypeOf('function')

		expect(instrument).toBeDefined()
		expect(instrument).toBeTypeOf('function')
	}),
)
