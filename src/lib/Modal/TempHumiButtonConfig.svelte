<!--
  TempHumiButtonConfig — dedicated editor for `temp_humi_button`.

  The temperature entity picker is filtered to sensors that have a
  matching humidity sibling. A second picker lets the user override the
  humidity entity if the auto-detection picks something they didn't
  intend (rare but possible with custom integrations).
-->
<script lang="ts">
	import { dashboard, states, templates, record, lang, ripple } from '$lib/Stores';
	import { onDestroy } from 'svelte';
	import TempHumiButton from '$lib/Main/TempHumiButton.svelte';
	import Select from '$lib/Components/Select.svelte';
	import Modal from '$lib/Modal/Index.svelte';
	import Icon from '@iconify/svelte';
	import Ripple from 'svelte-ripple';
	import InputClear from '$lib/Components/InputClear.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import { updateObj, getName } from '$lib/Utils';
	import { deriveHumiditySibling, listThPairs } from '$lib/Constants/TempHumi';
	import { openModal } from 'svelte-modals';

	export let isOpen: boolean;
	export let sel: any;
	export let sectionName: string | undefined = undefined;

	let name = sel?.name;
	let icon = sel?.icon;

	function set(key: string, event?: any) {
		sel = updateObj(sel, key, event);
		$dashboard = $dashboard;
	}

	function setField(key: string, value: string | undefined) {
		if (value === undefined || value === '') {
			delete (sel as any)[key];
		} else {
			(sel as any)[key] = value;
		}
		sel = sel;
		$dashboard = $dashboard;
	}

	/**
	 * Open the standard Templater modal for a given field. The temp_humi_button
	 * item itself is passed as `sel` — Templater writes to sel.template[key],
	 * which is then picked up by TempHumiButton's render_template subscription
	 * loop. Same pattern Button.svelte uses.
	 */
	function openTemplaterFor(key: 'state' | 'color' | 'name' | 'icon') {
		if (!sel.template) sel.template = {};
		openModal(() => import('$lib/Modal/Templater.svelte'), {
			sel,
			type: key
		});
		$dashboard = $dashboard;
	}

	function hasTemplate(key: 'state' | 'color' | 'name' | 'icon'): boolean {
		return !!sel?.template?.[key];
	}

	onDestroy(() => $record());

	/**
	 * Build the temperature picker options from $states. Each entry's
	 * `hint` advertises the matched humidity sibling so the user can spot
	 * a wrong pairing before saving.
	 */
	$: pairOptions = listThPairs($states).map((p) => ({
		id: p.temperature_entity,
		label: p.label,
		hint: `${p.temperature_entity} ↔ ${p.humidity_entity}`
	}));

	$: showAll = sel?.show_all_entities === true;

	$: tempOptions = showAll
		? Object.keys($states)
				.filter((k) => k.startsWith('sensor.'))
				.map((id) => ({ id, label: getName(undefined, $states[id]) || id, hint: id }))
				.sort((a, b) => a.label.localeCompare(b.label))
		: pairOptions;

	$: humidityFallback = sel?.entity_id
		? deriveHumiditySibling(sel.entity_id, $states)
		: undefined;
</script>

{#if isOpen}
	<Modal>
		<h1 slot="title">{$lang('temp_humi_button')}</h1>

		<h2>{$lang('preview')}</h2>

		<div style:pointer-events="none">
			<TempHumiButton {sel} {sectionName} />
		</div>

		<h2>{$lang('temperature_entity')}</h2>

		<div style="display: flex; gap: 0.8rem;">
			<div class="full-width">
				<Select
					options={tempOptions}
					placeholder={$lang('entity')}
					value={sel?.entity_id}
					on:change={(event) => {
						if (event?.detail === null) return;
						setField('entity_id', event.detail);
						// Clear any stale humidity override; auto-detect picks up
						setField('humidity_entity', undefined);
					}}
					computeIcons={true}
				/>
				<label
					style="display:flex; align-items:center; gap:0.5rem; margin-top:0.5rem; font-size:0.85rem; opacity:0.75;"
				>
					<input
						type="checkbox"
						checked={showAll}
						on:change={(e) =>
							setField('show_all_entities', e.currentTarget.checked ? 'true' : undefined)}
					/>
					{$lang('show_all_entities')}
					{#if !showAll}
						<span style="opacity:0.6;">({pairOptions.length})</span>
					{/if}
				</label>
			</div>
		</div>

		<h2>
			{$lang('humidity_entity')}
			{#if humidityFallback && !sel?.humidity_entity}
				<small class="muted">— auto: {humidityFallback}</small>
			{/if}
		</h2>

		<div class="icon-gallery-container">
			<InputClear
				condition={sel?.humidity_entity}
				on:clear={() => setField('humidity_entity', undefined)}
				let:padding
			>
				<input
					class="input"
					type="text"
					placeholder={humidityFallback || $lang('humidity_entity')}
					autocomplete="off"
					spellcheck="false"
					value={sel?.humidity_entity || ''}
					on:input={(e) => setField('humidity_entity', e.currentTarget.value || undefined)}
					style:padding
				/>
			</InputClear>
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
					placeholder={hasTemplate('name') ? '(template)' : $lang('name')}
					autocomplete="off"
					spellcheck="false"
					bind:value={name}
					on:change={(event) => set('name', event)}
					style:padding
					disabled={hasTemplate('name')}
					class:disabled={hasTemplate('name')}
				/>
			</InputClear>
			<button
				use:Ripple={$ripple}
				title={$lang('template')}
				class="icon-gallery"
				class:template-active={hasTemplate('name')}
				on:click={() => openTemplaterFor('name')}
				style:padding="0.85rem"
			>
				<Icon icon="ph:brackets-curly-bold" height="none" />
			</button>
		</div>

		<h2>{$lang('state')}</h2>
		<div class="icon-gallery-container">
			<InputClear
				condition={sel?.state}
				on:clear={() => setField('state', undefined)}
				let:padding
			>
				<input
					class="input"
					type="text"
					placeholder={hasTemplate('state') ? '(template)' : '21.5 °C / 55 %'}
					autocomplete="off"
					spellcheck="false"
					value={sel?.state || ''}
					on:input={(e) => setField('state', e.currentTarget.value || undefined)}
					style:padding
					disabled={hasTemplate('state')}
					class:disabled={hasTemplate('state')}
				/>
			</InputClear>
			<button
				use:Ripple={$ripple}
				title={$lang('template')}
				class="icon-gallery"
				class:template-active={hasTemplate('state')}
				on:click={() => openTemplaterFor('state')}
				style:padding="0.85rem"
			>
				<Icon icon="ph:brackets-curly-bold" height="none" />
			</button>
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
					placeholder={hasTemplate('icon') ? '(template)' : 'mdi:thermometer-water'}
					autocomplete="off"
					spellcheck="false"
					bind:value={icon}
					on:change={(event) => set('icon', event)}
					style:padding
					disabled={hasTemplate('icon')}
					class:disabled={hasTemplate('icon')}
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
			<button
				use:Ripple={$ripple}
				title={$lang('template')}
				class="icon-gallery"
				class:template-active={hasTemplate('icon')}
				on:click={() => openTemplaterFor('icon')}
				style:padding="0.85rem"
			>
				<Icon icon="ph:brackets-curly-bold" height="none" />
			</button>
		</div>

		<h2>{$lang('color')}</h2>
		<div class="icon-gallery-container">
			<InputClear
				condition={sel?.color}
				on:clear={() => setField('color', undefined)}
				let:padding
			>
				<input
					class="input"
					type="text"
					placeholder={hasTemplate('color') ? '(template)' : $lang('color')}
					autocomplete="off"
					spellcheck="false"
					value={sel?.color || ''}
					on:input={(e) => setField('color', e.currentTarget.value || undefined)}
					style:padding
					disabled={hasTemplate('color')}
					class:disabled={hasTemplate('color')}
				/>
			</InputClear>
			<input
				type="color"
				value={sel?.color && sel.color.startsWith('#') ? sel.color : '#4ba6ed'}
				disabled={hasTemplate('color')}
				on:input={(e) => setField('color', e.currentTarget.value)}
				on:change={(e) => setField('color', e.currentTarget.value)}
				title={$lang('color')}
			/>
			<button
				use:Ripple={$ripple}
				title={$lang('template')}
				class="icon-gallery"
				class:template-active={hasTemplate('color')}
				on:click={() => openTemplaterFor('color')}
				style:padding="0.85rem"
			>
				<Icon icon="ph:brackets-curly-bold" height="none" />
			</button>
		</div>

		<ConfigButtons {sel} />
	</Modal>
{/if}

<style>
	.full-width {
		width: -webkit-fill-available;
		width: -moz-available;
	}
	.muted {
		opacity: 0.55;
		font-weight: 400;
		font-size: 0.78rem;
	}
</style>
