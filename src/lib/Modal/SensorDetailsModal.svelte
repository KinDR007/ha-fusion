<!--
  SensorDetailsModal — rich read-only modal for sensor / binary_sensor.

  Layout (v2):
    • Title: user-set Name → entity friendly_name fallback (via getName)
    • Hero row: clicked entity + humidity sibling (when paired), each
      with state, unit and "last changed"
    • Related: secondary readings on the same device (pressure, dewpoint,
      illuminance, …). Battery is NOT here — it's device info.
    • Device: battery (attribute OR sibling), signal, linkquality,
      voltage, last_seen, last_changed
    • 24h graph: multi-series. Temperature/humidity/pressure each drawn
      on its own y-extent so they share the chart vertically. Series
      visibility is user-toggleable via chip buttons.
    • Attributes: collapsible dump of everything else.
-->
<script lang="ts">
	import { states, connection, lang, selectedLanguage } from '$lib/Stores';
	import Modal from '$lib/Modal/Index.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import Icon from '@iconify/svelte';
	import { getName, getDomain, relativeTime } from '$lib/Utils';
	import { findRelatedSiblings } from '$lib/Constants/TempHumi';
	import { scaleTime, scaleLinear } from 'd3-scale';
	import { line, area, curveMonotoneX } from 'd3-shape';
	import { extent, bisector } from 'd3-array';

	export let isOpen: boolean;
	export let sel: any;

	$: entity = $states?.[sel?.entity_id];
	$: domain = getDomain(sel?.entity_id);
	$: attributes = entity?.attributes || {};
	$: deviceClass = attributes?.device_class;
	$: unit = attributes?.unit_of_measurement || '';
	$: state = entity?.state;

	$: allSiblings = findRelatedSiblings(sel?.entity_id, $states).filter(
		(s) => s.entity_id !== sel?.entity_id
	);

	/**
	 * The humidity sibling is treated specially: it gets a hero card
	 * alongside the temperature, not a small "related" card.
	 */
	$: humiSibling = allSiblings.find((s) => s.kind === 'humidity');
	$: humiEntity = humiSibling ? $states?.[humiSibling.entity_id] : undefined;

	/**
	 * Battery sibling (own sensor entity, NOT an attribute on the clicked
	 * sensor) is moved into the Device section so the user doesn't see
	 * it twice and so battery info sits with other device-info fields.
	 */
	$: batterySibling = allSiblings.find((s) => s.kind === 'battery');
	$: batteryEntity = batterySibling ? $states?.[batterySibling.entity_id] : undefined;

	$: relatedReadings = allSiblings.filter(
		(s) => s.kind !== 'humidity' && s.kind !== 'battery'
	);

	$: isNumeric = (() => {
		if (domain === 'binary_sensor') return false;
		if (domain !== 'sensor') return false;
		return Number.isFinite(Number(state));
	})();

	function fmt(value: any, digits = 1): string {
		if (value === undefined || value === null || value === '') return '—';
		const n = Number(value);
		if (Number.isFinite(n)) {
			return new Intl.NumberFormat($selectedLanguage, {
				maximumFractionDigits: digits
			}).format(n);
		}
		return String(value);
	}

	function asDate(value: any): Date | undefined {
		if (!value) return undefined;
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? undefined : d;
	}

	/**
	 * Friendly labels + icons for "device info" attributes. Order in
	 * the array controls display order.
	 */
	const DEVICE_INFO_KEYS: Array<[string, string, string]> = [
		['battery_level', 'mdi:battery', 'battery'],
		['battery_state', 'mdi:battery-charging', 'battery_state'],
		['signal_strength', 'mdi:signal', 'signal'],
		['rssi', 'mdi:wifi-strength-2', 'rssi'],
		['linkquality', 'mdi:zigbee', 'linkquality'],
		['voltage', 'mdi:flash', 'voltage'],
		['last_seen', 'mdi:clock-outline', 'last_seen'],
		['last_changed', 'mdi:clock-outline', 'last_changed']
	];

	$: deviceInfo = (() => {
		const out: Array<{ key: string; icon: string; labelKey: string; value: string }> = [];

		/* battery from sibling sensor takes precedence over attribute */
		if (batteryEntity) {
			out.push({
				key: 'battery',
				icon: 'mdi:battery',
				labelKey: 'battery',
				value: `${fmt(batteryEntity?.state, 0)} %`
			});
		}

		for (const [key, icon, labelKey] of DEVICE_INFO_KEYS) {
			if (key === 'battery_level' && batteryEntity) continue; /* already shown */

			let raw: any;
			if (key === 'last_changed') raw = entity?.last_changed;
			else raw = attributes?.[key];
			if (raw === undefined || raw === null || raw === '') continue;

			let display: string;
			if (key === 'battery_level') display = `${fmt(raw, 0)} %`;
			else if (key === 'signal_strength' || key === 'rssi') display = `${fmt(raw, 0)} dBm`;
			else if (key === 'voltage') display = `${fmt(raw, 2)} V`;
			else if (key === 'last_seen' || key === 'last_changed') {
				const d = asDate(raw);
				display = d ? relativeTime(d.toISOString(), $selectedLanguage) : String(raw);
			} else display = String(raw);

			out.push({ key, icon, labelKey, value: display });
		}
		return out;
	})();

	const HIDDEN_ATTRS = new Set([
		'unit_of_measurement',
		'icon',
		'friendly_name',
		'device_class',
		'state_class',
		'attribution',
		...DEVICE_INFO_KEYS.map(([k]) => k),
		'battery'
	]);
	$: extraAttrs = Object.entries(attributes).filter(([k]) => !HIDDEN_ATTRS.has(k));

	/* -----------------------------------------------------------------
	 * Multi-series 24h graph
	 * ----------------------------------------------------------------- */

	type Series = {
		key: 'primary' | 'humidity' | 'pressure' | 'dewpoint' | 'illuminance';
		labelKey: string;
		entity_id: string;
		unit: string;
		color: string;
		data: Array<{ x: Date; y: number }>;
		visible: boolean;
	};

	const SERIES_COLOR: Record<string, string> = {
		primary: '#ff8866', /* temperature-ish — clicked entity */
		humidity: '#6eb4ff',
		pressure: '#9ed47b',
		dewpoint: '#c6a9ff',
		illuminance: '#f7c948'
	};

	/* When user toggles, persist their choice for the modal lifetime */
	let userVisibility: Record<string, boolean> = {};

	$: graphCandidates = (() => {
		if (!isNumeric || !sel?.entity_id) return [];
		const list: Array<Pick<Series, 'key' | 'labelKey' | 'entity_id' | 'unit'>> = [
			{
				key: 'primary',
				labelKey: (deviceClass as string) || 'state',
				entity_id: sel.entity_id,
				unit: unit
			}
		];
		for (const sib of [humiSibling, ...relatedReadings]) {
			if (!sib) continue;
			const e = $states?.[sib.entity_id];
			if (!e || !Number.isFinite(Number(e?.state))) continue;
			if (sib.kind === 'humidity' || sib.kind === 'pressure' || sib.kind === 'dewpoint') {
				list.push({
					key: sib.kind,
					labelKey: sib.kind,
					entity_id: sib.entity_id,
					unit: e?.attributes?.unit_of_measurement || ''
				});
			}
		}
		return list;
	})();

	let series: Series[] = [];
	let chartLoaded = false;
	let chartWidth = 0;
	let chartHeight = 0;
	let hovering = false;
	let hoverX: Date | undefined;

	/* Refetch whenever the candidate set changes (i.e. modal opens or
	 * siblings appear). The fetcher is debounced via a token to ignore
	 * stale responses if the user closes & reopens quickly. */
	let fetchToken = 0;
	$: if (graphCandidates.length > 0) {
		fetchToken++;
		void loadAll(fetchToken, graphCandidates);
	}

	async function loadAll(
		token: number,
		candidates: Array<Pick<Series, 'key' | 'labelKey' | 'entity_id' | 'unit'>>
	) {
		chartLoaded = false;
		const conn = await new Promise<any>((resolve) => connection.subscribe(resolve));
		if (!conn || token !== fetchToken) return;

		const end = new Date();
		const start = new Date(end.getTime() - 24 * 3600 * 1000);

		const fetched: Series[] = await Promise.all(
			candidates.map(async (c) => {
				const data = await fetchSeries(conn, c.entity_id, start, end);
				const previousVisibility = userVisibility[c.key];
				return {
					key: c.key,
					labelKey: c.labelKey,
					entity_id: c.entity_id,
					unit: c.unit,
					color: SERIES_COLOR[c.key] || '#ffffff',
					data,
					visible: previousVisibility !== undefined ? previousVisibility : true
				};
			})
		);

		if (token !== fetchToken) return;
		series = fetched;
		chartLoaded = true;
	}

	async function fetchSeries(
		conn: any,
		eid: string,
		start: Date,
		end: Date
	): Promise<Array<{ x: Date; y: number }>> {
		const fetchAt = async (period: string) => {
			const res: any = await conn.sendMessagePromise({
				type: 'recorder/statistics_during_period',
				start_time: start.toISOString(),
				end_time: end.toISOString(),
				statistic_ids: [eid],
				period
			});
			const arr = res?.[eid];
			if (!Array.isArray(arr)) return [];
			return arr
				.map((s: any) => ({
					x: new Date(s.start),
					y: typeof s.mean === 'number' ? s.mean : Number(s.state)
				}))
				.filter((p) => Number.isFinite(p.y));
		};
		try {
			let pts = await fetchAt('5minute');
			if (pts.length === 0) pts = await fetchAt('hour');
			return pts;
		} catch (e) {
			console.error('history fetch failed for', eid, e);
			return [];
		}
	}

	function toggleSeries(key: string) {
		series = series.map((s) =>
			s.key === key ? { ...s, visible: !s.visible } : s
		);
		userVisibility[key] = series.find((s) => s.key === key)?.visible ?? true;
	}

	/* shared time domain across all visible series */
	$: visibleSeries = series.filter((s) => s.visible && s.data.length > 0);
	$: allPoints = visibleSeries.flatMap((s) => s.data);
	$: xScale = scaleTime()
		.domain(extent(allPoints, (d: any) => d.x) as any)
		.range([4, Math.max(4, chartWidth - 4)]);

	/* each series has its own y-scale to use the full chart height */
	function yScaleFor(s: Series) {
		return scaleLinear()
			.domain(extent(s.data, (d) => d.y) as any)
			.range([chartHeight - 4, 4])
			.nice();
	}

	function pathFor(s: Series, kind: 'line' | 'area'): string {
		const y = yScaleFor(s);
		if (kind === 'line') {
			const g = line<{ x: Date; y: number }>()
				.x((d) => xScale(d.x))
				.y((d) => y(d.y))
				.curve(curveMonotoneX);
			return g(s.data) || '';
		}
		const g = area<{ x: Date; y: number }>()
			.x((d) => xScale(d.x))
			.y0(chartHeight - 4)
			.y1((d) => y(d.y))
			.curve(curveMonotoneX);
		return g(s.data) || '';
	}

	/** For the hover tooltip — pick the nearest point per visible series. */
	function nearestAt(s: Series, x: Date): { x: Date; y: number } | undefined {
		if (!s.data.length || !x) return undefined;
		const bisect = bisector<{ x: Date; y: number }, Date>((d) => d.x).right;
		const i = bisect(s.data, x);
		const a = s.data[Math.max(0, i - 1)];
		const b = s.data[Math.min(s.data.length - 1, i)];
		if (!a) return b;
		if (!b) return a;
		return Math.abs(+a.x - +x) <= Math.abs(+b.x - +x) ? a : b;
	}

	function handleHover(event: PointerEvent) {
		if (!visibleSeries.length || chartWidth === 0) return;
		hovering = true;
		hoverX = xScale.invert(event.offsetX);
	}

	function handleLeave() {
		hovering = false;
		hoverX = undefined;
	}

	/* -----------------------------------------------------------------
	 * Binary sensor presentation
	 * ----------------------------------------------------------------- */

	function binaryStateLabel(): string {
		const on = state === 'on';
		switch (deviceClass) {
			case 'door':
			case 'window':
			case 'garage_door':
			case 'opening':
				return $lang(on ? 'open' : 'closed');
			case 'moisture':
				return $lang(on ? 'wet' : 'dry');
			case 'motion':
			case 'occupancy':
			case 'presence':
			case 'smoke':
			case 'gas':
			case 'co':
				return $lang(on ? 'detected' : 'clear');
			case 'lock':
				return $lang(on ? 'unlocked' : 'locked');
			case 'connectivity':
				return $lang(on ? 'connected' : 'disconnected');
			default:
				return state || '—';
		}
	}

	function deviceClassIcon(dc?: string, st?: string): string {
		const on = st === 'on';
		switch (dc) {
			case 'door':
				return on ? 'mdi:door-open' : 'mdi:door-closed';
			case 'window':
				return on ? 'mdi:window-open' : 'mdi:window-closed';
			case 'garage_door':
				return on ? 'mdi:garage-open' : 'mdi:garage';
			case 'moisture':
				return on ? 'mdi:water-alert' : 'mdi:water-off';
			case 'motion':
			case 'occupancy':
			case 'presence':
				return on ? 'mdi:motion-sensor' : 'mdi:motion-sensor-off';
			case 'smoke':
				return 'mdi:smoke-detector';
			case 'gas':
				return 'mdi:gas-cylinder';
			case 'connectivity':
				return on ? 'mdi:lan-connect' : 'mdi:lan-disconnect';
			case 'temperature':
				return 'mdi:thermometer';
			case 'humidity':
				return 'mdi:water-percent';
			case 'pressure':
				return 'mdi:gauge';
			case 'illuminance':
				return 'mdi:brightness-5';
			case 'battery':
				return 'mdi:battery';
			default:
				return attributes?.icon || 'mdi:information-outline';
		}
	}

	$: title = getName(sel, entity) || sel?.entity_id || '—';
</script>

{#if isOpen}
	<Modal>
		<h1 slot="title">{title}</h1>

		<!-- Hero row: primary + (optional) humidity -->
		<section class="hero-row" class:dual={!!humiEntity}>
			<div class="hero">
				<div class="hero-icon" style:color={SERIES_COLOR.primary}>
					<Icon icon={deviceClassIcon(deviceClass, state)} height="none" width="2.4rem" />
				</div>
				<div class="hero-text">
					<div class="hero-value">
						{#if domain === 'binary_sensor'}
							{binaryStateLabel()}
						{:else if isNumeric}
							{fmt(state, 1)}
							<span class="hero-unit">{unit}</span>
						{:else}
							{state ?? '—'}
							{#if unit}<span class="hero-unit">{unit}</span>{/if}
						{/if}
					</div>
					{#if entity?.last_changed}
						<div class="hero-sub">
							{$lang('last_changed') || 'Last changed'}:
							{relativeTime(entity.last_changed, $selectedLanguage)}
						</div>
					{/if}
				</div>
			</div>

			{#if humiEntity}
				<div class="hero">
					<div class="hero-icon" style:color={SERIES_COLOR.humidity}>
						<Icon icon="mdi:water-percent" height="none" width="2.4rem" />
					</div>
					<div class="hero-text">
						<div class="hero-value">
							{fmt(humiEntity?.state, 1)}
							<span class="hero-unit">{humiEntity?.attributes?.unit_of_measurement || '%'}</span>
						</div>
						{#if humiEntity?.last_changed}
							<div class="hero-sub">
								{$lang('last_changed') || 'Last changed'}:
								{relativeTime(humiEntity.last_changed, $selectedLanguage)}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</section>

		<!-- Related: pressure, dewpoint, illuminance, ... -->
		{#if relatedReadings.length > 0}
			<h2>{$lang('related') || 'Related'}</h2>
			<div class="grid">
				{#each relatedReadings as s}
					{@const e = $states?.[s.entity_id]}
					<div class="card">
						<div class="card-label">{$lang(s.kind) || s.kind}</div>
						<div class="card-value">
							{fmt(e?.state, 1)}
							<span class="card-unit">{e?.attributes?.unit_of_measurement || ''}</span>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Device info -->
		{#if deviceInfo.length > 0}
			<h2>{$lang('device_info') || 'Device'}</h2>
			<div class="grid">
				{#each deviceInfo as info}
					<div class="card">
						<div class="card-label">
							<Icon icon={info.icon} height="none" width="1rem" />
							{$lang(info.labelKey) || info.key}
						</div>
						<div class="card-value small">{info.value}</div>
					</div>
				{/each}
			</div>
		{/if}

		<!-- 24h graph -->
		{#if isNumeric}
			<h2>{$lang('history_24h') || 'Last 24 hours'}</h2>

			{#if series.length > 1}
				<div class="chips">
					{#each series as s}
						<button
							type="button"
							class="chip"
							class:active={s.visible}
							style:--chip-color={s.color}
							on:click={() => toggleSeries(s.key)}
						>
							<span class="chip-dot" style:background={s.color}></span>
							{$lang(s.labelKey) || s.labelKey}
						</button>
					{/each}
				</div>
			{/if}

			<div
				class="chart"
				bind:clientWidth={chartWidth}
				bind:clientHeight={chartHeight}
				on:pointermove={handleHover}
				on:pointerleave={handleLeave}
				role="img"
				aria-label="24h graph"
			>
				{#if chartLoaded && visibleSeries.length === 0}
					<div class="chart-empty">{$lang('no_data') || 'No data'}</div>
				{:else if visibleSeries.length > 0 && chartWidth > 0}
					<svg width="100%" height="100%">
						<defs>
							{#each visibleSeries as s}
								<linearGradient id={`sg-${s.key}`} gradientTransform="rotate(90)">
									<stop offset="0%" stop-color={s.color} stop-opacity="0.32" />
									<stop offset="100%" stop-color={s.color} stop-opacity="0" />
								</linearGradient>
							{/each}
						</defs>
						{#each visibleSeries as s}
							{@const ap = pathFor(s, 'area')}
							{@const lp = pathFor(s, 'line')}
							{#if ap && !ap.includes('NaN')}
								<path d={ap} fill={`url(#sg-${s.key})`} />
							{/if}
							{#if lp && !lp.includes('NaN')}
								<path d={lp} fill="none" stroke={s.color} stroke-width="1.75" />
							{/if}
						{/each}

						{#if hovering && hoverX}
							{@const cx = xScale(hoverX)}
							<line x1={cx} x2={cx} y1="0" y2={chartHeight} class="chart-cursor" />
							{#each visibleSeries as s}
								{@const p = nearestAt(s, hoverX)}
								{#if p}
									<circle cx={xScale(p.x)} cy={yScaleFor(s)(p.y)} r="3" fill={s.color} stroke="white" stroke-width="1" />
								{/if}
							{/each}
						{/if}
					</svg>

					{#if hovering && hoverX}
						<div class="chart-tip">
							<div class="chart-tip-time">
								{new Intl.DateTimeFormat($selectedLanguage, {
									weekday: 'short',
									hour: '2-digit',
									minute: '2-digit'
								}).format(hoverX)}
							</div>
							{#each visibleSeries as s}
								{@const p = nearestAt(s, hoverX)}
								{#if p}
									<div class="chart-tip-row">
										<span class="chart-tip-dot" style:background={s.color}></span>
										<span class="chart-tip-label">{$lang(s.labelKey) || s.labelKey}</span>
										<span class="chart-tip-val">
											{fmt(p.y, 1)}{s.unit ? ` ${s.unit}` : ''}
										</span>
									</div>
								{/if}
							{/each}
						</div>
					{/if}
				{:else}
					<div class="chart-empty">{$lang('loading') || 'Loading…'}</div>
				{/if}
			</div>
		{/if}

		{#if extraAttrs.length > 0}
			<details class="extras">
				<summary>
					{$lang('attributes') || 'Attributes'}
					<span class="muted">({extraAttrs.length})</span>
				</summary>
				<table>
					{#each extraAttrs as [k, v]}
						<tr>
							<th>{k}</th>
							<td>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</td>
						</tr>
					{/each}
				</table>
			</details>
		{/if}

		<ConfigButtons />
	</Modal>
{/if}

<style>
	.hero-row {
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.6rem;
		margin-bottom: 1rem;
	}
	.hero-row.dual {
		grid-template-columns: 1fr 1fr;
	}
	@media (max-width: 480px) {
		.hero-row.dual {
			grid-template-columns: 1fr;
		}
	}

	.hero {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.9rem 1rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 0.75rem;
	}
	.hero-icon {
		flex: 0 0 auto;
	}
	.hero-value {
		font-size: 2rem;
		font-weight: 500;
		line-height: 1.05;
	}
	.hero-unit {
		font-size: 1rem;
		opacity: 0.65;
		margin-left: 0.2rem;
	}
	.hero-sub {
		font-size: 0.78rem;
		opacity: 0.55;
		margin-top: 0.25rem;
	}

	h2 {
		margin: 1rem 0 0.5rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}
	.card {
		background: rgba(255, 255, 255, 0.04);
		border-radius: 0.6rem;
		padding: 0.6rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}
	.card-label {
		font-size: 0.75rem;
		opacity: 0.65;
		text-transform: uppercase;
		letter-spacing: 0.02em;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.card-value {
		font-size: 1.2rem;
		font-weight: 500;
	}
	.card-value.small {
		font-size: 1rem;
	}
	.card-unit {
		font-size: 0.85rem;
		opacity: 0.6;
		margin-left: 0.2rem;
	}

	.chips {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin-bottom: 0.5rem;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.3rem 0.7rem;
		font-size: 0.85rem;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		background: rgba(255, 255, 255, 0.03);
		color: inherit;
		font-family: inherit;
		cursor: pointer;
		opacity: 0.55;
		transition: opacity 0.12s, background 0.12s, border-color 0.12s;
	}
	.chip.active {
		opacity: 1;
		border-color: var(--chip-color);
		background: rgba(255, 255, 255, 0.06);
	}
	.chip-dot {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 50%;
		display: inline-block;
	}

	.chart {
		position: relative;
		width: 100%;
		height: 10rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 0.6rem;
		padding: 0.4rem;
		box-sizing: border-box;
	}
	.chart-empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		opacity: 0.5;
		font-size: 0.9rem;
	}
	.chart-cursor {
		stroke: rgba(255, 255, 255, 0.2);
		stroke-width: 1;
	}
	.chart-tip {
		position: absolute;
		top: 0.4rem;
		right: 0.6rem;
		background: rgba(0, 0, 0, 0.55);
		padding: 0.35rem 0.55rem;
		border-radius: 0.4rem;
		font-size: 0.8rem;
		pointer-events: none;
		min-width: 8rem;
	}
	.chart-tip-time {
		opacity: 0.75;
		font-size: 0.72rem;
		margin-bottom: 0.25rem;
	}
	.chart-tip-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.chart-tip-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		display: inline-block;
	}
	.chart-tip-label {
		opacity: 0.75;
		flex: 1;
		text-transform: capitalize;
	}
	.chart-tip-val {
		font-weight: 500;
	}

	.extras {
		margin-top: 1rem;
		background: rgba(255, 255, 255, 0.03);
		border-radius: 0.6rem;
		padding: 0.5rem 0.75rem;
	}
	.extras summary {
		cursor: pointer;
		font-weight: 500;
		opacity: 0.85;
	}
	.muted {
		opacity: 0.55;
		font-weight: 400;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		margin-top: 0.4rem;
	}
	th {
		text-align: left;
		font-weight: 400;
		font-size: 0.8rem;
		opacity: 0.65;
		padding: 0.2rem 0.5rem 0.2rem 0;
		vertical-align: top;
		white-space: nowrap;
	}
	td {
		font-size: 0.85rem;
		padding: 0.2rem 0;
		word-break: break-word;
		font-family: ui-monospace, SFMono-Regular, monospace;
	}
</style>
