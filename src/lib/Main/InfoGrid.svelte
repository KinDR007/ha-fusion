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
	import {
		config,
		connection,
		editMode,
		itemHeight,
		states,
		templates,
		lang
	} from '$lib/Stores';
	import { getName } from '$lib/Utils';
	import { onDestroy } from 'svelte';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { openModal } from 'svelte-modals';

	export const demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: cells = (sel?.cells || []) as Array<{
		id?: string;
		entity_id?: string;
		label?: string;
		state?: string;
		color?: string;
		template?: Record<string, string>;
	}>;
	$: title = sel?.name;
	$: icon = sel?.icon;

	/** Per-cell stable id for $templates store keying (mirrors FlexGrid). */
	function cellTemplateId(index: number): string {
		const cell = cells[index];
		return cell?.id || `${sel?.id ?? 'infogrid'}_cell_${index}`;
	}

	/**
	 * Per-cell per-template-field HA render_template subscriptions.
	 * Same per-key Map cleanup as Button/FlexGrid to avoid stale-output races.
	 */
	let unsubscribers: Map<string, () => void> = new Map();

	async function renderCellTemplate(
		cellId: string,
		key: string,
		value: string,
		entity_id: string
	) {
		if (!$connection) return;
		const mapKey = `${cellId}__${key}`;
		unsubscribers.get(mapKey)?.();
		unsubscribers.delete(mapKey);
		try {
			const unsub = await $connection.subscribeMessage(
				(response: { result: string } | { error: string; level: 'ERROR' | 'WARNING' }) => {
					let data: any = { input: value, entity_id };
					if ('result' in response) {
						data.output = String(response.result);
					} else if (response?.level === 'ERROR') {
						console.error(response.error);
						data.error = response.error;
					}
					$templates[cellId] = { ...$templates[cellId], [key]: data };
				},
				{
					type: 'render_template',
					template: value,
					report_errors: true,
					variables: { entity_id }
				}
			);
			unsubscribers.set(mapKey, unsub);
		} catch (e) {
			console.error('info_grid cell template error:', e);
		}
	}

	$: if ($config?.state === 'RUNNING' && Array.isArray(cells)) {
		cells.forEach((cell, i) => {
			if (!cell?.entity_id || !cell?.template) return;
			const cellId = cellTemplateId(i);
			Object.entries(cell.template).forEach(([key, value]) => {
				if (typeof value !== 'string' || !value) return;
				const stored = $templates?.[cellId]?.[key];
				if (value === stored?.input && cell.entity_id === stored?.entity_id) return;
				renderCellTemplate(cellId, key, value, cell.entity_id);
			});
		});
	}

	onDestroy(() => {
		unsubscribers.forEach((u) => u?.());
		unsubscribers.clear();
	});

	/**
	 * Dynamic dimensions — mirror flex_grid's API.
	 *   span_cols × span_rows  → footprint on the parent dashboard grid
	 *   inner_cols × inner_rows → internal layout of value pairs
	 *
	 * Defaults preserve the previous fixed 1×2 footprint with 2×3 pairs so
	 * existing dashboards don't change.
	 */
	$: spanRows = Math.max(1, Math.min(Number(sel?.span_rows) || 2, 6));
	$: innerCols = Math.max(1, Math.min(Number(sel?.inner_cols) || 2, 6));
	$: innerRows = Math.max(1, Math.min(Number(sel?.inner_rows) || 3, 8));
	$: totalSlots = innerCols * innerRows;

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
	style:min-height="{$itemHeight * spanRows}px"
	style:--inner-cols={innerCols}
	style:--inner-rows={innerRows}
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

	<!-- innerCols × innerRows grid of info pairs -->
	<div class="rows">
		{#each Array(totalSlots) as _, i}
			{@const cell = cells[i]}
			{#if cell?.entity_id}
				{@const tmpl = $templates?.[cellTemplateId(i)]}
				{@const renderedState = cell.template?.state ? tmpl?.state?.output : ''}
				{@const renderedLabel = cell.template?.label ? tmpl?.label?.output : ''}
				{@const renderedColor = cell.template?.color ? tmpl?.color?.output : ''}
				{@const cellColor = renderedColor || cell.color || ''}
				<div class="pair">
					{#if $editMode}<span class="pair-index">{i + 1}</span>{/if}
					<span class="pair-label">{renderedLabel || labelFor(cell)}:</span>
					<span class="pair-value" style:color={cellColor || undefined}>
						{renderedState || cell.state || valueFor(cell.entity_id)}
					</span>
				</div>
			{:else}
				<div class="pair empty">
					{#if $editMode}
						<span class="pair-index">{i + 1}</span>
						<span class="pair-placeholder">—</span>
					{/if}
				</div>
			{/if}
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
		display: grid;
		grid-template-columns: repeat(var(--inner-cols), 1fr);
		grid-auto-rows: 1fr;
		gap: 0.3rem 0.5rem;
		align-items: center;
		min-height: 0;
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
		position: relative;
	}

	.pair-index {
		position: absolute;
		top: 0;
		right: 0;
		font-size: 0.6rem;
		font-weight: 700;
		opacity: 0.55;
		color: var(--theme-button-state-color-off);
		pointer-events: none;
		z-index: 1;
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
