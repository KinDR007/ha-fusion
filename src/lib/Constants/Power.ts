/**
 * Helpers for the `power_button` tile.
 *
 * Two operating modes:
 *
 *   1. **Switch mode** — `entity_id` is a controllable (`switch.*`,
 *      `light.*`, `input_boolean.*`). The companion power / energy
 *      sensors are derived by suffix on the base (`sensor.<base>_power`,
 *      `sensor.<base>_energy`).
 *
 *   2. **Meter mode** — `entity_id` is itself a `sensor.*` reporting
 *      either Watts (device_class:'power') or kWh (device_class:'energy').
 *      We use that sensor directly as the power or energy source and try
 *      to discover its sibling on the same device.
 *
 * Either mode honors explicit `sel.power_sensor` / `sel.energy_sensor`
 * overrides — those always win.
 */

export interface PowerCompanions {
	/** True when entity_id is a passive sensor (no toggle UI). */
	meterMode: boolean;
	/** Resolved Watts source (may be the entity_id itself in meter mode). */
	powerSensor: string;
	/** Resolved cumulative-energy source (may be empty). */
	energySensor: string;
	/** Canonical "base" string used for sibling lookup. */
	base: string;
}

const POWER_SUFFIXES = ['_power', '_w', '_watts'];
const ENERGY_SUFFIXES = [
	'_energy',
	'_today_energy',
	'_energy_today',
	'_total_energy',
	'_consumption',
	'_kwh'
];

function stripKnownSuffix(rawBase: string): string {
	for (const s of [...POWER_SUFFIXES, ...ENERGY_SUFFIXES]) {
		if (rawBase.endsWith(s)) return rawBase.slice(0, -s.length);
	}
	return rawBase;
}

function findBySuffixes(
	base: string,
	suffixes: string[],
	states: Record<string, any> | undefined
): string {
	if (!base || !states) return '';
	for (const s of suffixes) {
		const candidate = `sensor.${base}${s}`;
		if (states[candidate]) return candidate;
	}
	return '';
}

function isPowerSensor(eid: string, ent: any): boolean {
	const dc = ent?.attributes?.device_class;
	const unit = ent?.attributes?.unit_of_measurement;
	if (dc === 'power') return true;
	if (unit === 'W' || unit === 'kW' || unit === 'mW') return true;
	const rawBase = eid.split('.')[1] || '';
	return POWER_SUFFIXES.some((s) => rawBase.endsWith(s));
}

function isEnergySensor(eid: string, ent: any): boolean {
	const dc = ent?.attributes?.device_class;
	const unit = ent?.attributes?.unit_of_measurement;
	if (dc === 'energy') return true;
	if (unit === 'kWh' || unit === 'Wh' || unit === 'MWh') return true;
	const rawBase = eid.split('.')[1] || '';
	return ENERGY_SUFFIXES.some((s) => rawBase.endsWith(s));
}

export function derivePowerCompanions(
	entity_id: string | undefined,
	states: Record<string, any> | undefined,
	overrides: { power_sensor?: string; energy_sensor?: string } = {}
): PowerCompanions {
	if (!entity_id) {
		return { meterMode: false, powerSensor: '', energySensor: '', base: '' };
	}

	const dot = entity_id.indexOf('.');
	const domain = dot > 0 ? entity_id.slice(0, dot) : '';
	const rawBase = dot > 0 ? entity_id.slice(dot + 1) : entity_id;

	if (domain === 'sensor') {
		const base = stripKnownSuffix(rawBase);
		const ent = states?.[entity_id];

		let powerSensor = overrides.power_sensor || '';
		let energySensor = overrides.energy_sensor || '';

		if (isPowerSensor(entity_id, ent)) {
			powerSensor = powerSensor || entity_id;
			energySensor = energySensor || findBySuffixes(base, ENERGY_SUFFIXES, states);
		} else if (isEnergySensor(entity_id, ent)) {
			energySensor = energySensor || entity_id;
			powerSensor = powerSensor || findBySuffixes(base, POWER_SUFFIXES, states);
		} else {
			/* unknown sensor — best effort */
			powerSensor = powerSensor || findBySuffixes(base, POWER_SUFFIXES, states) || entity_id;
			energySensor = energySensor || findBySuffixes(base, ENERGY_SUFFIXES, states);
		}

		return { meterMode: true, powerSensor, energySensor, base };
	}

	/* controllable domain (switch / light / input_boolean / outlet / …) */
	return {
		meterMode: false,
		powerSensor:
			overrides.power_sensor ||
			findBySuffixes(rawBase, POWER_SUFFIXES, states) ||
			(rawBase ? `sensor.${rawBase}_power` : ''),
		energySensor:
			overrides.energy_sensor || findBySuffixes(rawBase, ENERGY_SUFFIXES, states),
		base: rawBase
	};
}

/**
 * True when the given entity is something the power_button picker
 * should offer the user. Two cases:
 *   - toggleable with a companion power sensor (switch mode)
 *   - sensor with device_class power or energy (meter mode)
 */
export function isPowerButtonCapable(
	eid: string,
	states: Record<string, any> | undefined
): boolean {
	if (!eid || !states) return false;
	const dot = eid.indexOf('.');
	if (dot < 1) return false;
	const domain = eid.slice(0, dot);
	const rawBase = eid.slice(dot + 1);

	if (domain === 'switch' || domain === 'light' || domain === 'input_boolean') {
		return findBySuffixes(rawBase, POWER_SUFFIXES, states) !== '';
	}

	if (domain === 'sensor') {
		const ent = states[eid];
		return isPowerSensor(eid, ent) || isEnergySensor(eid, ent);
	}

	return false;
}

/**
 * List entries shaped for the `<Select>` component:
 *   { id, label, hint }
 * Sorted so entries sharing the picked entity's "base" come first
 * (same physical device), then everything else alphabetically. This
 * means once you pick e.g. `switch.dryer`, the dropdown surfaces
 * `sensor.dryer_power` before unrelated sensors.
 */
function listSensorsByPredicate(
	predicate: (eid: string, ent: any) => boolean,
	states: Record<string, any> | undefined,
	preferredBase: string
): Array<{ id: string; label: string; hint: string }> {
	if (!states) return [];
	const matches: Array<{ id: string; label: string; hint: string; matchesBase: boolean }> = [];
	for (const eid of Object.keys(states)) {
		if (!eid.startsWith('sensor.')) continue;
		const ent = states[eid];
		if (!predicate(eid, ent)) continue;
		const friendly = ent?.attributes?.friendly_name || eid;
		const unit = ent?.attributes?.unit_of_measurement || '';
		const rawBase = eid.slice('sensor.'.length);
		const stripped = stripKnownSuffix(rawBase);
		const matchesBase = !!preferredBase && stripped === preferredBase;
		matches.push({
			id: eid,
			label: `${friendly}${unit ? ` (${unit})` : ''}`,
			hint: eid,
			matchesBase
		});
	}
	matches.sort((a, b) => {
		if (a.matchesBase !== b.matchesBase) return a.matchesBase ? -1 : 1;
		return a.label.localeCompare(b.label);
	});
	return matches.map(({ id, label, hint }) => ({ id, label, hint }));
}

export function listPowerSensorOptions(
	states: Record<string, any> | undefined,
	preferredBase = ''
) {
	return listSensorsByPredicate(isPowerSensor, states, preferredBase);
}

export function listEnergySensorOptions(
	states: Record<string, any> | undefined,
	preferredBase = ''
) {
	return listSensorsByPredicate(isEnergySensor, states, preferredBase);
}
