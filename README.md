# Excalidraw Agent Design Tools

A skills-only plugin for ChatGPT and Codex that teaches an agent to produce consistent, readable system-design diagrams in Excalidraw. The nested skill remains portable to Claude Code and other skill-aware agents.

## Contents

```text
.
├── .agents/plugins/marketplace.json
└── plugins/excalidraw-agent-design-tools/
    ├── .codex-plugin/plugin.json
    └── skills/excalidraw-system-design/
        ├── SKILL.md
        └── references/
            └── guidelines.md
```

`SKILL.md` defines *how* to work: identify the diagram intent, plan the architecture, plan the layout, render, then review. `references/guidelines.md` defines *what the result should look like*: default flow direction per diagram type, lifecycle outline colours, dashed service boundaries and labels, connector preference order, flowchart conventions, and spacing rules.

## Requirements

The plugin supplies planning and visual conventions. It does not bundle an Excalidraw drawing tool; the host still needs an Excalidraw MCP server or another capability that can create Excalidraw scenes.

## Install in Codex

Add this repository as a marketplace, then install the plugin:

```bash
codex plugin marketplace add TodorKarparov/excalidraw-agent-design-tools
codex plugin add excalidraw-agent-design-tools@excalidraw-design-tools
```

Start a new conversation and ask for an Excalidraw architecture diagram, or invoke `@excalidraw-system-design` explicitly.

## Install in ChatGPT Work

Local marketplace plugins are installed through the ChatGPT desktop app:

1. Add the marketplace using the Codex command above.
2. Open **Plugins** in ChatGPT Work or Codex.
3. Select the **Excalidraw Design Tools** marketplace.
4. Install **Excalidraw System Design** and start a new conversation.

The plugin can then be shared with members of the same ChatGPT workspace from its plugin details page.

## Install in Claude Code

Skills are loaded from `~/.claude/skills` (personal) or `.claude/skills` (per project).

Symlink so the installed skill tracks this repo:

```bash
ln -s "$PWD/plugins/excalidraw-agent-design-tools/skills/excalidraw-system-design" ~/.claude/skills/excalidraw-system-design
```

Or copy it:

```bash
cp -R plugins/excalidraw-agent-design-tools/skills/excalidraw-system-design ~/.claude/skills/
```

Then run `/excalidraw-system-design` in Claude Code, or just ask for an Excalidraw architecture diagram and let the skill trigger automatically.

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
