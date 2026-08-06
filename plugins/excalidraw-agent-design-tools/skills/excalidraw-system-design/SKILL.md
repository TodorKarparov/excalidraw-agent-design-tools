---
name: excalidraw-system-design
description: Create or modify system design diagrams in Excalidraw - backend and UI architecture, backend processing or user flows, orchestrations, and migration or future-state diagrams. Use when the user asks to draw, diagram, or visualize an architecture in Excalidraw, to convert architecture notes into an Excalidraw diagram, or to edit an existing Excalidraw system diagram. Applies a fixed visual language (lifecycle outline colours, dashed service boundaries, connector preference order, flowchart shapes) defined in references/guidelines.md. Do not use for free-form whiteboarding or non-technical drawings.
---

# Excalidraw System Design Skill

## Purpose

Use this skill when creating or modifying system design diagrams in Excalidraw.

The skill defines the process the agent should follow. The visual and architectural rules themselves are maintained separately in:

`references/guidelines.md`

The guidelines are the source of truth. Do not duplicate or reinterpret them unless explicitly asked.

---

## When to Use

Apply this skill when the user asks to:

- Create a system design diagram
- Create a backend or UI architecture diagram
- Create a backend processing flow or UI flow
- Visualize an orchestration
- Illustrate a migration or future-state architecture
- Modify an existing Excalidraw system diagram
- Convert architecture notes into an Excalidraw diagram

Do not apply this skill to unrelated illustrations, free-form whiteboarding, or non-technical drawings.

---

## Required Inputs

Before rendering, determine as much of the following as possible from the request:

- Diagram intent
- Intended audience
- Main actors
- Services or logical groups
- Components
- Primary flow
- Secondary flows
- Decisions and branches
- External dependencies
- Component lifecycle status
- Important protocols, commands, events, or connector labels
- Expected terminal states
- Current-state, future-state, or mixed-state scope

Do not invent architectural details merely to make the diagram look complete.

When information is missing, prefer a minimal, clearly labelled assumption over unnecessary complexity.

---

## Workflow

### 1. Read the design guidelines

Read `references/guidelines.md` before planning or rendering the diagram.

Treat its rules as defaults.

Resolve conflicts using the priority order defined in the guidelines:

1. Semantic correctness
2. Readability
3. Clear information hierarchy
4. Consistency with the design system
5. Visual aesthetics

---

### 2. Identify the diagram intent

Classify the request before choosing a layout.

Examples:

- Backend processing flow
- Backend component architecture
- UI or user flow
- UI architecture
- Migration architecture
- Orchestration flow

Use the default direction associated with that diagram type unless another direction materially improves readability.

---

### 3. Produce an architecture plan

Before creating Excalidraw elements, create a concise internal plan containing:

- Actors
- Services or logical groups
- Components within each group
- Relationships
- Primary flow
- Decisions
- Terminal states
- Lifecycle status of each component
- Any assumptions

The plan should describe architecture and semantics, not drawing coordinates.

Do not render until the system structure is coherent.

---

### 4. Produce a layout plan

Translate the architecture plan into a spatial arrangement.

Decide:

- Overall flow direction
- Relative ordering of services
- Group boundaries
- Placement of external actors and dependencies
- Main connector routes
- Decision placement
- End-node placement
- Areas requiring additional whitespace

Favor a simple layout that exposes the primary story of the diagram.

Avoid optimizing for compactness at the expense of clarity.

---

### 5. Select visual assets

Use the provided icon library when an appropriate icon exists.

Rules for icons:

- Prefer one consistent icon family within a diagram.
- Use official or provided AWS icons for AWS services.
- Do not substitute a generic icon when an exact provided icon is available.
- Do not add icons purely for decoration.
- Keep labels visible even when an icon is used.
- Do not allow icon detail to overpower the architectural structure.

If no suitable icon exists, use a simple labelled component shape.

For AWS service cards, resolve `scripts/prepare-components.ts` relative to this skill and batch all component placements into one `generate` invocation. Use vertical layout by default; use horizontal layout only when explicitly useful or requested. Treat the AWS artwork as a decorative technology marker and the architectural title as independent free text inside the component box, never as a bound shape label. Do not move the artwork based on connector topology.

Use each returned `componentTargets` outer-box tempId for arrow bindings. When same-request bindings are needed, append the arrows to the returned `elements` list and add the complete list in one `edit_scene_content` request.

---

### 6. Render in Excalidraw

Create the Excalidraw elements according to the architecture plan, layout plan, and design guidelines.

During rendering:

- Apply lifecycle colours to component outlines.
- Keep component shapes unfilled unless a specific rule requires a fill.
- Group components by service or logical unit.
- Use the prescribed service boundary and label treatment.
- Follow the connector preference order.
- Represent bidirectional communication with two separate arrows.
- Structurally bind every semantic arrow at both ends (`startBinding`/`endBinding`; reciprocal shape `boundElements` in native `.excalidraw`). Use distinct anchors for parallel arrows; visual contact is insufficient.
- Use the prescribed flowchart shapes and terminal-node treatment.
- Preserve enough whitespace for manual refinement.

Do not introduce visual conventions that conflict with the guidelines.

---

### 7. Review the rendered result

After rendering, inspect the element structure and, when possible, the rendered canvas.

Check for:

- Missing components or relationships
- Incorrect arrow direction
- Incorrect lifecycle colours
- Unclear grouping
- Overlapping shapes
- Connectors passing through components or labels
- Excessive connector crossings
- Ambiguous decision branches
- Inconsistent spacing
- Labels that are unreadable at the intended zoom level
- A primary flow that is difficult to identify

Correct obvious issues before presenting the result.

Do not claim that the diagram is visually perfect when only the JSON structure has been inspected.

---

### 8. Present assumptions and exceptions

When architectural details were inferred, state the assumptions briefly.

When a design-system rule was intentionally broken, state:

- Which rule was changed
- Why the exception improved readability or correctness

Do not narrate routine compliance with every rule.

---

## Modification Workflow

When modifying an existing diagram:

1. Read the current Excalidraw scene.
2. Identify the existing visual language and architecture.
3. Read the design guidelines.
4. Preserve correct existing content.
5. Apply requested changes with the smallest coherent set of edits.
6. Avoid repositioning unrelated elements unless required for readability.
7. Recheck connectors, group boundaries, labels, and lifecycle colours.
8. Summarize meaningful architectural changes.

Do not redraw the entire diagram unless the current structure prevents a clear result.

---

## Output Expectations

A successful result should include:

- A valid Excalidraw diagram
- A coherent primary flow
- Correct service grouping
- Correct lifecycle styling
- Clear and directional connectors
- Readable decision branches
- Legible high-level service labels
- Minimal unsupported assumptions
- A brief summary of the architecture shown

The diagram should be structurally useful before the user performs a manual visual cleanup pass.

---

## Guiding Principle

The agent is responsible for architectural clarity and a strong first-pass layout.

The user remains responsible for final visual refinement.
