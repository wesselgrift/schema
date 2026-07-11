# Schema

A canvas for mapping product information architecture and turning it into developer-ready specs.

Draw pages, services, APIs, and flows on an infinite canvas, then export a structured ZIP package with an LLM-generated README, implementation plan, and checklist.

## Features

- **Canvas editing** — Place typed items (pages, forms, APIs, databases, jobs, etc.), group them in sections, and connect flows between nodes.
- **Markdown notes** — Add descriptions to items with a live-preview markdown editor.
- **Local persistence** — Canvases are saved in the browser. Create and switch between multiple projects.
- **Share** — Copy a compressed URL to share a canvas (falls back to export for large canvases).
- **Spec export** — Generate a ZIP with per-item markdown files, a project README, `implementation-plan.md`, and `todo.md` using your choice of LLM provider.

## Stack

- [Svelte 5](https://svelte.dev) + [Vite](https://vitejs.dev)
- [@xyflow/svelte](https://svelteflow.dev) for the canvas
- [shadcn-svelte](https://shadcn-svelte.com) + Tailwind CSS v4
- [CodeMirror](https://codemirror.net) for markdown editing

## Getting started

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run check` | Type-check with svelte-check |
| `npm run test` | Run tests |

## Spec export

Click **Export** in the top-right corner. Choose an LLM provider (OpenAI, Anthropic, Gemini, or Mistral), enter an API key, and generate the package.

API keys can optionally be remembered in `localStorage` on your device — they are never sent anywhere except the provider you select.

The exported ZIP includes:

- `README.md` — project introduction and IA overview
- `implementation-plan.md` — phased build plan
- `todo.md` — ordered implementation checklist
- Per-item spec files organized by type (pages, architecture, communications, etc.)

## Project structure

```
src/
  lib/canvas/     Canvas UI, persistence, export, and sharing
  lib/llm/        LLM provider config and generation
  lib/components/ shadcn-svelte UI components
```
