# Excalidraw Agent Design Tools

A Claude Code skill that teaches an agent to produce consistent, readable system design diagrams in Excalidraw.

## Contents

```
excalidraw-system-design/
├── SKILL.md                  # the process the agent follows
└── references/
    └── guidelines.md         # the visual and structural design system (source of truth)
```

`SKILL.md` defines *how* to work: identify the diagram intent, plan the architecture, plan the layout, render, then review. `references/guidelines.md` defines *what the result should look like*: default flow direction per diagram type, lifecycle outline colours, dashed service boundaries and labels, connector preference order, flowchart conventions, and spacing rules.

## Install

Skills are loaded from `~/.claude/skills` (personal) or `.claude/skills` (per project).

Symlink so the installed skill tracks this repo:

```bash
ln -s "$PWD/excalidraw-system-design" ~/.claude/skills/excalidraw-system-design
```

Or copy it:

```bash
cp -R excalidraw-system-design ~/.claude/skills/
```

Then run `/excalidraw-system-design` in Claude Code, or just ask for an Excalidraw architecture diagram and the skill triggers on its own.

## Use

The skill pairs with whatever Excalidraw tooling the agent has available, such as an Excalidraw MCP server. It is tool-agnostic: it governs planning and visual conventions, not the drawing API.

```
Draw an Excalidraw diagram of the order-processing backend:
API gateway -> order service -> payment service, with a retry queue.
Payment service is new, order service is changing.
```

## Conventions at a glance

| Component status | Outline colour |
|---|---|
| Existing and unchanged | Black |
| Existing and changing | Blue |
| New or greenfield | Green |
| To be removed | Red |

- Components are outline-only, never filled.
- Services get a dashed boundary at ~60% opacity, with a larger label above its top-left corner.
- One-way arrows by default; bidirectional communication uses two separate arrows.
- Straight arrow > single-bend elbow > more complex routing. Curves are a last resort.
- Decisions are diamonds; end nodes are black-filled ellipses with white text.

When rules conflict: semantic correctness, then readability, then information hierarchy, then consistency, then aesthetics.
