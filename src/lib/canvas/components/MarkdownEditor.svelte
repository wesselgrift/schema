<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { EditorState } from '@codemirror/state';
	import { EditorView, keymap } from '@codemirror/view';
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
	import { markdownLivePreview } from '../markdown/live-preview';

	interface Props {
		value: string;
		oninput: (value: string) => void;
		autofocus?: boolean;
		ariaLabel?: string;
		class?: string;
	}

	let { value, oninput, autofocus = false, ariaLabel, class: className }: Props = $props();

	let view: EditorView | undefined;

	const theme = EditorView.theme({
		'&': {
			flex: '1 1 0',
			minHeight: '0',
			color: 'var(--foreground)',
			backgroundColor: 'transparent',
			fontSize: '0.9rem'
		},
		'&.cm-focused': { outline: 'none' },
		'.cm-scroller': {
			fontFamily: 'inherit',
			lineHeight: '1.6',
			overflow: 'auto'
		},
		'.cm-content': {
			padding: '0',
			caretColor: 'var(--foreground)'
		},
		'.cm-line': { padding: '0' },
		'.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--foreground)' },
		'&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
			backgroundColor: 'color-mix(in oklch, var(--primary) 22%, transparent)'
		},
		'.cm-md-task': {
			display: 'inline-flex',
			alignItems: 'center',
			verticalAlign: 'middle'
		},
		'.cm-md-checkbox': {
			width: '1rem',
			height: '1rem',
			margin: '0 0.4rem 0 0',
			cursor: 'pointer',
			accentColor: 'var(--primary)'
		}
	});

	function editor(): Attachment<HTMLDivElement> {
		return (element) => {
			const initialDoc = untrack(() => value);
			const shouldFocus = untrack(() => autofocus);

			const state = EditorState.create({
				doc: initialDoc,
				extensions: [
					history(),
					keymap.of([...markdownKeymap, ...historyKeymap, ...defaultKeymap]),
					markdown({ base: markdownLanguage }),
					EditorView.lineWrapping,
					theme,
					markdownLivePreview(),
					EditorView.updateListener.of((update) => {
						if (update.docChanged) {
							oninput(update.state.doc.toString());
						}
					})
				]
			});

			const nextView = new EditorView({ state, parent: element });
			view = nextView;

			if (ariaLabel) {
				nextView.contentDOM.setAttribute('aria-label', ariaLabel);
			}

			if (shouldFocus) {
				nextView.focus();
			}

			return () => {
				nextView.destroy();
				if (view === nextView) view = undefined;
			};
		};
	}

	$effect(() => {
		const next = value;
		if (!view) return;

		const current = view.state.doc.toString();
		if (next !== current) {
			view.dispatch({ changes: { from: 0, to: current.length, insert: next } });
		}
	});
</script>

<div {@attach editor()} class={['flex flex-col', className]}></div>
