<!--
  SensorDetailsModal — read-only details for sensor / binary_sensor /
  device_tracker / similar passive entities.

  Replaces the trivial SensorModal for these domains. The goal is one
  modal where the user can see at a glance:

    • the main reading (temperature, humidity, …) with its unit
    • siblings on the same physical device (e.g. the humidity sensor
      that belongs to the same Zigbee module as the clicked temp sensor)
    • device-info: battery level, signal/linkquality, last seen
    • a 24h history graph for numeric sensors (recorder/statistics
      pattern; the same one Sidebar/Graph.svelte uses)
    • a collapsible dump of remaining attributes for power users

  This component does NOT call services — it's strictly informational.
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
	import { onDestroy } from 'svelte';

	export let isOpen: boolean;
	export let sel: any;

	$: entity = $states?.[sel?.entity_id];
	$: domain = getDomain(sel?.entity_id);
	$: attributes = entity?.attributes || {};
	$: deviceClass = attributes?.device_class;
	$: unit = attributes?.unit_of_measurement || '';
	$: state = entity?.state;

	$: siblings = findRelatedSiblings(sel?.entity_id, $states).filter(
		(s) => s.entity_id !== sel?.entity_id
	);

	/**
	 * Numeric domain detection — used to decide whether to fetch a 24h
	 * history graph. binary_sensor never has a useful line graph, neither
	 * does device_tracker etc.
	 */
	$: isNumeric = (() => {
		if (domain === 'binary_sensor') return false;
		if (domain === 'sensor') {
			const n = Number(state);
			return Number.isFinite(n);
		}
		return false;
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
	 * Friendly labels + icons for "device info" attributes. Order in the
	 * map controls the display order in the modal.
	 */
	const DEVICE_INFO_KEYS: Array<[string, string, string]> = [
		['battery_level', 'mdi:battery', 'battery'],
		['battery_state', 'mdi:battery-charging', 'battery_state'],
		['battery', 'mdi:battery', 'battery'],
		['signal_strength', 'mdi:signal', 'signal'],
		['rssi', 'mdi:wifi-strength-2', 'rssi'],
		['linkquality', 'mdi:zigbee', 'linkquality'],
		['voltage', 'mdi:flash', 'voltage'],
		['power', 'mdi:flash', 'power'],
		['last_seen', 'mdi:clock-outline', 'last_seen'],
		['last_changed', 'mdi:clock-outline', 'last_changed']
	];

	$: deviceInfo = (() => {
		const out: Array<{ key: string; icon: string; labelKey: string; value: string }> = [];
		const seen = new Set<string>();
		for (const [key, icon, labelKey] of DEVICE_INFO_KEYS) {
			if (seen.has(key)) continue;
			seen.add(key);

			let raw: any;
			if (key === 'last_changed') raw = entity?.last_changed;
			else raw = attributes?.[key];
			if (raw === undefined || raw === null || raw === '') continue;

			let display: string;
			if (key === 'battery_level' || key === 'battery') {
				display = `${fmt(raw, 0)} %`;
			} else if (key === 'signal_strength' || key === 'rssi') {
				display = `${fmt(raw, 0)} dBm`;
			} else if (key === 'voltage') {
				display = `${fmt(raw, 2)} V`;
			} else if (key === 'power') {
				display = `${fmt(raw, 1)} W`;
			} else if (key === 'last_seen' || key === 'last_changed') {
				const d = asDate(raw);
				display = d ? relativeTime(d.toISOString(), $selectedLanguage) : String(raw);
			} else {
				display = String(raw);
			}
			out.push({ key, icon, labelKey, value: display });
		}
		return out;
	})();

	/**
	 * Everything left over after we pulled out the displayed-elsewhere
	 * attributes — power users get the raw dump in a collapsed details.
	 */
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

	/**
	 * 24h history graph — reuses the recorder/statistics_during_period
	 * RPC that Sidebar/Graph.svelte uses, so we know it's available on
	 * the HA side and doesn't need separate recorder config.
	 */
	let chartData: Array<{ x: Date; y: number }> = [];
	let chartLoaded = false;
	let chartWidth = 0;
	let chartHeight = 0;
	let hovering = false;
	let hover: { x: Date; y: number } | undefined;

	$: if (isNumeric && sel?.entity_id) {
		void fetchHistory(sel.entity_id);
	}

	async function fetchHistory(eid: string) {
		chartLoaded = false;
		chartData = [];
		const conn = await new Promise<any>((resolve) => connection.subscribe(resolve));
		if (!conn) return;
		const end = new Date();
		const start = new Date(end.getTime() - 24 * 3600 * 1000);
		try {
			const res: any = await conn.sendMessagePromise({
				type: 'recorder/statistics_during_period',
				start_time: start.toISOString(),
				end_time: end.toISOString(),
				statistic_ids: [eid],
				period: '5minute'
			});
			const series = res?.[eid];
			if (Array.isArray(series) && series.length > 0) {
				chartData = series
					.map((s: any) => ({
						x: new Date(s.start),
						y: typeof s.mean === 'number' ? s.mean : Number(s.state)
					}))
					.filter((p) => Number.isFinite(p.y));
			} else {
				/* fallback to hourly when no 5-minute aggregate exists */
				const res2: any = await conn.sendMessagePromise({
					type: 'recorder/statistics_during_period',
					start_time: start.toISOString(),
					end_time: end.toISOString(),
					statistic_ids: [eid],
					period: 'hour'
				});
				const s2 = res2?.[eid];
				if (Array.isArray(s2)) {
					chartData = s2
						.map((s: any) => ({
							x: new Date(s.start),
							y: typeof s.mean === 'number' ? s.mean : Number(s.state)
						}))
						.filter((p) => Number.isFinite(p.y));
				}
			}
		} catch (e) {
			console.error('history fetch failed', e);
		} finally {
			chartLoaded = true;
		}
	}

	$: xScale = scaleTime()
		.domain(extent(chartData, (d) => d.x) as any)
		.range([2, Math.max(2, chartWidth - 2)]);
	$: yScale = scaleLinear()
		.domain(extent(chartData, (d) => d.y) as any)
		.range([chartHeight - 2, 2])
		.nice();
	$: lineGen = line<{ x: Date; y: number }>()
		.x((d) => xScale(d.x))
		.y((d) => yScale(d.y))
		.curve(curveMonotoneX);
	$: areaGen = area<{ x: Date; y: number }>()
		.x((d) => xScale(d.x))
		.y0(yScale(yScale.domain()[0]))
		.y1((d) => yScale(d.y))
		.curve(curveMonotoneX);
	$: linePath = chartData.length ? lineGen(chartData) : '';
	$: areaPath = chartData.length ? areaGen(chartData) : '';

	function handleHover(event: PointerEvent) {
		if (!chartData.length || !xScale) return;
		const xVal = xScale.invert(event.offsetX);
		const bisect = bisector<{ x: Date; y: number }, Date>((d) => d.x).right;
		const idx = bisect(chartData, xVal);
		const point = chartData[Math.min(idx, chartData.length - 1)];
		if (point) {
			hovering = true;
			hover = point;
		}
	}

	function handleLeave() {
		hovering = false;
		hover = undefined;
	}

	/** Map common binary_sensor device classes to human-friendly states. */
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
				return $lang(on ? 'detected' : 'clear');
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

	function deviceClassIcon(): string {
		const on = state === 'on';
		switch (deviceClass) {
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
			default:
				if (deviceClass === 'temperature') return 'mdi:thermometer';
				if (deviceClass === 'humidity') return 'mdi:water-percent';
				if (deviceClass === 'pressure') return 'mdi:gauge';
				if (deviceClass === 'illuminance') return 'mdi:brightness-5';
				if (deviceClass === 'battery') return 'mdi:battery';
				return attributes?.icon || 'mdi:information-outline';
		}
	}

	$: title = getName(sel, entity);

	onDestroy(() => {
		hovering = false;
	});
</script>

{#if isOpen}
	<Modal>
		<h1 slot="title">{title}</h1>

		<!-- Main state -->
		<section class="hero">
			<div class="hero-icon">
				<Icon icon={deviceClassIcon()} height="none" width="2.4rem" />
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
						{$lang('last_changed') || 'changed'}:
						{relativeTime(entity.last_changed, $selectedLanguage)}
					</div>
				{/if}
			</div>
		</section>

		<!-- Related siblings -->
		{#if siblings.length > 0}
			<h2>{$lang('related') || 'Related'}</h2>
			<div class="grid">
				{#each siblings as s}
					{@const e = $states?.[s.entity_id]}
					<div class="card">
						<div class="card-label">{$lang(s.kind) || s.kind}</div>
						<div class="card-value">
							{fmt(e?.state, 1)}
							<span class="card-unit">{e?.attributes?.unit_of_measurement || ''}</span>
						</div>
						<div class="card-eid">{s.entity_id}</div>
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
			<div
				class="chart"
				bind:clientWidth={chartWidth}
				bind:clientHeight={chartHeight}
				on:pointermove={handleHover}
				on:pointerleave={handleLeave}
				role="img"
				aria-label="24h graph"
			>
				{#if chartLoaded && chartData.length === 0}
					<div class="chart-empty">{$lang('no_data') || 'No data'}</div>
				{:else if chartData.length > 0}
					<svg width="100%" height="100%">
						<defs>
							<linearGradient id="sensor-area-grad" gradientTransform="rotate(90)">
								<stop offset="0%" stop-color="rgba(110, 180, 255, 0.55)" />
								<stop offset="100%" stop-color="rgba(110, 180, 255, 0)" />
							</linearGradient>
						</defs>
						{#if areaPath && !areaPath.includes('NaN')}
							<path d={areaPath} fill="url(#sensor-area-grad)" />
						{/if}
						{#if linePath && !linePath.includes('NaN')}
							<path d={linePath} class="chart-line" />
						{/if}
						{#if hovering && hover}
							<line
								x1={xScale(hover.x)}
								x2={xScale(hover.x)}
								y1="0"
								y2={chartHeight}
								class="chart-cursor"
							/>
							<circle cx={xScale(hover.x)} cy={yScale(hover.y)} r="3.5" class="chart-dot" />
						{/if}
					</svg>
					{#if hovering && hover}
						<div class="chart-tip">
							{fmt(hover.y, 2)}
							{unit}
							<span class="chart-tip-time">
								{new Intl.DateTimeFormat($selectedLanguage, { timeStyle: 'short' }).format(hover.x)}
							</span>
						</div>
					{/if}
				{:else}
					<div class="chart-empty">{$lang('loading') || 'Loading…'}</div>
				{/if}
			</div>
		{/if}

		<!-- Extra attributes (collapsed) -->
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
	.hero {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		background: rgba(255, 255, 255, 0.04);
		border-radius: 0.75rem;
		margin-bottom: 1rem;
	}
	.hero-icon {
		flex: 0 0 auto;
		color: rgb(140, 200, 255);
	}
	.hero-value {
		font-size: 2.2rem;
		font-weight: 500;
		line-height: 1.05;
	}
	.hero-unit {
		font-size: 1.1rem;
		opacity: 0.65;
		margin-left: 0.25rem;
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
	.card-eid {
		font-size: 0.7rem;
		opacity: 0.4;
		font-family: ui-monospace, SFMono-Regular, monospace;
		text-overflow: ellipsis;
		overflow: hidden;
	}

	.chart {
		position: relative;
		width: 100%;
		height: 9rem;
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
	.chart-line {
		fill: none;
		stroke: rgb(140, 200, 255);
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.chart-cursor {
		stroke: rgba(255, 255, 255, 0.2);
		stroke-width: 1;
	}
	.chart-dot {
		fill: rgb(140, 200, 255);
		stroke: white;
		stroke-width: 1;
	}
	.chart-tip {
		position: absolute;
		top: 0.4rem;
		right: 0.6rem;
		background: rgba(0, 0, 0, 0.45);
		padding: 0.25rem 0.5rem;
		border-radius: 0.35rem;
		font-size: 0.85rem;
		pointer-events: none;
	}
	.chart-tip-time {
		opacity: 0.7;
		margin-left: 0.4rem;
		font-size: 0.78rem;
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
