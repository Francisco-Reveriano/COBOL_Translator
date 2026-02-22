# Frontend — COBOL-to-Python Migration UI

React 18 + TypeScript + Vite frontend for the COBOL-to-Python Migration Platform.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Opens at http://localhost:5173. API calls proxy to the backend at `localhost:8000`.

## Production Build

```bash
npm run build
```

Output goes to `dist/`.

## Stack

- **React 18** with TypeScript
- **Vite** for dev server and bundling
- **Tailwind CSS v4** for styling
- **@xyflow/react** (React Flow v12) for dependency graphs
- **@monaco-editor/react** for code preview and diff view
- **lucide-react** for icons
- **@dagrejs/dagre** for automatic graph layout

## Components

| Component | Description |
|-----------|-------------|
| `TopBar` | Logo and theme toggle |
| `StepTimeline` | Vertical 6-phase pipeline status |
| `StreamingPanel` | Real-time agent activity with typewriter effect |
| `PlanChecklist` | TodoWrite-style plan tracking with score badges |
| `ScoreDashboard` | 4-dimension quality scores with animations |
| `DependencyGraph` | Interactive React Flow graph with custom nodes |
| `PipelineFlowchart` | Horizontal phase pipeline visualization |
| `CodePreview` | Monaco editor with file browser |
| `DiffView` | Side-by-side COBOL vs Python comparison |
| `FileUpload` | Drag-and-drop COBOL file upload |
| `SteeringBar` | Pause/Resume/Skip/Retry controls |
| `ProgressBar` | Bottom progress indicator |
| `ResumePrompt` | Interrupted conversion resume dialog |

## Theming

Dark/light mode via CSS custom properties. Toggle with the button in the top bar or via system `prefers-color-scheme`. Theme persists to `localStorage`.
