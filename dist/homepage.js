// Shared by the static first response and the interactive homepage.
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const arrow = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7M3 12h13"/></svg>';
const route = (type, id) => '#/' + type + '/' + encodeURIComponent(id);

export function homeContent({cases, term, profiles, issues, areas, photo}) {
  const events = cases.flatMap(c => [
    [c.granted, 'Review Granted'], [c.argued, 'Oral Argument'],
    [c.decided, /\d{2}A-?\d+/i.test(c.docket || '') ? 'Order Issued' : c.status === 'Dismissed' ? 'Dismissed' : 'Decision Issued'],
  ].filter(([day]) => day && day <= term.asOf).map(([date, label]) => ({date, label, id: c.id, name: c.name})));
  const seen = new Set();
  const activity = events.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)).filter(event => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  }).slice(0, 10);
  const justices = Object.values(profiles).filter(p => p.type === 'justice' && p.isCurrentJustice).sort((a, b) => {
    const chief = p => /chief justice/i.test(p.role || '');
    if (chief(a) !== chief(b)) return chief(a) ? -1 : 1;
    const joined = p => p.facts?.find(f => f.label === 'Joined the Court')?.value || '9999';
    return joined(a).localeCompare(joined(b));
  }).map(p => ({name: p.name, image: p.illustrationPath || p.portraitPath}));
  const featured = (term.cases || []).filter(c => issues[c.id] && c.status !== 'Dismissed').map(c => ({
    id: c.id, name: c.name, text: issues[c.id].text, areas: c.areas?.length ? c.areas : areas[c.id]?.areas || [],
  }));
  return {term: term.term, photo, activity, justices, featured};
}

export function renderFeature(items, index = 0) {
  if (!items.length) return '';
  const item = items[((index % items.length) + items.length) % items.length];
  return `<header><h2>Cases This Term</h2><div class="carousel-controls"><button data-action="feature-step" data-value="-1" aria-label="Previous case"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5-7 7 7 7M8 12h13"/></svg></button><button data-action="feature-step" data-value="1" aria-label="Next case">${arrow}</button></div></header><div class="feature-content" aria-live="polite"><span class="feature-topic">${escape(item.areas.join(' · '))}</span><a class="feature-case" href="${route('case', item.id)}">${escape(item.name)}</a><p>${escape(item.text)}</p><a class="feature-open" href="${route('case', item.id)}">Open Case ${arrow}</a></div>`;
}

export function renderHome(data, index = 0) {
  const shortDate = day => new Date(day + 'T12:00:00').toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
  return `<main class="main front-page"><section class="front-hero"><div class="front-intro"><h1>The Supreme Court, in Context</h1><p>Read the briefs, hear the arguments, and follow the precedents behind the Court’s decisions.</p><div class="front-actions"><a class="front-primary" href="#/cases?term=${data.term}">Browse October Term ${data.term} ${arrow}</a><a href="#/cases?view=all">Browse All Cases</a></div></div><figure><img src="${escape(data.photo.path || 'images/court-exterior.jpg')}" alt="${escape(data.photo.alt || 'The Supreme Court of the United States')}" fetchpriority="high"></figure></section><div class="front-middle"><section class="front-recent"><header><h2>Recent Court Activity</h2></header><div>${data.activity.map(event => `<a class="front-event" href="${route('case', event.id)}"><time datetime="${event.date}">${shortDate(event.date)}</time><span><small>${escape(event.label)}</small><strong>${escape(event.name)}</strong></span></a>`).join('') || '<p>No recent court events.</p>'}</div></section><section class="front-feature">${renderFeature(data.featured, index)}</section></div><section class="front-court"><header><h2>Current Court</h2><a href="#/justices">View Justices ${arrow}</a></header><div class="current-bench">${data.justices.map(person => `<a class="bench-person" href="${route('profile/justices', person.name)}"><figure class="home-justice-portrait illustrated-portrait"><img src="${escape(person.image)}" alt="${escape(person.name)}" loading="lazy"></figure><span>${escape(person.name)}</span></a>`).join('')}</div></section></main>`;
}

export function publicHeader() {
  const links = [['home','Home'],['cases','Cases'],['justices','Justices'],['orders','Orders']];
  const explore = '<details class="explore-menu"><summary><span>Explore</span><svg class="explore-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div>' + [['areas','Areas of Law'],['advocates','Advocates'],['amici','Amici'],['about','About Ninefold']].map(([id, label]) => `<a href="#/${id}">${label}</a>`).join('') + '</div></details>';
  const navigation = links.map(([id, label]) => `<a href="#/${id}" ${id === 'home' ? 'class="active" aria-current="page"' : ''}>${label}</a>`).join('') + explore;
  return `<header class="app-header boot-header"><a class="brand" href="#/home"><img class="brand-symbol" src="brand/ninefold.svg" alt="">Ninefold</a><nav class="app-nav" aria-label="Main navigation">${navigation}</nav><details class="mobile-menu"><summary aria-label="Main menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></summary><nav aria-label="Mobile navigation">${navigation}</nav></details><div class="nav-account"><button class="nav-icon" data-action="audio-downloads" aria-label="Audio downloads"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 16v5h16v-5"/></svg></button><button class="nav-icon" data-action="global-search" aria-label="Search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-6-6M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16"/></svg></button><button class="nav-icon" data-action="account-signin" aria-label="Sign In / Create Account"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-3a8 8 0 0 1 16 0v3"/></svg></button></div></header>`;
}
