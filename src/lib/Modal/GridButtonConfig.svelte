<!--
  GridButtonConfig — tabbed editor for grid_button.

  Same template-aware pattern as FlexGridConfig / InfoGridConfig: each
  cell can have its own Jinja for state, label and color, plus static
  fallbacks for entity_id, icon and more_info.
-->
<script lang="ts">
	import { dashboard, record, lang, ripple, entityList, states, templates } from '$lib/Stores';
	import { onDestroy } from 'svelte';
	import GridButton from '$lib/Main/GridButton.svelte';
	import Select from '$lib/Components/Select.svelte';
	import Modal from '$lib/Modal/Index.svelte';
	import Icon from '@iconify/svelte';
	import Ripple from 'svelte-ripple';
	import InputClear from '$lib/Components/InputClear.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import { updateObj } from '$lib/Utils';
	import { openModal } from 'svelte-modals';

	export let isOpen: boolean;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	type CellKey = 'entity_id' | 'label' | 'state' | 'icon' | 'color' | 'more_info';

	let name = sel?.name;
	let icon = sel?.icon;

	function commit() {
		sel = sel;
		$dashboard = $dashboard;
	}

	function setCellField(index: number, key: CellKey, value: string | boolean | undefined) {
		if (!Array.isArray((sel as any).cells)) (sel as any).cells = [];
		while ((sel as any).cells.length <= index) (sel as any).cells.push({});
		if (value === undefined || value === '' || value === false) {
			delete (sel as any).cells[index][key];
		} else {
			(sel as any).cells[index][key] = value;
		}
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

	function clearCell(index: number) {
		const keys: CellKey[] = ['entity_id', 'label', 'state', 'icon', 'color', 'more_info'];
		for (const k of keys) setCellField(index, k, undefined);
		if ((sel as any).cells?.[index]?.template) delete (sel as any).cells[index].template;
		commit();
	}

	function openTemplaterFor(cellIndex: number, key: 'state' | 'label' | 'color') {
		if (!Array.isArray((sel as any).cells)) (sel as any).cells = [];
		while ((sel as any).cells.length <= cellIndex) (sel as any).cells.push({});
		const cell = (sel as any).cells[cellIndex];
		if (!cell.id) {
			cell.id = `${sel?.id ?? 'grid'}_cell_${cellIndex}_${Math.random().toString(36).slice(2, 8)}`;
		}
		if (!cell.template) cell.template = {};
		openModal(() => import('$lib/Modal/Templater.svelte'), { sel: cell, type: key });
		commit();
	}

	function hasTemplate(cellIndex: number, key: 'state' | 'label' | 'color'): boolean {
		return !!uiCells[cellIndex]?.template?.[key];
	}

	onDestroy(() => $record());

	$: options = $entityList('');

	const TOTAL_SLOTS = 6;
	$: uiCells = (() => {
		const arr = ((sel?.cells as any[]) || []).slice(0, TOTAL_SLOTS);
		while (arr.length < TOTAL_SLOTS) arr.push({});
		return arr;
	})();

	let activeCellTab = 0;
</script>

{#if isOpen}
	<Modal size="large">
		<h1 slot="title">{$lang('grid_button')}</h1>

		<h2>{$lang('preview')}</h2>

		<div style:pointer-events="none" style:max-width="14.5rem">
			<GridButton {sel} {sectionName} />
		</div>

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

		<h2>{$lang('cells')} ({TOTAL_SLOTS})</h2>

		<div class="cell-tabs" role="tablist">
			{#each uiCells as cell, i}
				<button
					class="cell-tab"
					class:active={activeCellTab === i}
					class:filled={!!cell?.entity_id}
					role="tab"
					aria-selected={activeCellTab === i}
					on:click={() => (activeCellTab = i)}
					use:Ripple={$ripple}
				>
					{i + 1}
				</button>
			{/each}
		</div>

		{@const cell = uiCells[activeCellTab] || {}}
		<div class="cell-editor">
			<h3>
				{$lang('entity')}
				{#if cell?.entity_id}
					<small class="muted">— {cell.entity_id}</small>
				{/if}
			</h3>
			<Select
				{options}
				placeholder={$lang('entity')}
				value={cell?.entity_id}
				on:change={(event) =>
					setCellField(activeCellTab, 'entity_id', event?.detail || undefined)}
				computeIcons={true}
			/>

			<h3>{$lang('label')}</h3>
			<div class="icon-with-picker">
				<input
					class="input icon-input"
					type="text"
					placeholder={hasTemplate(activeCellTab, 'label') ? '(template)' : $lang('label')}
					autocomplete="off"
					spellcheck="false"
					value={cell?.label || ''}
					disabled={hasTemplate(activeCellTab, 'label')}
					class:disabled={hasTemplate(activeCellTab, 'label')}
					on:input={(e) =>
						setCellField(activeCellTab, 'label', e.currentTarget.value || undefined)}
				/>
				<button
					use:Ripple={$ripple}
					title={$lang('template')}
					class="icon-gallery icon-picker-btn"
					class:template-active={hasTemplate(activeCellTab, 'label')}
					on:click={() => openTemplaterFor(activeCellTab, 'label')}
				>
					<Icon icon="ph:brackets-curly-bold" height="none" />
				</button>
			</div>

			<h3>{$lang('state')}</h3>
			<div class="icon-with-picker">
				<input
					class="input icon-input"
					type="text"
					placeholder={hasTemplate(activeCellTab, 'state')
						? '(template)'
						: cell?.entity_id
							? $states?.[cell.entity_id]?.state || $lang('state')
							: $lang('state')}
					autocomplete="off"
					spellcheck="false"
					value={cell?.state || ''}
					disabled={hasTemplate(activeCellTab, 'state')}
					class:disabled={hasTemplate(activeCellTab, 'state')}
					on:input={(e) =>
						setCellField(activeCellTab, 'state', e.currentTarget.value || undefined)}
				/>
				<button
					use:Ripple={$ripple}
					title={$lang('template')}
					class="icon-gallery icon-picker-btn"
					class:template-active={hasTemplate(activeCellTab, 'state')}
					on:click={() => openTemplaterFor(activeCellTab, 'state')}
				>
					<Icon icon="ph:brackets-curly-bold" height="none" />
				</button>
			</div>

			<h3>{$lang('icon')}</h3>
			<div class="icon-with-picker">
				<input
					class="input icon-input"
					type="text"
					placeholder={$lang('icon')}
					autocomplete="off"
					spellcheck="false"
					value={cell?.icon || ''}
					on:input={(e) =>
						setCellField(activeCellTab, 'icon', e.currentTarget.value || undefined)}
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

			<h3>{$lang('color')}</h3>
			<div class="icon-with-picker">
				<input
					class="input icon-input"
					type="text"
					placeholder={hasTemplate(activeCellTab, 'color') ? '(template)' : $lang('color')}
					autocomplete="off"
					spellcheck="false"
					value={cell?.color || ''}
					disabled={hasTemplate(activeCellTab, 'color')}
					class:disabled={hasTemplate(activeCellTab, 'color')}
					on:input={(e) =>
						setCellField(activeCellTab, 'color', e.currentTarget.value || undefined)}
				/>
				<input
					type="color"
					value={cell?.color && cell.color.startsWith('#') ? cell.color : '#4ba6ed'}
					disabled={hasTemplate(activeCellTab, 'color')}
					on:input={(e) => setCellField(activeCellTab, 'color', e.currentTarget.value)}
					on:change={(e) => setCellField(activeCellTab, 'color', e.currentTarget.value)}
					title={$lang('color')}
				/>
				<button
					use:Ripple={$ripple}
					title={$lang('template')}
					class="icon-gallery icon-picker-btn"
					class:template-active={hasTemplate(activeCellTab, 'color')}
					on:click={() => openTemplaterFor(activeCellTab, 'color')}
				>
					<Icon icon="ph:brackets-curly-bold" height="none" />
				</button>
			</div>

			<h3>{$lang('show_more_info')}</h3>
			<div class="button-container">
				<button
					class:selected={cell?.more_info !== false}
					on:click={() => setCellField(activeCellTab, 'more_info', undefined)}
					use:Ripple={$ripple}
				>
					{$lang('yes')}
				</button>
				<button
					class:selected={cell?.more_info === false}
					on:click={() => setCellField(activeCellTab, 'more_info', false)}
					use:Ripple={$ripple}
				>
					{$lang('no')}
				</button>
			</div>

			{#if cell?.entity_id}
				<button
					class="clear-cell"
					use:Ripple={$ripple}
					on:click={() => clearCell(activeCellTab)}
				>
					{$lang('clear')}
				</button>
			{/if}
		</div>

		<ConfigButtons {sel} />
	</Modal>
{/if}

<style>
	.cell-tabs {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin: 0.5rem 0 0.8rem;
	}

	.cell-tab {
		min-width: 2.2rem;
		height: 2.2rem;
		padding: 0 0.6rem;
		border-radius: 0.45rem;
		border: 1px solid rgba(255, 255, 255, 0.15);
		background: rgba(0, 0, 0, 0.25);
		color: var(--theme-button-name-color-off);
		font-weight: 600;
		font-size: 0.9rem;
		font-family: inherit;
		cursor: pointer;
		transition:
			background-color 120ms ease,
			border-color 120ms ease;
		position: relative;
		overflow: hidden;
	}

	.cell-tab:hover {
		background: rgba(0, 0, 0, 0.35);
	}

	.cell-tab.filled::after {
		content: '';
		position: absolute;
		bottom: 3px;
		left: 50%;
		transform: translateX(-50%);
		width: 8px;
		height: 2px;
		border-radius: 1px;
		background: rgb(75, 166, 237);
	}

	.cell-tab.active {
		background: rgba(255, 193, 7, 0.18);
		border-color: rgb(255, 193, 7);
		color: rgb(255, 215, 100);
	}

	.cell-editor {
		background: rgba(0, 0, 0, 0.18);
		border-radius: 0.5rem;
		padding: 0.8rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.cell-editor h3 {
		margin: 0.4rem 0 0.25rem;
		font-size: 0.85rem;
		font-weight: 600;
		opacity: 0.85;
	}

	.cell-editor h3:first-child {
		margin-top: 0;
	}

	.muted {
		opacity: 0.55;
		font-weight: 400;
		font-size: 0.78rem;
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

	.template-active {
		color: rgb(59, 15, 16) !important;
		background-color: rgb(255, 193, 7) !important;
	}

	.input.disabled {
		opacity: 0.4;
	}

	input[type='color'] {
		color-scheme: dark;
		height: 2.5rem;
		width: 3.15rem;
		padding: 0;
		-webkit-appearance: none;
		appearance: none;
		background-color: transparent;
		cursor: pointer;
		border: none;
	}

	input[type='color']::-webkit-color-swatch {
		border-radius: 0.4rem;
		border: none;
	}

	.clear-cell {
		margin-top: 0.7rem;
		padding: 0.5rem 0.8rem;
		background: rgba(244, 67, 54, 0.18);
		color: rgb(255, 150, 145);
		border: 1px solid rgba(244, 67, 54, 0.4);
		border-radius: 0.45rem;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.85rem;
		align-self: flex-start;
	}

	.clear-cell:hover {
		background: rgba(244, 67, 54, 0.3);
	}
</style>
