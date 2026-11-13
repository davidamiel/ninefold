// Keep background library acknowledgements separate from page navigation.
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function reconcileLibrary(state, incoming, visiblePositions = []) {
  const changed = {};
  for (const key of ['notes', 'saved', 'recents']) {
    const next = incoming[key] || [];
    changed[key] = !equal(state[key], next);
    state[key] = next;
  }
  const positions = {...incoming.positions};
  for (const key of visiblePositions) {
    if (Object.hasOwn(state.positions, key)) positions[key] = state.positions[key];
  }
  state.positions = positions;
  const progress = {...incoming.audioProgress};
  for (const [key, local] of Object.entries(state.audioProgress)) {
    // An acknowledgement or another device must not rewind newer local progress.
    if (!progress[key] || local.savedAt > (progress[key].savedAt || 0)) progress[key] = local;
  }
  changed.audioProgress = !equal(state.audioProgress, progress);
  state.audioProgress = progress;
  return changed;
}
