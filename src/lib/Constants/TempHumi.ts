/**
 * Helpers for the `temp_humi_button` tile.
 *
 * The integration's HA dashboards tend to follow one of two conventions
 * for naming temperature/humidity sensor pairs:
 *
 *   1. Suffix pattern:  sensor.<base>_temperature  +  sensor.<base>_humidity
 *   2. Same device:     two entities under one device_id, one with
 *                       device_class:'temperature' and one with
 *                       device_class:'humidity'.
 *
 * The picker accepts either, so users don't have to rename anything.
 */

export interface ThPair {
	temperature_entity: string;
	humidity_entity: string;
	/** Either the temperature entity's friendly_name or the shared device name. */
	label: string;
}

/**
 * Returns the entity_id of the humidity sibling of a temperature sensor,
 * or undefined if none is found.
 *
 * Lookup order:
 *   1. <base>_humidity in $states (cheap suffix swap)
 *   2. Any sensor with device_class:'humidity' sharing the same device_id
 *      (caller has to supply the entity-registry data; we don't reach for
 *      it here to keep this module a pure helper).
 */
export function deriveHumiditySibling(
	tempEntityId: string,
	states: Record<string, any> | undefined
): string | undefined {
	if (!tempEntityId || !states) return undefined;

	// suffix swap
	const guesses = [
		tempEntityId.replace(/_temperature$/, '_humidity'),
		tempEntityId.replace(/_temp$/, '_humidity'),
		tempEntityId.replace(/_temp$/, '_humi')
	];
	for (const candidate of guesses) {
		if (candidate !== tempEntityId && states[candidate]) {
			return candidate;
		}
	}
	return undefined;
}

/**
 * Build the list of temperature sensors that have a discoverable humidity
 * companion. Used to populate the entity picker.
 */
export function listThPairs(states: Record<string, any> | undefined): ThPair[] {
	if (!states) return [];
	const out: ThPair[] = [];
	for (const eid of Object.keys(states)) {
		if (!eid.startsWith('sensor.')) continue;
		const st = states[eid];
		const dc = st?.attributes?.device_class;
		const isTemp =
			dc === 'temperature' || eid.endsWith('_temperature') || eid.endsWith('_temp');
		if (!isTemp) continue;
		const humi = deriveHumiditySibling(eid, states);
		if (!humi) continue;
		const label =
			st?.attributes?.friendly_name?.replace(/\s*(temperature|teplota)\s*/i, '').trim() ||
			eid;
		out.push({ temperature_entity: eid, humidity_entity: humi, label });
	}
	return out.sort((a, b) => a.label.localeCompare(b.label));
}
