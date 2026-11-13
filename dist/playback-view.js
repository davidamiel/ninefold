// Patch this small control tree in place: async audio events must not detach a
// pressed button, an open native select, or a focused slider.
function key(node) {
  if (node.nodeType !== 1) return '';
  const identity = node.id || (node.hasAttribute('data-action')
    ? node.dataset.action + ':' + (node.dataset.value || '')
    : node.getAttribute('aria-label') || node.getAttribute('class')?.split(' ')[0] || '');
  return node.nodeName + ':' + identity;
}
function matches(current, next) {
  return current.nodeType === next.nodeType && current.nodeName === next.nodeName && key(current) === key(next);
}
function patch(current, next) {
  if (current.nodeType === 3) {
    if (current.data !== next.data) current.data = next.data;
    return;
  }
  if (current.nodeType !== 1) return;
  // Speaker content is owned by the transcript synchronizer.
  if (current.id === 'audio-speaker-portrait') return;
  const editing = current === current.ownerDocument.activeElement;
  for (const name of current.getAttributeNames()) {
    if (!next.hasAttribute(name)) current.removeAttribute(name);
  }
  for (const {name, value} of next.attributes) {
    if (current.getAttribute(name) !== value) current.setAttribute(name, value);
  }
  if (current.nodeName === 'INPUT') {
    if (!editing) { current.value = next.value; current.checked = next.checked; }
    return;
  }
  if (current.nodeName === 'SELECT' && editing) return;
  patchChildren(current, next);
  if (current.nodeName === 'SELECT') current.value = next.value;
}
function patchChildren(current, next) {
  let cursor = current.firstChild;
  for (const child of [...next.childNodes]) {
    let match = cursor;
    while (match && !matches(match, child)) match = match.nextSibling;
    if (!match) {
      match = child.cloneNode(true);
      current.insertBefore(match, cursor);
    } else {
      if (match !== cursor) current.insertBefore(match, cursor);
      patch(match, child);
    }
    cursor = match.nextSibling;
  }
  while (cursor) {
    const following = cursor.nextSibling;
    cursor.remove();
    cursor = following;
  }
}
export function updatePlaybackView(slot, html) {
  const template = slot.ownerDocument.createElement('template');
  template.innerHTML = html;
  patchChildren(slot, template.content);
}
