<!--
  GridButton — tile that occupies one column but TWO rows of the dashboard
  grid (so it stands twice as tall as a regular button while keeping the
  same width). Inside it shows up to 6 cells laid out 2 columns × 3 rows,
  each cell rendering a single entity's value + an optional sub-label.

  Useful for showing a compact set of related readings (e.g. all 6 cell
  voltages on a BMS, or the L1/L2/L3 power readings of a three-phase meter).

  Dashboard YAML:

    - id: 1234567
      type: grid_button
      name: Sekce
      icon: mdi:view-grid
      cells:
        - entity_id: sensor.foo
          label: 'L1'
        - entity_id: sensor.bar
          label: 'L2'
        - entity_id: sensor.baz
          # label optional — falls back to friendly_name
        # ... up to 6 entries

  Layout (CSS Grid spans 2 rows of the parent grid — Index.svelte adds
  `grid-row: span 2` for items of this type).
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
		lang,
		motion
	} from '$lib/Stores';
	import { getName, getTogglableService } from '$lib/Utils';
	import { openEntityModal } from '$lib/Main/openEntityModal';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { callService } from 'home-assistant-js-websocket';
	import { openModal } from 'svelte-modals';
	import { onDestroy } from 'svelte';
	import Ripple from 'svelte-ripple';

	export const demo: string | undefined = undefined; // unused, here for component-API parity with Button.svelte
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: cells = (sel?.cells || []) as Array<{
		id?: string;
		entity_id?: string;
		label?: string;
		state?: string;
		icon?: string;
		color?: string;
		more_info?: boolean;
		template?: Record<string, string>;
	}>;

	/** Stable per-cell id for $templates store keying. */
	function cellTemplateId(index: number): string {
		const cell = cells[index];
		return cell?.id || `${sel?.id ?? 'grid'}_cell_${index}`;
	}

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
			console.error('grid_button cell template error:', e);
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

	/** Outer container click — only meaningful in edit mode (opens dialog). */
	async function handleContainerClick() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/GridButtonConfig.svelte'), { sel, sectionName });
		}
	}

	async function handlePointer() {
		if ($editMode) await import('$lib/Modal/GridButtonConfig.svelte');
	}

	/**
	 * One cell was clicked while NOT in edit mode.
	 *  - if the cell's entity_id is a togglable domain (switch/light/...) and
	 *    `cell.more_info !== true`, toggle it directly
	 *  - otherwise open the right entity modal (LightModal with brightness +
	 *    color, SwitchModal, SensorModal, ...)
	 */
	async function handleCellClick(cell: { entity_id?: string; more_info?: boolean }) {
		const eid = cell?.entity_id;
		if (!eid) return;
		const entity = $states?.[eid];
		const service = getTogglableService(entity);

		// Default → always open the modal (lets user pick brightness/color/
		// confirm switch toggle). User can opt into "tap to toggle" via
		// cell.more_info=false on a per-cell basis.
		if (cell?.more_info === false && service) {
			const [domain, svc] = service.split('.');
			callService($connection, domain, svc, { entity_id: eid });
			return;
		}
		await openEntityModal({ id: sel?.id, entity_id: eid });
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
	role="button"
>
	<!-- Optional title row -->
	{#if title || icon}
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
	{/if}

	<!-- 2 × 3 grid (or fewer rows if cells empty) -->
	<div class="grid">
		{#each Array(6) as _, i}
			{#if cells[i] && cells[i].entity_id}
				{@const cellEntity = $states?.[cells[i].entity_id]}
				{@const cellOn =
					cellEntity?.state === 'on' ||
					cellEntity?.state === 'open' ||
					cellEntity?.state === 'unlocked'}
				{@const tmpl = $templates?.[cellTemplateId(i)]}
				{@const renderedColor = cells[i].template?.color ? tmpl?.color?.output : ''}
				{@const renderedState = cells[i].template?.state ? tmpl?.state?.output : ''}
				{@const renderedLabel = cells[i].template?.label ? tmpl?.label?.output : ''}
				<div
					class="cell clickable"
					data-state={cellOn}
					tabindex="0"
					role="button"
					style:--cell-color={renderedColor || cells[i].color || ''}
					on:click|stopPropagation={() => {
						if (!$editMode) handleCellClick(cells[i]);
						else handleContainerClick();
					}}
					on:keydown={(e) => {
						if ((e.key === 'Enter' || e.key === ' ') && !$editMode) handleCellClick(cells[i]);
					}}
					use:Ripple={{
						...$ripple,
						color: $editMode ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.18)'
					}}
				>
					{#if $editMode}<span class="cell-index">{i + 1}</span>{/if}
					<span class="cell-icon" data-state={cellOn}>
						{#if cells[i].icon}
							{#await loadIcon(cells[i].icon)}
								<Icon icon="ooui:help-ltr" height="none" width="100%" />
							{:then resolvedIcon}
								<Icon icon={resolvedIcon} height="none" width="100%" />
							{:catch}
								<Icon icon="ooui:help-ltr" height="none" width="100%" />
							{/await}
						{:else if cells[i].entity_id}
							<ComputeIcon entity_id={cells[i].entity_id} />
						{/if}
					</span>
					<div class="cell-text">
						<div class="cell-label">{renderedLabel || labelFor(cells[i])}</div>
						<div class="cell-value">
							{renderedState || cells[i].state || valueFor(cells[i].entity_id)}
						</div>
					</div>
				</div>
			{:else}
				<!-- Empty slot. Invisible in run mode (just keeps the grid slot),
				     visible with dashed border + "+" hint in edit mode. -->
				<div class="cell empty" class:editing={$editMode}>
					{#if $editMode}
						<span class="cell-placeholder">+</span>
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
		gap: 0.4rem;
		transform: translateZ(0);
		overflow: hidden;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--theme-button-name-color-off);
		min-height: 1.4rem;
		padding: 0 0.1rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-icon {
		display: inline-flex;
		width: 1.2rem;
		height: 1.2rem;
		flex-shrink: 0;
	}

	.header-text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: 1fr 1fr 1fr;
		gap: 0.35rem;
	}

	.cell {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.45rem;
		background: rgba(0, 0, 0, 0.18);
		border-radius: 0.4rem;
		padding: 0.3rem 0.45rem;
		min-width: 0;
		position: relative;
		overflow: hidden;
		transform: translateZ(0);
	}

	.cell.clickable {
		cursor: pointer;
		transition: background-color 150ms ease;
	}

	.cell.clickable:hover {
		background: rgba(0, 0, 0, 0.28);
	}

	.cell.clickable[data-state='true'] {
		background: rgba(255, 193, 7, 0.18);
	}

	.cell.clickable[data-state='true'] .cell-value {
		color: rgb(255, 215, 100);
	}

	/* Empty slot — invisible in run mode (no background, no border) so the
	   tile looks clean when only some of the 6 cells are filled. Edit mode
	   adds the visual hint back so the user can see/click empty positions. */
	.cell.empty {
		background: transparent;
	}

	.cell.empty.editing {
		background: rgba(255, 255, 255, 0.04);
		border: 1px dashed rgba(255, 255, 255, 0.15);
		justify-content: center;
		align-items: center;
		color: rgba(255, 255, 255, 0.35);
		font-size: 1.2rem;
	}

	.cell-index {
		position: absolute;
		top: 2px;
		right: 4px;
		font-size: 0.6rem;
		font-weight: 700;
		opacity: 0.55;
		color: var(--theme-button-state-color-off);
		pointer-events: none;
		z-index: 1;
	}

	.cell-icon[data-state='true'] {
		background: var(--cell-color, rgb(75, 166, 237)) !important;
		color: white;
	}

	.cell-icon {
		width: 1.2rem;
		height: 1.2rem;
		display: inline-flex;
		flex-shrink: 0;
		opacity: 0.85;
		color: rgb(180, 220, 255);
	}

	.cell-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		justify-content: center;
		line-height: 1.1;
	}

	.cell-label {
		font-size: 0.72rem;
		opacity: 0.7;
		color: var(--theme-button-state-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-value {
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--theme-button-state-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 0.05rem;
	}

	.cell-placeholder {
		opacity: 0.55;
	}
</style>
