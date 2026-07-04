import {
	AlertCircleIcon,
	BrowserIcon,
	Cards01Icon,
	ChartIcon,
	Cursor02Icon,
	FileAddIcon,
	FileEmpty01Icon,
	Image01Icon,
	InputTextIcon,
	LayoutGridIcon,
	Link01Icon,
	Loading03Icon,
	Notification01Icon,
	Route01Icon,
	ScreenAddToHomeIcon,
	StructureFolderIcon,
	TableIcon,
	TextIcon
} from '@hugeicons/core-free-icons';
import { DEFAULT_PAGE_ICON_KEY } from './pages';

export const PAGE_ICON_MAP = {
	AlertCircleIcon,
	BrowserIcon,
	Cards01Icon,
	ChartIcon,
	Cursor02Icon,
	FileAddIcon,
	FileEmpty01Icon,
	Image01Icon,
	InputTextIcon,
	LayoutGridIcon,
	Link01Icon,
	Loading03Icon,
	Notification01Icon,
	Route01Icon,
	ScreenAddToHomeIcon,
	StructureFolderIcon,
	TableIcon,
	TextIcon
};

export const PAGE_ICON_CATEGORIES = [
	{
		label: 'Page/file',
		options: [
			{ key: 'FileEmpty01Icon', label: 'Empty page' },
			{ key: 'FileAddIcon', label: 'Add page' },
			{ key: 'StructureFolderIcon', label: 'Folder' }
		]
	},
	{
		label: 'Navigation',
		options: [
			{ key: 'BrowserIcon', label: 'Browser' },
			{ key: 'ScreenAddToHomeIcon', label: 'Home screen' },
			{ key: 'Route01Icon', label: 'Route' }
		]
	},
	{
		label: 'Inputs/actions',
		options: [
			{ key: 'TextIcon', label: 'Text' },
			{ key: 'Cursor02Icon', label: 'Cursor' },
			{ key: 'InputTextIcon', label: 'Text input' },
			{ key: 'Link01Icon', label: 'Link' }
		]
	},
	{
		label: 'Display/data',
		options: [
			{ key: 'TableIcon', label: 'Table' },
			{ key: 'ChartIcon', label: 'Chart' },
			{ key: 'Image01Icon', label: 'Image' }
		]
	},
	{
		label: 'Feedback/system',
		options: [
			{ key: 'AlertCircleIcon', label: 'Alert' },
			{ key: 'Notification01Icon', label: 'Notification' },
			{ key: 'Loading03Icon', label: 'Loading' }
		]
	},
	{
		label: 'Containers',
		options: [
			{ key: 'LayoutGridIcon', label: 'Layout grid' },
			{ key: 'Cards01Icon', label: 'Cards' }
		]
	}
] as const;

export type PageIconKey = keyof typeof PAGE_ICON_MAP;

export function getPageIcon(iconKey: string) {
	return PAGE_ICON_MAP[iconKey as PageIconKey] ?? PAGE_ICON_MAP[DEFAULT_PAGE_ICON_KEY];
}
