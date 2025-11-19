import { Attributes, AttributeValue } from '@opentelemetry/api'
import {
	ATTR_USER_AGENT_BROWSER_NAME,
	ATTR_USER_AGENT_BROWSER_VERSION,
	ATTR_USER_AGENT_BROWSER_MAJOR_VERSION,
	ATTR_USER_AGENT_OS_NAME,
	ATTR_USER_AGENT_OS_VERSION,
	ATTR_USER_AGENT_ENGINE_NAME,
	ATTR_USER_AGENT_ENGINE_VERSION,
	ATTR_USER_AGENT_DEVICE_TYPE,
	ATTR_USER_AGENT_DEVICE_VENDOR,
	ATTR_USER_AGENT_DEVICE_MODEL,
} from '../constants.js'

function isValidAttributeValue(value: unknown): value is AttributeValue {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/**
 * Parse user agent attributes from Request.cf
 * Cloudflare provides pre-parsed user agent data via the cf property
 */
export function gatherUserAgentAttributes(request: Request): Attributes {
	const attrs: Attributes = {}

	// Request.cf might not be available in all contexts
	if (!request.cf) {
		return attrs
	}

	const cfData = request.cf as Record<string, unknown>

	// Browser information
	if (cfData['browser']) {
		const browser = cfData['browser'] as Record<string, unknown>
		if (isValidAttributeValue(browser['name'])) attrs[ATTR_USER_AGENT_BROWSER_NAME] = browser['name']
		if (isValidAttributeValue(browser['version'])) attrs[ATTR_USER_AGENT_BROWSER_VERSION] = browser['version']
		if (isValidAttributeValue(browser['major'])) attrs[ATTR_USER_AGENT_BROWSER_MAJOR_VERSION] = browser['major']
	}

	// OS information
	if (cfData['os']) {
		const os = cfData['os'] as Record<string, unknown>
		if (isValidAttributeValue(os['name'])) attrs[ATTR_USER_AGENT_OS_NAME] = os['name']
		if (isValidAttributeValue(os['version'])) attrs[ATTR_USER_AGENT_OS_VERSION] = os['version']
	}

	// Engine information
	if (cfData['engine']) {
		const engine = cfData['engine'] as Record<string, unknown>
		if (isValidAttributeValue(engine['name'])) attrs[ATTR_USER_AGENT_ENGINE_NAME] = engine['name']
		if (isValidAttributeValue(engine['version'])) attrs[ATTR_USER_AGENT_ENGINE_VERSION] = engine['version']
	}

	// Device information
	if (cfData['device']) {
		const device = cfData['device'] as Record<string, unknown>
		if (isValidAttributeValue(device['type'])) attrs[ATTR_USER_AGENT_DEVICE_TYPE] = device['type']
		if (isValidAttributeValue(device['vendor'])) attrs[ATTR_USER_AGENT_DEVICE_VENDOR] = device['vendor']
		if (isValidAttributeValue(device['model'])) attrs[ATTR_USER_AGENT_DEVICE_MODEL] = device['model']
	}

	return attrs
}
