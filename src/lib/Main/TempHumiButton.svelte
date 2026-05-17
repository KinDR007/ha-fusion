<!--
  TempHumiButton — Button-style tile for combined temperature + humidity
  readings.

  YAML:
    - id: 9988887777
      type: temp_humi_button
      entity_id: sensor.kuchyn_temperature  # the temperature sensor
      humidity_entity: sensor.kuchyn_humidity  # optional override; defaults
                                               # to <base>_humidity sibling
      name: Kuchyň     # optional
      icon: mdi:thermometer-water  # optional

  Display: same layout as a normal button, but the state line reads
    "21.5 °C / 55 % RH" — values are pulled live from the two entities.
-->
<script lang="ts">
	import ComputeIcon from '$lib/Components/ComputeIcon.svelte';
	import { editMode, itemHeight, ripple, states, lang } from '$lib/Stores';
	import { getName } from '$lib/Utils';
	import { deriveHumiditySibling } from '$lib/Constants/TempHumi';
	import { openEntityModal } from '$lib/Main/openEntityModal';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { openModal } from 'svelte-modals';
	import Ripple from 'svelte-ripple';

	export const demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: entity_id = sel?.entity_id;
	$: humidity_entity = sel?.humidity_entity || deriveHumiditySibling(entity_id, $states);

	$: tempEntity = entity_id ? $states?.[entity_id] : undefined;
	$: humiEntity = humidity_entity ? $states?.[humidity_entity] : undefined;

	$: icon = sel?.icon;

	function fmt(value: any): string {
		if (value === undefined || value === null || value === '' || value === 'unavailable')
			return '—';
		const n = Number(value);
		if (Number.isFinite(n)) {
			return Math.abs(n) >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
		}
		return String(value);
	}

	$: tempUnit = tempEntity?.attributes?.unit_of_measurement || '°C';
	$: stateLine = (() => {
		const t = fmt(tempEntity?.state);
		const h = fmt(humiEntity?.state);
		if (!humiEntity) return `${t} ${tempUnit}`;
		return `${t} ${tempUnit} / ${h} % RH`;
	})();

	async function handleClickEvent() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/TempHumiButtonConfig.svelte'), { sel, sectionName });
		} else if (entity_id) {
			await openEntityModal({ id: sel?.id, entity_id });
		}
	}

	async function handlePointer() {
		if ($editMode) await import('$lib/Modal/TempHumiButtonConfig.svelte');
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
		color: !$editMode ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0)'
	}}
>
	<div class="left">
		<div class="icon">
			{#if icon}
				{#await loadIcon(icon)}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{:then resolvedIcon}
					<Icon icon={resolvedIcon} height="none" width="100%" />
				{:catch}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{/await}
			{:else}
				<Icon icon="mdi:thermometer-water" height="none" width="100%" />
			{/if}
		</div>
	</div>

	<div class="right">
		<div class="name">
			{sel?.name || getName(sel, tempEntity, sectionName) || $lang('unknown')}
		</div>
		<div class="state">{stateLine}</div>
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
	}

	.icon {
		--icon-size: 2.4rem;
		width: var(--icon-size);
		height: var(--icon-size);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.25);
		color: rgb(180, 220, 255);
	}

	.name {
		font-weight: 500;
		color: var(--theme-button-name-color-off);
		font-size: 0.95rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: -1px;
	}

	.state {
		font-weight: 400;
		color: var(--theme-button-state-color-off);
		font-size: 0.92rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 1px;
	}
</style>
