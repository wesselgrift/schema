import { RangeSetBuilder, type EditorState } from '@codemirror/state';
import {
	HighlightStyle,
	syntaxHighlighting,
	syntaxTree
} from '@codemirror/language';
import {
	Decoration,
	EditorView,
	ViewPlugin,
	WidgetType,
	type DecorationSet,
	type ViewUpdate
} from '@codemirror/view';
import { tags } from '@lezer/highlight';

/**
 * Text styling for markdown nodes. The lezer/markdown grammar already tags every
 * node (headings, strong, emphasis, code, links, quotes), so a HighlightStyle is
 * the robust way to size/weight/colour the rendered text. Marker concealment and
 * checkboxes are handled separately by the decoration plugin below.
 *
 * Colours are bound to the app's Tailwind CSS variables so light/dark mode match.
 */
const markdownHighlightStyle = HighlightStyle.define([
	{ tag: tags.heading1, fontSize: '1.6em', fontWeight: '700', lineHeight: '1.3' },
	{ tag: tags.heading2, fontSize: '1.4em', fontWeight: '700', lineHeight: '1.3' },
	{ tag: tags.heading3, fontSize: '1.2em', fontWeight: '600', lineHeight: '1.35' },
	{ tag: tags.heading4, fontSize: '1.05em', fontWeight: '600' },
	{ tag: tags.heading5, fontSize: '1em', fontWeight: '600' },
	{ tag: tags.heading6, fontSize: '0.9em', fontWeight: '600', color: 'var(--muted-foreground)' },
	{ tag: tags.strong, fontWeight: '700' },
	{ tag: tags.emphasis, fontStyle: 'italic' },
	{ tag: tags.strikethrough, textDecoration: 'line-through' },
	{ tag: tags.link, color: 'var(--primary)', textDecoration: 'underline' },
	{ tag: tags.url, color: 'var(--muted-foreground)' },
	{
		tag: tags.monospace,
		fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)'
	},
	{ tag: tags.quote, color: 'var(--muted-foreground)', fontStyle: 'italic' },
	{ tag: tags.processingInstruction, color: 'var(--muted-foreground)' }
]);

/** Inline mark nodes whose syntax characters are concealed off the active line. */
const HIDEABLE_MARKS = new Set([
	'HeaderMark',
	'EmphasisMark',
	'CodeMark',
	'QuoteMark',
	'LinkMark',
	'URL'
]);

class CheckboxWidget extends WidgetType {
	constructor(
		private readonly checked: boolean,
		private readonly pos: number
	) {
		super();
	}

	eq(other: CheckboxWidget) {
		return other.checked === this.checked && other.pos === this.pos;
	}

	toDOM(view: EditorView) {
		const wrap = document.createElement('span');
		wrap.className = 'cm-md-task';

		const box = document.createElement('input');
		box.type = 'checkbox';
		box.checked = this.checked;
		box.className = 'cm-md-checkbox';
		// Drive the toggle ourselves so the doc stays the single source of truth
		// (prevents a double-toggle between the native checkbox and the rebuild).
		box.addEventListener('mousedown', (event) => {
			event.preventDefault();
			const current = view.state.doc.sliceString(this.pos + 1, this.pos + 2);
			view.dispatch({
				changes: {
					from: this.pos + 1,
					to: this.pos + 2,
					insert: current === ' ' ? 'x' : ' '
				}
			});
		});

		wrap.appendChild(box);
		return wrap;
	}

	ignoreEvent() {
		return false;
	}
}

function getActiveLines(state: EditorState): Set<number> {
	const lines = new Set<number>();
	for (const range of state.selection.ranges) {
		const first = state.doc.lineAt(range.from).number;
		const last = state.doc.lineAt(range.to).number;
		for (let line = first; line <= last; line += 1) lines.add(line);
	}
	return lines;
}

function collectTaskLines(view: EditorView): Set<number> {
	const taskLines = new Set<number>();
	for (const { from, to } of view.visibleRanges) {
		syntaxTree(view.state).iterate({
			from,
			to,
			enter: (node) => {
				if (node.name === 'TaskMarker') {
					taskLines.add(view.state.doc.lineAt(node.from).number);
				}
			}
		});
	}
	return taskLines;
}

type PendingDecoration = { from: number; to: number; deco: Decoration };

function buildDecorations(view: EditorView): DecorationSet {
	const { state } = view;
	const doc = state.doc;
	const focused = view.hasFocus;
	const activeLines = getActiveLines(state);
	const taskLines = collectTaskLines(view);
	const pending: PendingDecoration[] = [];

	function extendOverSpaces(to: number): number {
		let end = to;
		while (end < doc.length && doc.sliceString(end, end + 1) === ' ') end += 1;
		return end;
	}

	for (const { from, to } of view.visibleRanges) {
		syntaxTree(state).iterate({
			from,
			to,
			enter: (node) => {
				const name = node.type.name;

				if (name === 'TaskMarker') {
					const checked = doc.sliceString(node.from + 1, node.from + 2) !== ' ';
					pending.push({
						from: node.from,
						to: node.to,
						deco: Decoration.replace({ widget: new CheckboxWidget(checked, node.from) })
					});
					return;
				}

				// The list bullet on a task line is superseded by the checkbox widget.
				if (name === 'ListMark' && taskLines.has(doc.lineAt(node.from).number)) {
					pending.push({
						from: node.from,
						to: extendOverSpaces(node.to),
						deco: Decoration.replace({})
					});
					return;
				}

				if (HIDEABLE_MARKS.has(name)) {
					const lineNumber = doc.lineAt(node.from).number;
					const revealed = focused && activeLines.has(lineNumber);
					if (revealed) return;

					const end = name === 'HeaderMark' ? extendOverSpaces(node.to) : node.to;
					if (end > node.from) {
						pending.push({ from: node.from, to: end, deco: Decoration.replace({}) });
					}
				}
			}
		});
	}

	pending.sort((a, b) => a.from - b.from || a.to - b.to);

	const builder = new RangeSetBuilder<Decoration>();
	let lastTo = -1;
	for (const item of pending) {
		// Guard against overlapping ranges (e.g. adjacent marks) which would throw.
		if (item.from < lastTo) continue;
		builder.add(item.from, item.to, item.deco);
		lastTo = item.to;
	}
	return builder.finish();
}

const liveDecorationPlugin = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet;

		constructor(view: EditorView) {
			this.decorations = buildDecorations(view);
		}

		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.selectionSet ||
				update.viewportChanged ||
				update.focusChanged
			) {
				this.decorations = buildDecorations(update.view);
			}
		}
	},
	{
		decorations: (plugin) => plugin.decorations,
		// Treat concealed markers as atomic so caret navigation skips over them
		// cleanly instead of landing inside hidden syntax.
		provide: (plugin) =>
			EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none)
	}
);

/** Obsidian-style live preview: styled text, markers concealed off the active line. */
export function markdownLivePreview() {
	return [syntaxHighlighting(markdownHighlightStyle), liveDecorationPlugin];
}
