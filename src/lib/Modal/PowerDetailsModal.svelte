<!--
  PowerDetailsModal — rich modal for `power_button` tiles.

  Same visual idiom as SensorDetailsModal but specialised for power
  monitoring:

    • Title respects user's `Name` from the dashboard config
    • Toggle button to flip the underlying switch on/off
    • Hero row:
        - clicked entity (switch / outlet) state + current power (W)
        - cumulative energy (kWh) — total or today's, whichever exists
    • 24h graph of power draw (W) — same multi-series infrastructure
      as SensorDetailsModal so we can also overlay the energy meter
      if the user wants to inspect kWh growth
    • Device info (battery / signal / last_seen / last_changed)
    • Collapsible raw attributes
-->
<script lang="ts">
	import { states, connection, lang, selectedLanguage } from '$lib/Stores';
	import { callService } from 'home-assistant-js-websocket';
	import Modal from '$lib/Modal/Index.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import Toggle from '$lib/Components/Toggle.svelte';
	import Icon from '@iconify/svelte';
	import { getName, getDomain, relativeTime } from '$lib/Utils';
	import { scaleTime, scaleLinear } from 'd3-scale';
	import { line, area, curveMonotoneX } from 'd3-shape';
	import { extent, bisector } from 'd3-array';

	export let isOpen: boolean;
	export let sel: any;

	/* The clicked entity = the controllable (switch.X / outlet). */
	$: entity = $states?.[sel?.entity_id];
	$: state = entity?.state;
	$: stateOn = state === 'on';
	$: attributes = entity?.attributes || {};
	$: deviceClass = attributes?.device_class;

	/**
	 * Derive companion sensors via the same `sensor.<base>_<suffix>` rule
	 * the power_button rendering uses. User overrides win when present
	 * on the sel object.
	 */
	$: base = sel?.entity_id?.includes('.') ? sel.entity_id.split('.')[1] : sel?.entity_id;
	$: powerSensorId = sel?.power_sensor || (base ? `sensor.${base}_power` : '');
	$: energySensorId = sel?.energy_sensor || (base ? findEnergySensor(base, $states) : '');

	$: powerEntity = powerSensorId ? $states?.[powerSensorId] : undefined;
	$: energyEntity = energySensorId ? $states?.[energySensorId] : undefined;

	/**
	 * Probe a few common naming conventions for the kWh sensor.
	 * Returns the first one that resolves in $states.
	 */
	function findEnergySensor(b: string, st: Record<string, any> | undefined): string {
		if (!st) return '';
		const candidates = [
			`sensor.${b}_energy`,
			`sensor.${b}_today_energy`,
			`sensor.${b}_energy_today`,
			`sensor.${b}_total_energy`,
			`sensor.${b}_consumption`,
			`sensor.${b}_kwh`
		];
		return candidates.find((c) => st[c]) || '';
	}

	$: currentWatts = (() => {
		const v = powerEntity?.state;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	})();
	$: powerUnit = powerEntity?.attributes?.unit_of_measurement || 'W';
	$: energyValue = (() => {
		const v = energyEntity?.state;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	})();
	$: energyUnit = energyEntity?.attributes?.unit_of_measurement || 'kWh';

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

	/* Toggle the underlying switch via HA service call. */
	async function toggle() {
		if (!sel?.entity_id) return;
		const domain = getDomain(sel.entity_id);
		const togglable = ['switch', 'input_boolean', 'light', 'fan', 'siren', 'remote'];
		if (!togglable.includes(domain)) return;
		await callService($connection, domain, 'toggle', { entity_id: sel.entity_id });
	}

	/* -----------------------------------------------------------------
	 * Device info — battery / signal / last_seen / last_changed
	 * Pulled from the underlying switch's attributes; if the user has a
	 * battery / signal sibling we surface that instead.
	 * ----------------------------------------------------------------- */

	const DEVICE_INFO_KEYS: Array<[string, string, string]> = [
		['battery_level', 'mdi:battery', 'battery'],
		['signal_strength', 'mdi:signal', 'signal'],
		['rssi', 'mdi:wifi-strength-2', 'rssi'],
		['linkquality', 'mdi:zigbee', 'linkquality'],
		['voltage', 'mdi:flash', 'voltage'],
		['last_seen', 'mdi:clock-outline', 'last_seen'],
		['last_changed', 'mdi:clock-outline', 'last_changed']
	];

	$: deviceInfo = (() => {
		const out: Array<{ key: string; icon: string; labelKey: string; value: string }> = [];
		for (const [key, icon, labelKey] of DEVICE_INFO_KEYS) {
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
		...DEVICE_INFO_KEYS.map(([k]) => k)
	]);
	$: extraAttrs = Object.entries(attributes).filter(([k]) => !HIDDEN_ATTRS.has(k));

	/* -----------------------------------------------------------------
	 * 24h graph — power (always if available) + energy (optional)
	 * ----------------------------------------------------------------- */

	type Series = {
		key: 'power' | 'energy';
		labelKey: string;
		entity_id: string;
		unit: string;
		color: string;
		data: Array<{ x: Date; y: number }>;
		visible: boolean;
	};

	const SERIES_COLOR = {
		power: '#ff8866',
		energy: '#f7c948'
	};

	let userVisibility: Record<string, boolean> = { power: true, energy: false };

	$: graphCandidates = (() => {
		const list: Array<Pick<Series, 'key' | 'labelKey' | 'entity_id' | 'unit'>> = [];
		if (powerEntity && Number.isFinite(Number(powerEntity.state))) {
			list.push({ key: 'power', labelKey: 'power', entity_id: powerSensorId, unit: powerUnit });
		}
		if (energyEntity && Number.isFinite(Number(energyEntity.state))) {
			list.push({
				key: 'energy',
				labelKey: 'energy',
				entity_id: energySensorId,
				unit: energyUnit
			});
		}
		return list;
	})();

	let series: Series[] = [];
	let chartLoaded = false;
	let chartWidth = 0;
	let chartHeight = 0;
	let hovering = false;
	let hoverX: Date | undefined;

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
				return {
					key: c.key,
					labelKey: c.labelKey,
					entity_id: c.entity_id,
					unit: c.unit,
					color: SERIES_COLOR[c.key],
					data,
					visible: userVisibility[c.key] ?? c.key === 'power'
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
		series = series.map((s) => (s.key === key ? { ...s, visible: !s.visible } : s));
		userVisibility[key] = series.find((s) => s.key === key)?.visible ?? false;
	}

	$: visibleSeries = series.filter((s) => s.visible && s.data.length > 0);
	$: allPoints = visibleSeries.flatMap((s) => s.data);
	$: xScale = scaleTime()
		.domain(extent(allPoints, (d: any) => d.x) as any)
		.range([4, Math.max(4, chartWidth - 4)]);

	function yScaleFor(s: Series) {
		return scaleLinear()
			.domain(extent(s.data, (d) => d.y) as any)
			.range([chartHeight - 4, 4])
			.nice();
	}
	function pathFor(s: Series, kind: 'line' | 'area'): string {
		const y = yScaleFor(s);
		if (kind === 'line') {
			return (
				line<{ x: Date; y: number }>()
					.x((d) => xScale(d.x))
					.y((d) => y(d.y))
					.curve(curveMonotoneX)(s.data) || ''
			);
		}
		return (
			area<{ x: Date; y: number }>()
				.x((d) => xScale(d.x))
				.y0(chartHeight - 4)
				.y1((d) => y(d.y))
				.curve(curveMonotoneX)(s.data) || ''
		);
	}
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

	$: title = getName(sel, entity) || sel?.entity_id || '—';

	$: heroIcon = (() => {
		if (deviceClass === 'outlet') return stateOn ? 'mdi:power-plug' : 'mdi:power-plug-off';
		if (sel?.icon) return sel.icon;
		return stateOn ? 'mdi:flash' : 'mdi:flash-outline';
	})();
</script>

{#if isOpen}
	<Modal>
		<h1 slot="title">{title}</h1>

		<!-- Hero row -->
		<section class="hero-row" class:dual={!!energyEntity}>
			<div class="hero">
				<div class="hero-icon" style:color={SERIES_COLOR.power}>
					<Icon icon={heroIcon} height="none" width="2.4rem" />
				</div>
				<div class="hero-text">
					<div class="hero-value">
						{#if currentWatts !== undefined}
							{fmt(currentWatts, currentWatts < 10 ? 2 : 1)}
							<span class="hero-unit">{powerUnit}</span>
						{:else}
							{stateOn ? $lang('on') : $lang('off')}
						{/if}
					</div>
					<div class="hero-sub">
						{stateOn ? $lang('on') : $lang('off')}
						{#if powerEntity?.last_changed}
							· {relativeTime(powerEntity.last_changed, $selectedLanguage)}
						{/if}
					</div>
				</div>
				<div class="hero-toggle">
					<Toggle checked={stateOn} on:change={toggle} />
				</div>
			</div>

			{#if energyEntity}
				<div class="hero">
					<div class="hero-icon" style:color={SERIES_COLOR.energy}>
						<Icon icon="mdi:lightning-bolt" height="none" width="2.4rem" />
					</div>
					<div class="hero-text">
						<div class="hero-value">
							{fmt(energyValue, 2)}
							<span class="hero-unit">{energyUnit}</span>
						</div>
						<div class="hero-sub">
							{$lang('energy_total') || 'Total energy'}
							{#if energyEntity?.last_changed}
								· {relativeTime(energyEntity.last_changed, $selectedLanguage)}
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</section>

		<!-- 24h graph -->
		{#if graphCandidates.length > 0}
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
				aria-label="24h power graph"
			>
				{#if chartLoaded && visibleSeries.length === 0}
					<div class="chart-empty">{$lang('no_data') || 'No data'}</div>
				{:else if visibleSeries.length > 0 && chartWidth > 0}
					<svg width="100%" height="100%">
						<defs>
							{#each visibleSeries as s}
								<linearGradient id={`pg-${s.key}`} gradientTransform="rotate(90)">
									<stop offset="0%" stop-color={s.color} stop-opacity="0.32" />
									<stop offset="100%" stop-color={s.color} stop-opacity="0" />
								</linearGradient>
							{/each}
						</defs>
						{#each visibleSeries as s}
							{@const ap = pathFor(s, 'area')}
							{@const lp = pathFor(s, 'line')}
							{#if ap && !ap.includes('NaN')}
								<path d={ap} fill={`url(#pg-${s.key})`} />
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
											{fmt(p.y, s.key === 'energy' ? 2 : 1)}{s.unit ? ` ${s.unit}` : ''}
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
	.hero-text {
		flex: 1 1 auto;
		min-width: 0;
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
	.hero-toggle {
		flex: 0 0 auto;
	}

	h2 {
		margin: 1rem 0 0.5rem;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
		gap: 0.5rem;
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
	.card-value.small {
		font-size: 1rem;
		font-weight: 500;
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
