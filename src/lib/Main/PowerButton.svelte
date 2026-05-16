<!--
  PowerButton — pure pass-through to Button.

  Why a wrapper at all? So that `Content.svelte` can dispatch on
  `type: 'power_button'` and so MainItemConfig's picker can show a separate
  preview tile. The actual auto-power logic lives in Button.svelte and
  is keyed on `sel.type === 'power_button'` — keeping a single `sel`
  reference flowing through the entire chain so user edits in
  PowerButtonConfig persist into the `$dashboard` store.
-->
<script lang="ts">
	import Button from '$lib/Main/Button.svelte';

	export let demo: string | undefined = undefined;
	export let sel: any;
	export let sectionName: string | undefined = undefined;
</script>

<Button {sel} {demo} {sectionName} />
