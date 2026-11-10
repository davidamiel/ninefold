// Keep an open draft independent of reader navigation and app re-renders.
export function attachEditorPanel(panel, title, focusEditor) {
  const resume = document.createElement('button');
  resume.className = 'editor-resume';
  resume.textContent = 'Resume editing';
  resume.title = title;
  resume.setAttribute('aria-label', 'Resume editing '+title);
  resume.hidden = true;
  document.body.append(resume);
  function minimize() {
    panel.hidden = true;
    resume.hidden = false;
    resume.focus();
  }
  function show() {
    panel.hidden = false;
    resume.hidden = true;
    focusEditor();
  }
  resume.onclick = show;
  for (const type of ['click','keydown','keyup','pointerdown','pointerup','input','change']) {
    panel.addEventListener(type, event => event.stopPropagation());
  }
  panel.addEventListener('editor-resume', show);
  return {minimize, show, remove() { resume.remove(); panel.remove(); }};
}
