<!--
  VictronButtonConfig — dedicated editor for victron_button.

  Lets the user pick:
    1. Primary entity (filtered to curated victron_mqtt sensors)
    2. Optional secondary 1
    3. Optional secondary 2
    4. Name, icon, more_info

  See $lib/Constants/VictronMetrics.ts for the curated metric list.
-->
<script lang="ts">
	import {
		dashboard,
		states,
		record,
		lang,
		ripple,
		history,
		historyIndex,
		entityList
	} from '$lib/Stores';
	import { onDestroy } from 'svelte';
	import VictronButton from '$lib/Main/VictronButton.svelte';
	import Select from '$lib/Components/Select.svelte';
	import Modal from '$lib/Modal/Index.svelte';
	import Icon from '@iconify/svelte';
	import Ripple from 'svelte-ripple';
	import InputClear from '$lib/Components/InputClear.svelte';
	import ConfigButtons from '$lib/Modal/ConfigButtons.svelte';
	import { updateObj, getName } from '$lib/Utils';
	import {
		isCuratedVictronEntity,
		parseVictronEntity,
		getVictronGroupShortcode,
		getVictronDefaultIconForEntity
	} from '$lib/Constants/VictronMetrics';

	export let isOpen: boolean;
	export let sel: any;
	export let demo: string | undefined = undefined;
	export let sectionName: string | undefined = undefined;

	if (demo) {
		$history.splice($historyIndex, 1);
		set('entity_id', demo);
	}

	$: entity_id = sel?.entity_id;
	let name = sel?.name;
	let icon = sel?.icon;
	let computedIcon: string;

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

	onDestroy(() => $record());

	/**
	 * Curated entity list — grouped by Victron device-type for readability.
	 * Adds a `hint` showing the metric label so the dropdown looks like:
	 *
	 *   sensor.victron_mqtt_xxx_solarcharger_274_solarcharger_yield_power
	 *       Yield power (PV yield power)
	 */
	/**
	 * Build the picker options. We list every entity that the parser recognizes
	 * as coming from victron_mqtt (native or vendor naming convention) — there's
	 * no hardcoded "good metrics" list, the user can pick anything.
	 *
	 * Label format:  `[<shortcode> <inst>] <suffix or friendly metric name>`
	 *   e.g.  `[MPPT 274] Yield power`
	 *         `[MPPT 150/35 288] PV yield power`
	 *         `[SmartShunt 289] Power`
	 *         `[JK-BMS 512] Battery charge`
	 *
	 * The "metric label" prefers HA's friendly_name (richer, localized) but
	 * strips the device name prefix to avoid redundancy with the bracketed
	 * shortcode — e.g. "MPPT 150/35 PV yield power" → "PV yield power".
	 */
	function metricLabelFor(entityId: string): string {
		const info = parseVictronEntity(entityId);
		const friendly = $states?.[entityId]?.attributes?.friendly_name;
		if (friendly && typeof friendly === 'string') {
			// drop any redundant device-name prefix
			return friendly.replace(/^[A-Za-z0-9_\- /.]+\(ID:\s*\d+\)\s+/i, '').trim() || friendly;
		}
		if (!info) return entityId;
		// fall back: title-case suffix
		return info.suffix
			.replace(/_/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	/** Convert one entity_id into the dropdown { id, label, hint } shape. */
	function toOption(entityId: string) {
		const info = parseVictronEntity(entityId);
		const short = info ? getVictronGroupShortcode(info.group) : '';
		const inst = info?.inst || '';
		const friendly = $states?.[entityId]?.attributes?.friendly_name;
		return {
			id: entityId,
			label: info
				? `[${short}${inst ? ' ' + inst : ''}] ${metricLabelFor(entityId)}`
				: entityId,
			hint: friendly || entityId
		};
	}

	/** All Victron entities (any device), as picker options. */
	$: allVictronOptions = $entityList('sensor')
		.filter((opt: any) => isCuratedVictronEntity(opt.id))
		.map((opt: any) => toOption(opt.id))
		.sort((a: any, b: any) => a.label.localeCompare(b.label));

	$: showAll = sel?.show_all_entities === true;

	/**
	 * Build the list of unique Victron devices visible in HA (one entry per
	 * physical unit) so the user can pick a device first and then have the
	 * primary / secondary metric pickers automatically narrow down to it.
	 *
	 * Each entry's `id` is `<group>:<inst>` (e.g. `solarcharger:274`,
	 * `smartshunt_500a_50mv:289`); the `label` is the user-friendly short
	 * code + instance, e.g. `MPPT 274`, `SmartShunt 289`.
	 */
	$: deviceOptions = (() => {
		const seen = new Map<string, { id: string; label: string; hint: string }>();
		for (const opt of allVictronOptions) {
			const info = parseVictronEntity(opt.id);
			if (!info) continue;
			const key = `${info.group}:${info.inst}`;
			if (!seen.has(key)) {
				const short = getVictronGroupShortcode(info.group);
				seen.set(key, {
					id: key,
					label: `${short}${info.inst ? ' ' + info.inst : ''}`,
					hint: info.group
				});
			}
		}
		return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
	})();

	/**
	 * The device the user wants to scope the picker to. Source priority:
	 *   1. explicit `sel.device` set via the new "Zařízení" picker
	 *   2. derived from the primary `sel.entity_id`
	 *   3. null  → no scoping (show all Victron entities)
	 */
	$: primaryInfo = sel?.entity_id ? parseVictronEntity(sel.entity_id) : null;
	$: selectedDeviceKey =
		sel?.device || (primaryInfo ? `${primaryInfo.group}:${primaryInfo.inst}` : null);

	/**
	 * Options offered for the PRIMARY metric picker: every Victron entity
	 * unless a device is explicitly chosen — in which case we narrow it.
	 */
	$: primaryOptions = (() => {
		if (showAll) return $entityList('');
		if (!selectedDeviceKey) return allVictronOptions;
		return allVictronOptions.filter((opt: any) => {
			const info = parseVictronEntity(opt.id);
			return info && `${info.group}:${info.inst}` === selectedDeviceKey;
		});
	})();

	/**
	 * Options offered for the SECONDARY pickers: same scoping as primary.
	 * (When the user changes the device picker, primary may not yet be set;
	 * we still narrow secondaries so the device choice has a single source
	 * of truth.)
	 */
	$: secondaryOptions = primaryOptions;

	/**
	 * For each picker we still need to keep its currently-selected entity in
	 * the list even when the filter would exclude it. Otherwise the entity
	 * silently disappears on dialog reopen.
	 */
	function withCurrent(options: any[], currentId: string | undefined) {
		if (!currentId || options.some((o: any) => o.id === currentId)) return options;
		const all = $entityList('');
		const found = all.find((o: any) => o.id === currentId);
		return found ? [...options, found] : options;
	}

	$: primaryOptionsFull = withCurrent(primaryOptions, sel?.entity_id);
	$: secondary1OptionsFull = withCurrent(secondaryOptions, sel?.secondary_1);
	$: secondary2OptionsFull = withCurrent(secondaryOptions, sel?.secondary_2);

	/**
	 * Called when the user picks (or clears) a device in the top-level picker.
	 * Clears any primary/secondary entity that doesn't belong to the new device.
	 */
	function handleDeviceChange(newKey: string | null | undefined) {
		const matches = (eid: string | undefined): boolean => {
			if (!eid) return true;
			const info = parseVictronEntity(eid);
			return !!info && `${info.group}:${info.inst}` === newKey;
		};
		if (!matches(sel?.entity_id)) {
			delete (sel as any).entity_id;
		}
		if (!matches(sel?.secondary_1)) {
			delete (sel as any).secondary_1;
			delete (sel as any).secondary_1_label;
		}
		if (!matches(sel?.secondary_2)) {
			delete (sel as any).secondary_2;
			delete (sel as any).secondary_2_label;
		}
		setField('device', newKey || undefined);
	}
</script>

{#if isOpen}
	<Modal>
		<h1 slot="title">{$lang('victron_button')}</h1>

		<h2>{$lang('preview')}</h2>

		<div style:pointer-events="none">
			<VictronButton {sel} {sectionName} />
		</div>

		<!-- ─── Device filter ─── -->
		<h2>{$lang('device')}</h2>

		<div style="display: flex; gap: 0.8rem;">
			<div class="full-width">
				<Select
					options={deviceOptions}
					placeholder={$lang('all_devices')}
					value={selectedDeviceKey}
					on:change={(event) => handleDeviceChange(event?.detail)}
				/>
			</div>
		</div>

		<!-- ─── Primary entity ─── -->
		<h2>{$lang('primary_metric')}</h2>

		<div style="display: flex; gap: 0.8rem;">
			<div class="full-width">
				<Select
					options={primaryOptionsFull}
					placeholder={$lang('entity')}
					value={entity_id}
					on:change={(event) => {
						if (event?.detail === null) return;
						set('entity_id', event);
					}}
					computeIcons={true}
					getIconString={true}
					on:iconString={(event) => {
						computedIcon = event?.detail;
					}}
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
						<span style="opacity:0.6;">({allVictronOptions.length})</span>
					{/if}
				</label>
			</div>
		</div>

		<!-- ─── Secondary 1 ─── -->
		<h2>{$lang('secondary_metric_1')}</h2>

		<div style="display: flex; gap: 0.8rem;">
			<div class="full-width">
				<Select
					options={secondary1OptionsFull}
					placeholder={primaryInfo
						? `${getVictronGroupShortcode(primaryInfo.group)}${primaryInfo.inst ? ' ' + primaryInfo.inst : ''} — ${$lang('none')}`
						: $lang('none')}
					value={sel?.secondary_1}
					on:change={(event) => {
						if (event?.detail === null) {
							setField('secondary_1', undefined);
							setField('secondary_1_label', undefined);
						} else {
							setField('secondary_1', event.detail);
						}
					}}
				/>
				<div class="icon-gallery-container" style="margin-top: 0.5rem;">
					<InputClear
						condition={sel?.secondary_1_label}
						on:clear={() => setField('secondary_1_label', undefined)}
						let:padding
					>
						<input
							class="input"
							type="text"
							placeholder={$lang('label')}
							autocomplete="off"
							spellcheck="false"
							value={sel?.secondary_1_label || ''}
							on:input={(e) => setField('secondary_1_label', e.currentTarget.value)}
							style:padding
						/>
					</InputClear>
				</div>
			</div>
		</div>

		<!-- ─── Secondary 2 ─── -->
		<h2>{$lang('secondary_metric_2')}</h2>

		<div style="display: flex; gap: 0.8rem;">
			<div class="full-width">
				<Select
					options={secondary2OptionsFull}
					placeholder={primaryInfo
						? `${getVictronGroupShortcode(primaryInfo.group)}${primaryInfo.inst ? ' ' + primaryInfo.inst : ''} — ${$lang('none')}`
						: $lang('none')}
					value={sel?.secondary_2}
					on:change={(event) => {
						if (event?.detail === null) {
							setField('secondary_2', undefined);
							setField('secondary_2_label', undefined);
						} else {
							setField('secondary_2', event.detail);
						}
					}}
				/>
				<div class="icon-gallery-container" style="margin-top: 0.5rem;">
					<InputClear
						condition={sel?.secondary_2_label}
						on:clear={() => setField('secondary_2_label', undefined)}
						let:padding
					>
						<input
							class="input"
							type="text"
							placeholder={$lang('label')}
							autocomplete="off"
							spellcheck="false"
							value={sel?.secondary_2_label || ''}
							on:input={(e) => setField('secondary_2_label', e.currentTarget.value)}
							style:padding
						/>
					</InputClear>
				</div>
			</div>
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
					placeholder={getName(sel, (entity_id && $states[entity_id]) || undefined) ||
						$lang('name')}
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
					placeholder={(entity_id && getVictronDefaultIconForEntity(entity_id)) ||
						computedIcon ||
						$lang('icon')}
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

		<ConfigButtons {sel} />
	</Modal>
{/if}

<style>
	.full-width {
		width: -webkit-fill-available;
		width: -moz-available;
	}
</style>
