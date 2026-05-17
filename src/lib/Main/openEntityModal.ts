/**
 * Domain-based modal dispatcher for entity tiles.
 *
 * Given an entity_id, opens the right modal (LightModal for lights with a
 * brightness/color picker, SwitchModal for switches, SensorModal for plain
 * read-only sensors, ...). Used by Button.svelte for the whole-tile click,
 * and by GridButton.svelte for individual cell clicks.
 *
 * The function is async because each modal is dynamically imported on demand
 * — keeps the initial bundle small.
 */
import { openModal } from 'svelte-modals';
import { getDomain } from '$lib/Utils';

export async function openEntityModal(sel: { id?: any; entity_id?: string }, extras: any = {}) {
	const domain = getDomain(sel?.entity_id);

	const open = (loader: () => Promise<any>, props: any) => openModal(loader, props);

	switch (domain) {
		case 'light':
			return open(() => import('$lib/Modal/LightModal.svelte'), { sel, ...extras });

		case 'input_boolean':
		case 'remote':
		case 'siren':
		case 'switch':
			return open(() => import('$lib/Modal/SwitchModal.svelte'), { sel, ...extras });

		case 'script':
			return open(() => import('$lib/Modal/ScriptModal.svelte'), { sel, ...extras });

		case 'automation':
			return open(() => import('$lib/Modal/AutomationModal.svelte'), { sel, ...extras });

		case 'calendar':
			return open(() => import('$lib/Modal/CalendarModal.svelte'), { sel, ...extras });

		case 'sensor':
		case 'binary_sensor':
			// rich read-only details modal: grouped attributes + 24h graph
			return open(() => import('$lib/Modal/SensorDetailsModal.svelte'), { sel, ...extras });

		case 'air_quality':
		case 'date':
		case 'time':
		case 'event':
		case 'image_processing':
		case 'mailbox':
		case 'stt':
		case 'weather':
		case 'button':
		case 'scene':
		case 'schedule':
		case 'sun':
		case 'person':
		case 'zone':
		case 'input_button':
			return open(() => import('$lib/Modal/SensorModal.svelte'), { sel, ...extras });

		case 'update':
			return open(() => import('$lib/Modal/UpdateModal.svelte'), { sel, ...extras });

		case 'input_number':
		case 'number':
			return open(() => import('$lib/Modal/InputNumberModal.svelte'), { sel, ...extras });

		case 'input_datetime':
		case 'datetime':
			return open(() => import('$lib/Modal/InputDateModal.svelte'), { sel, ...extras });

		case 'input_select':
		case 'select':
			return open(() => import('$lib/Modal/InputSelectModal.svelte'), { sel, ...extras });

		case 'input_text':
		case 'text':
			return open(() => import('$lib/Modal/InputTextModal.svelte'), { sel, ...extras });

		case 'timer':
			return open(() => import('$lib/Modal/TimerModal.svelte'), { sel, ...extras });
		case 'vacuum':
			return open(() => import('$lib/Modal/VacuumModal.svelte'), { sel, ...extras });
		case 'lawn_mower':
			return open(() => import('$lib/Modal/LawnMowerModal.svelte'), { sel, ...extras });
		case 'valve':
			return open(() => import('$lib/Modal/ValveModal.svelte'), { sel, ...extras });
		case 'image':
			return open(() => import('$lib/Modal/ImageModal.svelte'), { sel, ...extras });
		case 'todo':
			return open(() => import('$lib/Modal/TodoModal.svelte'), { sel, ...extras });
		case 'counter':
			return open(() => import('$lib/Modal/CounterModal.svelte'), { sel, ...extras });
		case 'alarm_control_panel':
			return open(() => import('$lib/Modal/AlarmControlPanelModal.svelte'), { sel, ...extras });
		case 'lock':
			return open(() => import('$lib/Modal/LockModal.svelte'), { sel, ...extras });
		case 'climate':
			return open(() => import('$lib/Modal/ClimateModal.svelte'), { sel, ...extras });
		case 'camera':
			return open(() => import('$lib/Modal/CameraModal.svelte'), { sel, ...extras });
		case 'water_heater':
			return open(() => import('$lib/Modal/WaterHeaterModal.svelte'), { sel, ...extras });
		case 'humidifier':
			return open(() => import('$lib/Modal/HumidifierModal.svelte'), { sel, ...extras });
		case 'media_player':
			return open(() => import('$lib/Modal/MediaPlayer.svelte'), { selected: sel, ...extras });
		case 'group':
			return open(() => import('$lib/Modal/GroupModal.svelte'), { sel, ...extras });
		case 'device_tracker':
			// no GPS info → just show as sensor
			return open(() => import('$lib/Modal/SensorModal.svelte'), { sel, ...extras });
		case 'cover':
			return open(() => import('$lib/Modal/CoverModal.svelte'), { selected: sel, ...extras });
		case 'fan':
			return open(() => import('$lib/Modal/FanModal.svelte'), { selected: sel, ...extras });
		default:
			return open(() => import('$lib/Modal/Unknown.svelte'), { selected: sel, ...extras });
	}
}
