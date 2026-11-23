// A work item's state as the board shows it: its theme color, and whether
// it counts as done.

// The theme color of a state, and whether it is done, by its category
// (data.meta.states: categoryStates, from parseAzureTypes and
// parseBacklogConfig).
export const stateColor = (data, name) => data.meta.states.find((s) => s.name === name)?.color ?? "muted";
export const stateDone = (data, name) => data.meta.states.find((s) => s.name === name)?.done === true;
