<!--
  InfoGrid — read-only stat panel. Layout-wise the same footprint as a
  GridButton (1 col wide × 2 rows tall), but the inner layout is:

      ┌────────────────────────────────┐
      │ 🏠  Header (title + icon)     │
      ├────────────────────────────────┤
      │ label1: value1 │ label2: value2 │
      │ label3: value3 │ label4: value4 │
      │ label5: value5 │ label6: value6 │
      └────────────────────────────────┘

  Each pair on a row is rendered the same way Victron tile renders its
  secondary metrics — small label, then value with unit. NOT clickable
  (just data display). Use GridButton when you want toggleable cells.

  YAML:
    - id: 7777999911
      type: info_grid
      name: Solar
      icon: mdi:solar-power
      cells:
        - entity_id: sensor.foo
          label: Yield
        - entity_id: sensor.bar
          label: Today
        # … up to 6
-->
<script lang="ts">
	import { editMode, itemHeight, states, lang } from '$lib/Stores';
	import { getName } from '$lib/Utils';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { openModal } from 'svelte-modals';

	export const demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: cells = (sel?.cells || []) as Array<{ entity_id?: string; label?: string }>;
	$: title = sel?.name;
	$: icon = sel?.icon;

	function fmt(value: any, unit: string): string {
		if (value === undefined || value === null || value === '' || value === 'unavailable')
			return '—';
		const n = Number(value);
		if (!Number.isNaN(n) && Number.isFinite(n)) {
			const rounded = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
			return unit ? `${rounded} ${unit}` : String(rounded);
		}
		return unit ? `${value} ${unit}` : String(value);
	}

	function valueFor(eid: string | undefined): string {
		if (!eid) return '—';
		const st = $states?.[eid];
		const unit = st?.attributes?.unit_of_measurement || '';
		return fmt(st?.state, unit);
	}

	function labelFor(cell: { entity_id?: string; label?: string }): string {
		if (cell?.label) return cell.label;
		const st = cell?.entity_id ? $states?.[cell.entity_id] : undefined;
		return getName(undefined, st, sectionName) || cell?.entity_id || '';
	}

	async function handleContainerClick() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/InfoGridConfig.svelte'), { sel, sectionName });
		}
	}

	async function handlePointer() {
		if ($editMode) await import('$lib/Modal/InfoGridConfig.svelte');
	}
</script>

<div
	class="container"
	tabindex="-1"
	style={$editMode ? 'cursor: pointer;' : ''}
	style:min-height="{$itemHeight * 2 + 8}px"
	on:pointerenter={handlePointer}
	on:pointerdown={handlePointer}
	on:click|stopPropagation={handleContainerClick}
	on:keydown
	role={$editMode ? 'button' : undefined}
>
	<!-- Header (always shown; if no title/icon, still reserves the row) -->
	<div class="header">
		{#if icon}
			<span class="header-icon">
				{#await loadIcon(icon)}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{:then resolvedIcon}
					<Icon icon={resolvedIcon} height="none" width="100%" />
				{:catch}
					<Icon icon="ooui:help-ltr" height="none" width="100%" />
				{/await}
			</span>
		{/if}
		<span class="header-text">{title || ''}</span>
	</div>

	<!-- 3 rows × 2 columns of info pairs -->
	<div class="rows">
		{#each [0, 2, 4] as start}
			<div class="row">
				{#each [start, start + 1] as i}
					{#if cells[i]?.entity_id}
						<div class="pair">
							<span class="pair-label">{labelFor(cells[i])}:</span>
							<span class="pair-value">{valueFor(cells[i].entity_id)}</span>
						</div>
					{:else}
						<div class="pair empty">
							{#if $editMode}<span class="pair-placeholder">—</span>{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/each}
	</div>
</div>

<style>
	.container {
		background-color: var(--theme-button-background-color-off);
		font-family: inherit;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		border-radius: 0.65rem;
		padding: 0.55rem 0.6rem;
		gap: 0.5rem;
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--theme-button-name-color-off);
		min-height: 1.4rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0.1rem 0.1rem 0.05rem 0.1rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	.header-icon {
		display: inline-flex;
		width: 1.3rem;
		height: 1.3rem;
		flex-shrink: 0;
		color: rgb(180, 220, 255);
	}

	.header-text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.rows {
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-around;
		gap: 0.15rem;
	}

	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
		align-items: center;
	}

	.pair {
		display: flex;
		align-items: baseline;
		gap: 0.3rem;
		min-width: 0;
		font-size: 0.85rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.pair-label {
		color: var(--theme-button-state-color-off);
		opacity: 0.65;
		overflow: hidden;
		text-overflow: ellipsis;
		flex-shrink: 1;
		min-width: 0;
	}

	.pair-value {
		color: var(--theme-button-state-color-off);
		font-weight: 600;
		flex-shrink: 0;
	}

	.pair.empty {
		opacity: 0.3;
	}

	.pair-placeholder {
		opacity: 0.5;
	}
</style>
