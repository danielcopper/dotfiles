// A work item's state as the board shows it: its theme color.

// The theme color of a state, by its category (data.meta.states:
// parseAzureTypes, parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";

// Whether a state counts as done (its category Completed or Removed), as a
// done related item is dimmed.
export const stateDone = (data, name) => ["Completed", "Removed"].includes(data.meta.states.find((s) => s.name === name)?.category);
