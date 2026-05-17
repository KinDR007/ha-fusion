<!--
  FlexGrid — universal grid tile.

  Configurable in two independent dimensions:
    span_cols  / span_rows   — how many dashboard grid cells the tile occupies
                               (1..4 × 1..6). The default tile size is 1x1.
    inner_cols / inner_rows  — how many cells fit INSIDE the tile.

  Each inner cell can hold ANY entity (switch / light / sensor / cover / …).
  The cell automatically figures out whether it's interactive (clicking
  toggles or opens the right modal) or read-only (just shows the value),
  based on the entity's domain.

  YAML:
    - id: 1234
      type: flex_grid
      name: Obyvák
      icon: mdi:sofa
      span_cols: 1
      span_rows: 2
      inner_cols: 2
      inner_rows: 3
      cells:
        - entity_id: light.lampa
          label: Lampa
          icon: mdi:floor-lamp
        - entity_id: switch.tv
          label: TV
        - entity_id: sensor.obyvak_temperature
          label: Teplota
        - entity_id: sensor.obyvak_humidity
          label: Vlhkost
        # ...
-->
<script lang="ts">
	import ComputeIcon from '$lib/Components/ComputeIcon.svelte';
	import { connection, editMode, itemHeight, ripple, states, lang } from '$lib/Stores';
	import { getName, getDomain, getTogglableService } from '$lib/Utils';
	import { openEntityModal } from '$lib/Main/openEntityModal';
	import Icon, { loadIcon } from '@iconify/svelte';
	import { callService } from 'home-assistant-js-websocket';
	import { openModal } from 'svelte-modals';
	import Ripple from 'svelte-ripple';

	export const demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	$: cells = (sel?.cells || []) as Array<{
		entity_id?: string;
		label?: string;
		icon?: string;
		more_info?: boolean;
	}>;
	$: title = sel?.name;
	$: headerIcon = sel?.icon;

	$: innerCols = Math.max(1, Math.min(Number(sel?.inner_cols) || 2, 6));
	$: innerRows = Math.max(1, Math.min(Number(sel?.inner_rows) || 3, 8));
	$: totalSlots = innerCols * innerRows;

	$: spanRows = Math.max(1, Math.min(Number(sel?.span_rows) || 2, 6));

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

	/** Domains we treat as read-only "info" cells (no toggle, no on-state). */
	const INFO_DOMAINS = new Set([
		'sensor',
		'binary_sensor',
		'weather',
		'sun',
		'air_quality',
		'date',
		'time',
		'image_processing',
		'stt',
		'person',
		'zone',
		'device_tracker',
		'update',
		'event'
	]);

	function isClickable(eid: string | undefined): boolean {
		if (!eid) return false;
		const domain = getDomain(eid);
		return !INFO_DOMAINS.has(domain);
	}

	async function handleContainerClick() {
		if ($editMode) {
			openModal(() => import('$lib/Modal/FlexGridConfig.svelte'), { sel, sectionName });
		}
	}

	async function handlePointer() {
		if ($editMode) await import('$lib/Modal/FlexGridConfig.svelte');
	}

	async function handleCellClick(cell: { entity_id?: string; more_info?: boolean }) {
		const eid = cell?.entity_id;
		if (!eid) return;
		const entity = $states?.[eid];
		const service = getTogglableService(entity);
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
	style:min-height="{$itemHeight * spanRows}px"
	style:--inner-cols={innerCols}
	style:--inner-rows={innerRows}
	on:pointerenter={handlePointer}
	on:pointerdown={handlePointer}
	on:click|stopPropagation={handleContainerClick}
	on:keydown
	role={$editMode ? 'button' : undefined}
>
	{#if title || headerIcon}
		<div class="header">
			{#if headerIcon}
				<span class="header-icon">
					{#await loadIcon(headerIcon)}
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

	<div class="grid">
		{#each Array(totalSlots) as _, i}
			{@const cell = cells[i]}
			{#if cell?.entity_id}
				{@const cellEntity = $states?.[cell.entity_id]}
				{@const cellOn =
					cellEntity?.state === 'on' ||
					cellEntity?.state === 'open' ||
					cellEntity?.state === 'unlocked'}
				{@const clickable = isClickable(cell.entity_id)}
				<div
					class="cell"
					class:clickable
					class:info={!clickable}
					data-state={cellOn}
					tabindex={clickable ? 0 : -1}
					role={clickable ? 'button' : undefined}
					on:click|stopPropagation={() => {
						if ($editMode) handleContainerClick();
						else if (clickable) handleCellClick(cell);
						else handleCellClick(cell); /* info → open info modal */
					}}
					on:keydown={(e) => {
						if ((e.key === 'Enter' || e.key === ' ') && !$editMode) handleCellClick(cell);
					}}
					use:Ripple={{
						...$ripple,
						color: $editMode || !clickable ? 'rgba(0,0,0,0)' : 'rgba(255,255,255,0.18)'
					}}
				>
					<span class="cell-icon">
						{#if cell.icon}
							{#await loadIcon(cell.icon)}
								<Icon icon="ooui:help-ltr" height="none" width="100%" />
							{:then resolvedIcon}
								<Icon icon={resolvedIcon} height="none" width="100%" />
							{:catch}
								<Icon icon="ooui:help-ltr" height="none" width="100%" />
							{/await}
						{:else}
							<ComputeIcon entity_id={cell.entity_id} />
						{/if}
					</span>
					<div class="cell-text">
						<div class="cell-label">{labelFor(cell)}</div>
						<div class="cell-value">{valueFor(cell.entity_id)}</div>
					</div>
				</div>
			{:else}
				<div class="cell empty" class:editing={$editMode}>
					{#if $editMode}<span class="cell-placeholder">+</span>{/if}
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
		padding: 0.5rem 0.55rem;
		gap: 0.35rem;
		overflow: hidden;
		transform: translateZ(0);
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--theme-button-name-color-off);
		min-height: 1.4rem;
		padding: 0.05rem 0.15rem 0.2rem 0.15rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.header-icon {
		display: inline-flex;
		width: 1.2rem;
		height: 1.2rem;
		flex-shrink: 0;
		color: rgb(180, 220, 255);
	}

	.header-text {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.grid {
		flex: 1;
		display: grid;
		grid-template-columns: repeat(var(--inner-cols), 1fr);
		grid-template-rows: repeat(var(--inner-rows), 1fr);
		gap: 0.3rem;
		min-height: 0;
	}

	.cell {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.45rem;
		background: rgba(0, 0, 0, 0.18);
		border-radius: 0.4rem;
		padding: 0.25rem 0.4rem;
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

	.cell.info {
		cursor: default;
		background: rgba(255, 255, 255, 0.04);
	}

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

	.cell-icon {
		width: 1.15rem;
		height: 1.15rem;
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
		font-size: 0.7rem;
		opacity: 0.7;
		color: var(--theme-button-state-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-value {
		font-size: 0.92rem;
		font-weight: 600;
		color: var(--theme-button-state-color-off);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		margin-top: 0.05rem;
	}
</style>
