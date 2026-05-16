<!--
  VictronButton — tile dedicated to victron_mqtt entities.

  Hybrid layout: one big primary value + up to 2 secondary values.

  Usage in dashboard.yaml:
    - id: 1234
      type: victron_button
      entity_id: sensor.victron_mqtt_<hwid>_solarcharger_274_solarcharger_yield_power
      name: MPPT 150/35
      icon: mdi:solar-power
      secondary_1: sensor.victron_mqtt_<hwid>_solarcharger_274_solarcharger_yield_today
      secondary_1_label: Today
      secondary_2: sensor.victron_mqtt_<hwid>_solarcharger_274_solarcharger_yield_total
      secondary_2_label: Total
      more_info: false
-->
<script lang="ts">
	import ComputeIcon from '$lib/Components/ComputeIcon.svelte';
	import { editMode, itemHeight, motion, ripple, states, lang } from '$lib/Stores';
	import { getName } from '$lib/Utils';
	import { getVictronDefaultIconForEntity } from '$lib/Constants/VictronMetrics';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { openModal } from 'svelte-modals';
	import Ripple from 'svelte-ripple';

	export let demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: entity_id = demo || sel?.entity_id;
	$: entity = entity_id ? $states?.[entity_id] : undefined;
	$: attributes = entity?.attributes;

	/** Fallback icon derived from the device group. User's `sel.icon` wins. */
	$: defaultIcon = entity_id ? getVictronDefaultIconForEntity(entity_id) : undefined;

	// primary value (the main entity)
	$: primaryValue = entity?.state;
	$: primaryUnit = attributes?.unit_of_measurement || '';

	// secondaries
	$: secondary1 = sel?.secondary_1 ? $states?.[sel.secondary_1] : undefined;
	$: secondary1Value = secondary1?.state;
	$: secondary1Unit = secondary1?.attributes?.unit_of_measurement || '';
	$: secondary1Label = sel?.secondary_1_label || secondary1?.attributes?.friendly_name || '';

	$: secondary2 = sel?.secondary_2 ? $states?.[sel.secondary_2] : undefined;
	$: secondary2Value = secondary2?.state;
	$: secondary2Unit = secondary2?.attributes?.unit_of_measurement || '';
	$: secondary2Label = sel?.secondary_2_label || secondary2?.attributes?.friendly_name || '';

	$: icon = sel?.icon || defaultIcon;
	$: iconColor = sel?.icon_color || 'rgb(75, 166, 237)';

	function fmt(value: any, unit: string): string {
		if (value === undefined || value === null || value === '' || value === 'unavailable')
			return '—';
		// numeric → 2 decimal places, integer if whole
		const n = Number(value);
		if (!Number.isNaN(n) && Number.isFinite(n)) {
			const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
			return unit ? `${rounded} ${unit}` : String(rounded);
		}
		return unit ? `${value} ${unit}` : String(value);
	}

	async function handleClickEvent() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/VictronButtonConfig.svelte'), {
				demo: entity_id,
				sel,
				sectionName
			});
		} else {
			openModal(() => import('$lib/Modal/SensorModal.svelte'), { sel });
		}
	}

	async function handlePointer() {
		if ($editMode) {
			await import('$lib/Modal/VictronButtonConfig.svelte');
		} else {
			await import('$lib/Modal/SensorModal.svelte');
		}
	}
</script>

<div
	class="container"
	tabindex="-1"
	style={!$editMode ? 'cursor: pointer;' : ''}
	style:min-height="{$itemHeight}px"
	on:pointerenter={handlePointer}
	on:pointerdown={handlePointer}
	on:click|stopPropagation={handleClickEvent}
	on:keydown
	role="button"
	use:Ripple={{
		...$ripple,
		color: 'rgba(255, 255, 255, 0.15)'
	}}
>
	<!-- ICON -->
	<div class="left">
		<div class="icon" style:--icon-color={iconColor}>
			{#if icon}
				{#await loadIcon(icon)}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{:then resolvedIcon}
					<Icon icon={resolvedIcon} height="none" width="100%" />
				{:catch}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{/await}
			{:else if entity_id}
				<ComputeIcon {entity_id} />
			{:else}
				<Icon icon="ooui:help-ltr" height="none" width="100%" />
			{/if}
		</div>
	</div>

	<div class="right">
		<!-- NAME -->
		<div class="name">
			{getName(sel, entity, sectionName) || $lang('unknown')}
		</div>

		<!-- PRIMARY VALUE -->
		<div class="state primary">{fmt(primaryValue, primaryUnit)}</div>

		<!-- SECONDARY VALUES -->
		{#if sel?.secondary_1 || sel?.secondary_2}
			<div class="secondary">
				{#if sel?.secondary_1}
					<span class="sec-item">
						{#if secondary1Label}<span class="sec-label">{secondary1Label}:</span>{/if}
						<span class="sec-value">{fmt(secondary1Value, secondary1Unit)}</span>
					</span>
				{/if}
				{#if sel?.secondary_2}
					<span class="sec-item">
						{#if secondary2Label}<span class="sec-label">{secondary2Label}:</span>{/if}
						<span class="sec-value">{fmt(secondary2Value, secondary2Unit)}</span>
					</span>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.container {
		background-color: var(--theme-button-background-color-off);
		font-family: inherit;
		width: 100%;
		height: 100%;
		display: grid;
		border-radius: 0.65rem;
		grid-template-columns: min-content auto;
		grid-template-areas: 'left right';
		--container-padding: 0.72rem;
		transform: translateZ(0);
		overflow: hidden;
	}

	.left {
		padding: var(--container-padding);
	}

	.right {
		display: flex;
		flex-direction: column;
		justify-content: center;
		overflow: hidden;
		padding-right: var(--container-padding);
		gap: 0.05rem;
	}

	.icon {
		--icon-size: 2.4rem;
		height: var(--icon-size);
		width: var(--icon-size);
		color: white;
		background-color: var(--icon-color);
		border-radius: 50%;
		display: flex;
		align-items: center;
		padding: 0.5rem;
	}

	.name {
		font-weight: 500;
		color: var(--theme-button-name-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		font-size: 0.95rem;
		margin-top: -1px;
	}

	.state.primary {
		font-weight: 600;
		font-size: 1rem;
		color: var(--theme-button-state-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.secondary {
		font-size: 0.78rem;
		color: var(--theme-button-state-color-off);
		opacity: 0.7;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: flex;
		gap: 0.6rem;
	}

	.sec-label {
		opacity: 0.7;
	}

	.sec-value {
		font-weight: 500;
	}
</style>
