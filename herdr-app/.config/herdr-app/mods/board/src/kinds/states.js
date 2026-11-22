// A work item's state as the board shows it: its theme color.

// The theme color of a state, by its category (data.meta.states:
// parseAzureTypes, parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";
