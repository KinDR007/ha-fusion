/**
 * Detection / labeling helpers for entities exposed by the `victron_mqtt` HA
 * integration.
 *
 * The integration uses TWO naming conventions:
 *
 *   1. Native devices (via DBUS, share a single Venus GX hwid):
 *        sensor.victron_mqtt_<hwid>_<device_type>_<inst>_<suffix>
 *      device_type ∈ { system, vebus, solarcharger, battery, ... }
 *
 *   2. External / third-party devices (each gets its own vendor prefix):
 *        sensor.<vendor>_id_<inst>_<suffix>
 *      vendor examples:  jk_bms, smartshunt_500a_50mv, smartsolar_charger_mppt_150_35, ...
 *
 * Suffix names DIFFER WILDLY between (1) and (2) even for the same logical
 * metric — e.g. PV yield power is `solarcharger_yield_power` on a native
 * MPPT 75/15 but `pv_yield_power` on an externally-discovered MPPT 150/35.
 * That makes any hardcoded list of "good" suffixes brittle, so we don't
 * try to whitelist them; we just match the two URL patterns above and let
 * the user pick any metric by its friendly name.
 */

/** Native Victron device naming pattern. */
const NATIVE_RE = /^sensor\.victron_mqtt_[a-f0-9]+_([a-z]+)_(\d+)_(.+)$/;

/** External device (per-vendor prefix) pattern. */
const VENDOR_RE = /^sensor\.([a-z][a-z0-9_]*?)_id_(\d+)_(.+)$/;

/** Result of parsing a victron_mqtt entity_id. */
export interface VictronEntityInfo {
	/** Which naming convention the entity uses. */
	kind: 'native' | 'vendor';
	/** For native: device_type token (battery/solarcharger/vebus/system/...).
	 *  For vendor: the vendor prefix (jk_bms / smartshunt_500a_50mv / ...). */
	group: string;
	/** Device DBUS instance ID (274, 275, 288, 289, 512, 0, ...). */
	inst: string;
	/** Suffix part of the entity_id (after the instance id). */
	suffix: string;
}

export function parseVictronEntity(entityId: string): VictronEntityInfo | null {
	let m = entityId.match(NATIVE_RE);
	if (m) return { kind: 'native', group: m[1], inst: m[2], suffix: m[3] };
	m = entityId.match(VENDOR_RE);
	if (m) return { kind: 'vendor', group: m[1], inst: m[2], suffix: m[3] };
	return null;
}

/** Return true if entity_id looks like it comes from the victron_mqtt integration. */
export function isCuratedVictronEntity(entityId: string): boolean {
	return parseVictronEntity(entityId) !== null;
}

/**
 * Map native device tokens and a few well-known external vendor prefixes to
 * short user-friendly group codes for display in pickers.
 *
 * Unknown groups fall back to the raw token. This keeps the picker usable
 * even with a Victron device this integration doesn't have a shortcode for
 * yet (we just show e.g. `[pylontech 7]` until we add it here).
 */
const SHORTCODE_MAP: Record<string, string> = {
	// native device types
	battery: 'BMS',
	solarcharger: 'MPPT',
	vebus: 'INV',
	system: 'GX',
	systemsetup: 'GX',

	// vendor prefixes (kept short for picker readability)
	jk_bms: 'JK-BMS',
	smartshunt_500a_50mv: 'SmartShunt',
	smartsolar_charger_mppt_75_15: 'MPPT 75/15',
	smartsolar_charger_mppt_150_35: 'MPPT 150/35'
};

export function getVictronGroupShortcode(group: string): string {
	return SHORTCODE_MAP[group] || group;
}

/**
 * Default Iconify icon for a Victron device group. Picked to be quickly
 * recognisable on a small dashboard tile (solar panel for MPPT, battery for
 * BMS, AC sine wave for the inverter, ...). The user can override it via the
 * Icon field in `VictronButtonConfig`.
 *
 * Returns an MDI icon identifier ready for `<Icon icon="…" />`.
 */
const ICON_MAP: Record<string, string> = {
	// native device types
	battery: 'mdi:battery',
	solarcharger: 'mdi:solar-power',
	vebus: 'mdi:current-ac',
	system: 'mdi:hub',
	systemsetup: 'mdi:hub',

	// vendor prefixes
	jk_bms: 'mdi:battery-high',
	smartshunt_500a_50mv: 'mdi:gauge',
	smartsolar_charger_mppt_75_15: 'mdi:solar-power',
	smartsolar_charger_mppt_150_35: 'mdi:solar-power'
};

export function getVictronDefaultIcon(group: string): string | undefined {
	return ICON_MAP[group];
}

/**
 * Helper for picking a default icon directly from an entity_id.
 * Useful in tile components and the config dialog so we don't have to
 * import both `parseVictronEntity` and `getVictronDefaultIcon` everywhere.
 */
export function getVictronDefaultIconForEntity(entityId: string): string | undefined {
	const info = parseVictronEntity(entityId);
	return info ? getVictronDefaultIcon(info.group) : undefined;
}
