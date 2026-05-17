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
	import {
		config,
		connection,
		editMode,
		itemHeight,
		ripple,
		states,
		templates,
		lang
	} from '$lib/Stores';
	import { getName } from '$lib/Utils';
	import { deriveHumiditySibling } from '$lib/Constants/TempHumi';
	import { openEntityModal } from '$lib/Main/openEntityModal';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { openModal } from 'svelte-modals';
	import { onDestroy } from 'svelte';
	import Ripple from 'svelte-ripple';

	export const demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: entity_id = sel?.entity_id;
	$: humidity_entity = sel?.humidity_entity || deriveHumiditySibling(entity_id, $states);

	$: tempEntity = entity_id ? $states?.[entity_id] : undefined;
	$: humiEntity = humidity_entity ? $states?.[humidity_entity] : undefined;

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

	/** Default state line — used when sel.state and template.state are not set. */
	$: autoStateLine = (() => {
		const t = fmt(tempEntity?.state);
		const h = fmt(humiEntity?.state);
		if (!humiEntity) return `${t} ${tempUnit}`;
		return `${t} ${tempUnit} / ${h} %`;
	})();

	/**
	 * Same Jinja-template plumbing Button.svelte uses: each entry in
	 * `sel.template` (state/color/name/icon) is sent to HA via
	 * render_template and the output is cached in `$templates[sel.id]`.
	 * Per-key unsubscribe Map avoids stale callbacks from clobbering newer
	 * results.
	 */
	let unsubscribers: Map<string, () => void> = new Map();

	async function renderTemplate(key: string, value: string) {
		if (!$connection || !sel?.id) return;
		unsubscribers.get(key)?.();
		unsubscribers.delete(key);
		try {
			const unsub = await $connection.subscribeMessage(
				(response: { result: string } | { error: string; level: 'ERROR' | 'WARNING' }) => {
					let data: any = { input: value, entity_id: sel?.entity_id };
					if ('result' in response) {
						data.output = String(response.result);
					} else if (response?.level === 'ERROR') {
						console.error(response.error);
						data.error = response.error;
					}
					$templates[sel?.id] = { ...$templates[sel?.id], [key]: data };
				},
				{
					type: 'render_template',
					template: value,
					report_errors: true,
					variables: { entity_id: sel?.entity_id }
				}
			);
			unsubscribers.set(key, unsub);
		} catch (e) {
			console.error('temp_humi_button template error:', e);
		}
	}

	$: if ($config?.state === 'RUNNING' && sel?.template) {
		Object.entries(sel.template as Record<string, string>).forEach(([key, value]) => {
			if (typeof value !== 'string' || !value) return;
			const stored = $templates?.[sel?.id]?.[key];
			if (value === stored?.input && sel?.entity_id === stored?.entity_id) return;
			renderTemplate(key, value);
		});
	}

	onDestroy(() => {
		unsubscribers.forEach((u) => u?.());
		unsubscribers.clear();
	});

	/** Rendered template outputs (or undefined if no template defined for the key). */
	$: tmpl = $templates?.[sel?.id];
	$: renderedState = sel?.template?.state ? tmpl?.state?.output : '';
	$: renderedColor = sel?.template?.color ? tmpl?.color?.output : '';
	$: renderedName = sel?.template?.name ? tmpl?.name?.output : '';
	$: renderedIcon = sel?.template?.icon ? tmpl?.icon?.output : '';

	/** Final display values with proper fallback chain. */
	$: icon = renderedIcon || sel?.icon;
	$: stateLine = renderedState || sel?.state || autoStateLine;
	$: displayName =
		renderedName || sel?.name || getName(sel, tempEntity, sectionName) || $lang('unknown');
	$: iconBg = renderedColor || sel?.color;

	async function handleClickEvent() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/TempHumiButtonConfig.svelte'), { sel, sectionName });
		} else if (entity_id) {
			await openEntityModal({ id: sel?.id, entity_id, name: sel?.name });
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
		<div class="icon" style:background-color={iconBg || undefined}>
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
		<div class="name">{@html displayName}</div>
		<div class="state">{@html stateLine}</div>
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
