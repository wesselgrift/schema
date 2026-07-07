import {
	BrowserIcon,
	CloudIcon,
	DashboardSquare01Icon,
	Database01Icon,
	InputTextIcon,
	Mail01Icon,
	Notification01Icon,
	Route01Icon,
	ServerStack01Icon,
	SquareLock02Icon,
	TableIcon,
	WebhookIcon,
	WorkflowSquare01Icon
} from '@hugeicons/core-free-icons';

export const ITEM_TYPES = [
	{ type: 'page', label: 'Page', iconKey: 'BrowserIcon' },
	{ type: 'form', label: 'Form', iconKey: 'InputTextIcon' },
	{ type: 'list', label: 'List / Table', iconKey: 'TableIcon' },
	{ type: 'dashboard', label: 'Dashboard', iconKey: 'DashboardSquare01Icon' },
	{ type: 'email', label: 'Email', iconKey: 'Mail01Icon' },
	{ type: 'notification', label: 'Notification', iconKey: 'Notification01Icon' },
	{ type: 'backend', label: 'Backend service', iconKey: 'ServerStack01Icon' },
	{ type: 'api', label: 'API endpoint', iconKey: 'Route01Icon' },
	{ type: 'database', label: 'Database', iconKey: 'Database01Icon' },
	{ type: 'job', label: 'Background job', iconKey: 'WorkflowSquare01Icon' },
	{ type: 'auth', label: 'Auth / access', iconKey: 'SquareLock02Icon' },
	{ type: 'integration', label: 'External service', iconKey: 'CloudIcon' },
	{ type: 'webhook', label: 'Webhook', iconKey: 'WebhookIcon' }
] as const;

export type ItemType = (typeof ITEM_TYPES)[number]['type'];

export const DEFAULT_ITEM_TYPE: ItemType = 'page';

const ITEM_TYPE_ICON_MAP = {
	BrowserIcon,
	InputTextIcon,
	TableIcon,
	DashboardSquare01Icon,
	Mail01Icon,
	Notification01Icon,
	ServerStack01Icon,
	Route01Icon,
	Database01Icon,
	WorkflowSquare01Icon,
	SquareLock02Icon,
	CloudIcon,
	WebhookIcon
};

const ITEM_TYPE_BY_KEY = new Map(ITEM_TYPES.map((entry) => [entry.type, entry]));

export function getItemTypeIcon(type: string) {
	const entry = ITEM_TYPE_BY_KEY.get(type as ItemType);
	const iconKey = (entry ?? ITEM_TYPE_BY_KEY.get(DEFAULT_ITEM_TYPE)!).iconKey;

	return ITEM_TYPE_ICON_MAP[iconKey];
}

export function getItemTypeLabel(type: string): string {
	const entry = ITEM_TYPE_BY_KEY.get(type as ItemType);

	return (entry ?? ITEM_TYPE_BY_KEY.get(DEFAULT_ITEM_TYPE)!).label;
}
