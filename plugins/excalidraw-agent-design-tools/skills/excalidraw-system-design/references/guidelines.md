# Excalidraw System Design Diagram Guidelines

## Purpose

This document defines the default visual and structural conventions for system design diagrams created in Excalidraw.

The goal is to make diagrams:

- Consistent across different system design exercises
- Easy to scan at both high and detailed zoom levels
- Clear enough to communicate architecture without unnecessary visual noise
- Flexible enough to prioritize readability when a default convention does not fit

These conventions are defaults, not absolute constraints.

> **Clarity over consistency. Consistency over aesthetics.**

A convention may be broken when doing so materially improves readability or better communicates the intended story.

---

## 1. Diagram Intent

Before drawing, identify the type of diagram and the story it needs to communicate.

Common diagram intents include:

- Backend processing flow
- Backend component architecture
- UI or user flow
- UI architecture
- Migration or future-state architecture
- Orchestration flow

The diagram intent should determine its default direction, grouping, information hierarchy, and level of detail.

---

## 2. Default Flow Direction

Direction should reinforce the story the diagram tells.

| Diagram type | Default direction |
|---|---|
| Backend processing flow | Top to bottom |
| Backend component architecture | Top to bottom |
| UI or user flow | Left to right |
| UI architecture | Left to right |

These directions should remain consistent unless another layout produces a meaningfully clearer diagram.

Do not change direction merely for visual novelty or to fill empty space.

---

## 3. Information Hierarchy

Every diagram should support two levels of reading.

### Zoomed-out reading

At a high level, the viewer should be able to identify:

- The main services or logical groups
- The general direction of the flow
- The major system boundaries
- The principal actors and dependencies

### Zoomed-in reading

At a detailed level, the viewer should be able to identify:

- Individual components
- Component responsibilities
- Communication paths
- Decisions and branches
- Protocols or connector labels where relevant

Large group labels and clear boundaries should preserve high-level readability even when individual component labels are no longer legible.

---

## 4. Component Lifecycle Colours

Colour communicates the lifecycle or change status of a component, not its technology.

Components should use outline colours only.

Do not fill component shapes.

| Component status | Outline colour |
|---|---|
| Existing and unchanged | Black |
| Existing and changing | Blue |
| New or greenfield | Green |
| To be removed | Red |

### Rules

- Component shapes should have no fill.
- Lifecycle colours should be applied consistently throughout the diagram.
- Do not use these colours decoratively.
- For wholly greenfield systems, use black outlines throughout; apply lifecycle colours only when the diagram distinguishes change states.
- A legend should be added when the lifecycle meaning may not be obvious to the audience.
- Text should remain black unless contrast or another explicit convention requires otherwise.

---

## 5. Service and Logical Grouping

Components belonging to the same service or logical unit should be visually grouped.

### Service boundary

Use a dashed rectangular container around all components belonging to the service.

The boundary should:

- Use approximately 60% opacity
- Be visually lighter than the components inside it
- Avoid touching or crowding internal components
- Enclose the full service without creating excessive empty space

### Service label

Place the service name above the top-left corner of the boundary.

The label should:

- Use approximately 60% opacity
- Be larger than individual component labels
- Remain readable when the diagram is viewed from a distance
- Make the service identifiable even when its internal labels cannot be read

The intended reading order is:

1. Identify the service or logical group.
2. Inspect the components within it.

---

## 6. Explanatory Annotations

The diagram should remain understandable without prose wherever ordinary architectural notation is sufficient. Use annotations only where omitting the context would cause a reasonable reader to misunderstand the design or ask, “Why does it work this way?”

Annotations may explain:

- Non-obvious constraints or trade-offs
- Intentional exceptions to the expected architecture
- Data-model asymmetries
- Transitional or migration behaviour
- Important assumptions that cannot be expressed clearly through ordinary notation

Do not use annotations to:

- Restate component or connector labels
- Narrate flows already communicated by arrows
- Compensate for unclear layout
- Add implementation detail that is irrelevant to the diagram's purpose

### Annotation style

Use a rounded rectangular callout with text inside it.

The callout should:

- Use orange `#f08c00` for both the outline and text
- Have a transparent background
- Use a dashed, 4 px outline at 100% opacity
- Use rounded corners and `roughness: 0`
- Use handwritten text (`fontFamily: 5`), left-aligned and top-aligned
- Use a 36 px font with `lineHeight: 1.25`
- Keep approximately 32–40 px of internal padding
- Wrap text to a readable width rather than forming one long line

Group the rectangle and text so they move together, but keep the text independent rather than binding it as the rectangle's label. Do not bind semantic flow connectors to annotations.

Place annotations in nearby whitespace, outside the primary flow whenever possible. Keep them close enough to the relevant area that their subject is clear, and do not place them over components, connectors, service boundaries, or labels.

Orange is reserved for explanatory annotations. Never use it to represent component lifecycle status. Unlike service boundaries, which are neutral and subdued at approximately 60% opacity, annotation callouts are orange, rounded, and full-opacity with their text inside.

---

## 7. Connectors

Connectors should communicate direction and relationships with as little visual complexity as possible.

### Default connector style

Use one-way arrows by default.

Prefer straight connectors between facing borders when the path is unobstructed. Otherwise, use an elbow connector with the fewest necessary bends. Multiple connectors may share a border, but bind them at distinct points and avoid overlapping their first or final segments. Use separate anchors for reciprocal flows.

Use curved connectors only as a last resort.

### Connector rules

- Prefer straight arrows when they do not overlap shapes or create ambiguity.
- When a straight arrow is unsuitable, use an elbowed arrow with one bend.
- Avoid unnecessary bends.
- Use clear arrowheads.
- Avoid crossing connectors where feasible.
- Keep unrelated connectors visually separated.
- Do not route connectors through components or labels.
- Add connector labels only when they communicate useful information such as a protocol, event, command, or important action.

### Bidirectional communication

Do not use a single double-headed arrow for bidirectional communication.

Represent bidirectional communication using two distinct arrows:

- One arrow in each direction
- Each arrow may have its own label
- The arrows should be slightly separated so that both directions remain visually clear

This makes each direction explicit and allows the two interactions to carry different meanings.

---

## 8. Flowchart Conventions

### Decision points

Use a rhomboid or diamond shape for conditional branches.

Outgoing connectors should be labelled with the outcome of the decision.

For short binary outcomes, use uppercase labels:

- `YES`
- `NO`
- `TRUE`
- `FALSE`

Longer branch labels should use sentence case for readability.

Place branch labels close to the corresponding outgoing connector and make it clear which path each label belongs to.

### End nodes

Use an ellipse for the end of a flow.

End nodes should have:

- Black fill
- White text
- A concise outcome or terminal-state label

Multiple end nodes are allowed and often preferable.

Use separate end nodes when reconnecting divergent paths would:

- Create overlapping arrows
- Produce unnecessary connector crossings
- Make the flow harder to follow
- Force unrelated outcomes into a single terminal node

Do not reconnect branches purely for visual symmetry.

---

## 9. Spacing and Overlap

Generated diagrams should leave sufficient space between components, groups, labels, and connectors.

The model should make a final layout pass to reduce:

- Overlapping shapes
- Connectors crossing labels
- Connectors passing through components
- Crowded branch points
- Unclear arrow direction
- Inconsistent spacing

A brief manual cleanup pass is expected after generation.

The generated diagram should prioritize correct structure and semantics first, followed by a practical attempt at a clean layout.

---

## 10. General Drawing Principles

- Use the smallest number of shapes necessary to communicate the system.
- Avoid decorative elements that do not add information.
- Keep component names concise.
- Prefer explicit labels over visual ambiguity.
- Maintain a consistent visual language throughout a single diagram.
- Preserve enough whitespace to distinguish groups and flows.
- Do not compress the diagram merely to reduce its overall dimensions.
- Make the primary flow immediately identifiable.
- Keep secondary systems and supporting dependencies visually peripheral where appropriate.
- Break a convention when following it would make the diagram less readable.

---

## 11. Rule Priority

When rules conflict, apply them in this order:

1. Semantic correctness
2. Readability
3. Clear information hierarchy
4. Consistency with this design system
5. Visual aesthetics

The diagram should never become less understandable merely to comply with a stylistic convention.
