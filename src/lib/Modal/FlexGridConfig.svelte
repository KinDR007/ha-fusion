<!--
  FlexGridConfig — editor for the universal `flex_grid` tile.

  Lets the user set:
    - Title + icon (header above the cell grid)
    - Tile footprint on the dashboard: span_cols × span_rows
    - Inner cell grid: inner_cols × inner_rows
    - List of cells (entity_id, label, icon) — size = inner_cols × inner_rows
-->
<script lang="ts">
	import { dashboard, record, lang, ripple, entityList } from '$lib/Stores';
	import { onDestroy } from 'svelte';
	import FlexGrid from '$lib/Main/FlexGrid.svelte';
	import Select from '$lib/Components/Select.svelte';
	import Modal from '$lib/Modal/Index.svelte';
	import Icon from '@iconify/svelte';
	import Ripple from 'svelte-ripple';
	import InputClear from '$lib/Components/InputClear.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import { updateObj } from '$lib/Utils';

	export let isOpen: boolean;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	// Defaults so sel.span_*/inner_* always have sensible values
	function clamp(v: any, lo: number, hi: number, def: number): number {
		const n = Number(v);
		if (!Number.isFinite(n)) return def;
		return Math.max(lo, Math.min(n, hi));
	}

	let name = sel?.name;
	let icon = sel?.icon;

	function commit() {
		sel = sel;
		$dashboard = $dashboard;
	}

	function setField(key: string, value: any) {
		if (value === undefined || value === '' || value === null) {
			delete (sel as any)[key];
		} else {
			(sel as any)[key] = value;
		}
		commit();
	}

	function setCellField(index: number, key: 'entity_id' | 'label' | 'icon', value: string | undefined) {
		if (!Array.isArray((sel as any).cells)) (sel as any).cells = [];
		while ((sel as any).cells.length <= index) (sel as any).cells.push({});
		if (value === undefined || value === '') {
			delete (sel as any).cells[index][key];
		} else {
			(sel as any).cells[index][key] = value;
		}
		// trim trailing fully-empty cells
		while (
			(sel as any).cells.length > 0 &&
			Object.keys((sel as any).cells[(sel as any).cells.length - 1]).length === 0
		) {
			(sel as any).cells.pop();
		}
		commit();
	}

	function set(key: string, event?: any) {
		sel = updateObj(sel, key, event);
		$dashboard = $dashboard;
	}

	onDestroy(() => $record());

	$: options = $entityList('');

	// Derived dimensions
	$: spanCols = clamp(sel?.span_cols, 1, 4, 1);
	$: spanRows = clamp(sel?.span_rows, 1, 6, 2);
	$: innerCols = clamp(sel?.inner_cols, 1, 6, 2);
	$: innerRows = clamp(sel?.inner_rows, 1, 8, 3);
	$: totalSlots = innerCols * innerRows;

	$: uiCells = (() => {
		const arr = ((sel?.cells as any[]) || []).slice(0, totalSlots);
		while (arr.length < totalSlots) arr.push({});
		return arr;
	})();
</script>

{#if isOpen}
	<Modal size="large">
		<h1 slot="title">{$lang('flex_grid')}</h1>

		<h2>{$lang('preview')}</h2>

		<div
			style:pointer-events="none"
			style:max-width="{spanCols * 14.5}rem"
			style:min-height="{spanRows * 4}rem"
		>
			<FlexGrid {sel} {sectionName} />
		</div>

		<!-- ─── Dimensions ─── -->
		<h2>{$lang('dimensions')}</h2>

		<div class="dim-grid">
			<label>
				<span>{$lang('span_cols')}</span>
				<select
					value={spanCols}
					on:change={(e) => setField('span_cols', Number(e.currentTarget.value))}
				>
					{#each [1, 2, 3, 4] as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{$lang('span_rows')}</span>
				<select
					value={spanRows}
					on:change={(e) => setField('span_rows', Number(e.currentTarget.value))}
				>
					{#each [1, 2, 3, 4, 5, 6] as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{$lang('inner_cols')}</span>
				<select
					value={innerCols}
					on:change={(e) => setField('inner_cols', Number(e.currentTarget.value))}
				>
					{#each [1, 2, 3, 4, 5, 6] as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</label>
			<label>
				<span>{$lang('inner_rows')}</span>
				<select
					value={innerRows}
					on:change={(e) => setField('inner_rows', Number(e.currentTarget.value))}
				>
					{#each [1, 2, 3, 4, 5, 6, 7, 8] as n}
						<option value={n}>{n}</option>
					{/each}
				</select>
			</label>
		</div>

		<!-- ─── Name ─── -->
		<h2>{$lang('name')}</h2>

		<div class="icon-gallery-container">
			<InputClear
				condition={name}
				on:clear={() => {
					name = undefined;
					set('name');
				}}
				let:padding
			>
				<input
					class="input"
					type="text"
					placeholder={$lang('name')}
					autocomplete="off"
					spellcheck="false"
					bind:value={name}
					on:change={(event) => set('name', event)}
					style:padding
				/>
			</InputClear>
		</div>

		<!-- ─── Icon ─── -->
		<h2>{$lang('icon')}</h2>

		<div class="icon-gallery-container">
			<InputClear
				condition={icon}
				on:clear={() => {
					icon = undefined;
					set('icon');
				}}
				let:padding
			>
				<input
					class="input"
					type="text"
					placeholder={$lang('icon')}
					autocomplete="off"
					spellcheck="false"
					bind:value={icon}
					on:change={(event) => set('icon', event)}
					style:padding
				/>
			</InputClear>
			<button
				use:Ripple={$ripple}
				title={$lang('icon')}
				class="icon-gallery"
				on:click={() => window.open('https://icon-sets.iconify.design/', '_blank')}
				style:padding="0.84rem"
			>
				<Icon icon="majesticons:open-line" height="none" />
			</button>
		</div>

		<!-- ─── Cells ─── -->
		<h2>{$lang('cells')} ({totalSlots})</h2>

		<div class="cells">
			{#each uiCells as cell, i}
				<div class="cell-row">
					<div class="cell-index">{i + 1}</div>
					<div class="cell-controls">
						<Select
							{options}
							placeholder={$lang('entity')}
							value={cell?.entity_id}
							on:change={(event) => setCellField(i, 'entity_id', event?.detail || undefined)}
							computeIcons={true}
						/>
						<input
							class="input small"
							type="text"
							placeholder={$lang('label')}
							autocomplete="off"
							spellcheck="false"
							value={cell?.label || ''}
							on:input={(e) => setCellField(i, 'label', e.currentTarget.value || undefined)}
						/>
						<div class="icon-with-picker">
							<input
								class="input small icon-input"
								type="text"
								placeholder={$lang('icon')}
								autocomplete="off"
								spellcheck="false"
								value={cell?.icon || ''}
								on:input={(e) => setCellField(i, 'icon', e.currentTarget.value || undefined)}
							/>
							<button
								use:Ripple={$ripple}
								title={$lang('icon')}
								class="icon-gallery icon-picker-btn"
								on:click={() => window.open('https://icon-sets.iconify.design/', '_blank')}
							>
								<Icon icon="majesticons:open-line" height="none" />
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>

		<ConfigButtons {sel} />
	</Modal>
{/if}

<style>
	.dim-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
		gap: 0.6rem;
		margin: 0.5rem 0 1rem;
	}

	.dim-grid label {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.85rem;
	}

	.dim-grid select {
		padding: 0.45rem 0.5rem;
		background: rgba(0, 0, 0, 0.25);
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 0.4rem;
		font-family: inherit;
	}

	.cells {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.5rem;
		max-height: 28rem;
		overflow-y: auto;
	}

	.cell-row {
		display: flex;
		align-items: flex-start;
		gap: 0.6rem;
	}

	.cell-index {
		flex-shrink: 0;
		width: 1.4rem;
		text-align: center;
		font-weight: 600;
		color: var(--theme-button-name-color-off);
		opacity: 0.6;
		padding-top: 0.5rem;
	}

	.cell-controls {
		flex: 1;
		display: grid;
		grid-template-columns: 2fr 1fr 1fr;
		gap: 0.4rem;
		min-width: 0;
	}

	.input.small {
		font-size: 0.85rem;
	}

	.icon-with-picker {
		display: flex;
		gap: 0.3rem;
		min-width: 0;
	}

	.icon-input {
		flex: 1;
		min-width: 0;
	}

	.icon-picker-btn {
		flex-shrink: 0;
		padding: 0.55rem 0.7rem !important;
	}

	@media (max-width: 600px) {
		.cell-controls {
			grid-template-columns: 1fr;
		}
	}
</style>
