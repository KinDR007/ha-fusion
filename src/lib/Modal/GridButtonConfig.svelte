<!--
  GridButtonConfig — dedicated editor for `grid_button` item type.

  Lets the user define:
    - Title + icon (optional header above the grid)
    - Up to 6 cells, each with: entity_id, label (optional), icon (optional)
-->
<script lang="ts">
	import {
		dashboard,
		states,
		record,
		lang,
		ripple,
		entityList
	} from '$lib/Stores';
	import { onDestroy } from 'svelte';
	import GridButton from '$lib/Main/GridButton.svelte';
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

	let name = sel?.name;
	let icon = sel?.icon;

	/**
	 * `sel.cells` is an array of up to 6 `{ entity_id, label, icon }` objects.
	 * Always work with a 6-slot array internally so the UI doesn't shift
	 * when the user adds/removes entries.
	 */
	function ensureCells() {
		if (!Array.isArray((sel as any).cells)) {
			(sel as any).cells = [];
		}
		while ((sel as any).cells.length < 6) {
			(sel as any).cells.push({});
		}
	}

	function commit() {
		sel = sel;
		$dashboard = $dashboard;
	}

	function setCellField(index: number, key: 'entity_id' | 'label' | 'icon', value: string | undefined) {
		ensureCells();
		if (value === undefined || value === '') {
			delete (sel as any).cells[index][key];
		} else {
			(sel as any).cells[index][key] = value;
		}
		// Prune trailing empty cells so the YAML stays tidy on save
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

	// 6 fixed slots for the UI, regardless of what's actually saved
	$: uiCells = (() => {
		const arr = ((sel?.cells as any[]) || []).slice(0, 6);
		while (arr.length < 6) arr.push({});
		return arr;
	})();
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

		<h2>{$lang('cells')}</h2>

		<div class="cells">
			{#each uiCells as cell, i}
				<div class="cell-row">
					<div class="cell-index">{i + 1}</div>
					<div class="cell-controls">
						<Select
							{options}
							placeholder={$lang('entity')}
							value={cell?.entity_id}
							on:change={(event) => {
								setCellField(i, 'entity_id', event?.detail || undefined);
							}}
							computeIcons={true}
						/>
						<input
							class="input small"
							type="text"
							placeholder={$lang('label')}
							autocomplete="off"
							spellcheck="false"
							value={cell?.label || ''}
							on:input={(e) =>
								setCellField(i, 'label', e.currentTarget.value || undefined)}
						/>
						<div class="icon-with-picker">
							<input
								class="input small icon-input"
								type="text"
								placeholder={$lang('icon')}
								autocomplete="off"
								spellcheck="false"
								value={cell?.icon || ''}
								on:input={(e) =>
									setCellField(i, 'icon', e.currentTarget.value || undefined)}
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
	.cells {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 0.5rem;
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
