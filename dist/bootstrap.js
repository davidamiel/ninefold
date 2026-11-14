// The response already contains the homepage. Let it paint before app work starts.
const app = document.querySelector('#app');
const initial = app.innerHTML;
let ready = false, failed = false, queuedAction = null;
const titles = {cases:'Cases',case:'Case',reader:'Reader',orders:'Orders',applications:'Emergency Docket',justices:'Justices',advocates:'Advocates',amici:'Amici',areas:'Areas of Law',profile:'Profile',about:'About Ninefold',library:'My Library'};
function showDestination() {
  if (ready) return;
  const route = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0] || 'home';
  if (route === 'home') { app.innerHTML = initial; if (failed) showFailure(); return; }
  const title = titles[route] || 'Ninefold';
  const header = app.querySelector('header')?.outerHTML || '';
  app.innerHTML = header + `<main class="main startup-destination"><h1>${title}</h1><p role="status">Loading…</p></main>`;
  if (failed) showFailure();
}
showDestination();
window.addEventListener('hashchange', showDestination);
document.addEventListener('click', event => {
  if (ready) return;
  const button = event.target.closest('[data-action]');
  if (!button) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  queuedAction = {action: button.dataset.action, value: button.dataset.value || ''};
}, true);
window.addEventListener('ninefold:ready', () => {
  ready = true;
  window.removeEventListener('hashchange', showDestination);
  if (queuedAction) {
    const button = document.querySelector(`[data-action="${CSS.escape(queuedAction.action)}"]${queuedAction.value ? `[data-value="${CSS.escape(queuedAction.value)}"]` : ''}`);
    button?.click();
  }
}, {once: true});
function showFailure() {
  failed = true;
  app.querySelector('.startup-error')?.remove();
  app.querySelector('.startup-destination [role="status"]')?.remove();
  const message = document.createElement('p');
  message.className = 'startup-error';
  message.setAttribute('role', 'alert');
  message.innerHTML = 'Case information could not load. <button type="button">Try again</button>';
  message.querySelector('button').onclick = () => location.reload();
  app.prepend(message);
}
window.addEventListener('ninefold:failed', showFailure);
requestAnimationFrame(() => requestAnimationFrame(() => {
  import('./app.js').catch(showFailure);
}));

// Stream content directly; this app does not register an offline worker.
if('serviceWorker'in navigator)void navigator.serviceWorker.getRegistrations().then(registrations=>{
 const scope=new URL('./',import.meta.url).href;
 for(const registration of registrations)if(registration.scope===scope)void registration.unregister();
}).catch(()=>{});
