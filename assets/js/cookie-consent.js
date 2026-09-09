(function () {
  var CONSENT_KEY = 'senda_cookie_consent';
  var EXCLUDE_KEY = 'senda_analytics_excluded';
  var CLARITY_ID = 'yfglzumxgg';

  // One-time opt-out for site owners/team: visiting any page with ?notrack=1
  // permanently excludes this browser from analytics (stored in localStorage).
  // Use ?notrack=0 to undo it on a given browser.
  var params = new URLSearchParams(window.location.search);
  if (params.has('notrack')) {
    if (params.get('notrack') === '0') {
      localStorage.removeItem(EXCLUDE_KEY);
    } else {
      localStorage.setItem(EXCLUDE_KEY, '1');
    }
  }
  if (localStorage.getItem(EXCLUDE_KEY) === '1') { return; }

  function loadClarity() {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', CLARITY_ID);
  }

  var consent = localStorage.getItem(CONSENT_KEY);
  if (consent === 'accepted') { loadClarity(); return; }
  if (consent === 'declined') { return; }

  var isGerman = (document.documentElement.lang || '').toLowerCase().indexOf('de') === 0;
  var text = isGerman ? {
    msg: 'Diese Website verwendet Cookies, um die Nutzung zu analysieren und Ihre Erfahrung zu verbessern.',
    link: 'Mehr erfahren',
    accept: 'Akzeptieren',
    decline: 'Ablehnen'
  } : {
    msg: 'This site uses cookies to analyse usage and improve your experience.',
    link: 'Learn more',
    accept: 'Accept',
    decline: 'Decline'
  };

  function inject() {
    var style = document.createElement('style');
    style.textContent =
      '#senda-cookie-banner{position:fixed;left:0;right:0;bottom:0;z-index:9999;' +
      'background:#1a1916;color:#faf9f6;font-family:"Hanken Grotesk",system-ui,sans-serif;' +
      'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:1rem 1.5rem;' +
      'padding:1.1rem 1.5rem;box-shadow:0 -4px 24px rgba(0,0,0,.25)}' +
      '#senda-cookie-banner p{margin:0;font-size:.8125rem;line-height:1.5;max-width:640px;color:rgba(250,249,246,.85)}' +
      '#senda-cookie-banner a{color:#faf9f6;text-decoration:underline;text-underline-offset:2px}' +
      '#senda-cookie-banner .senda-cc-actions{display:flex;align-items:center;gap:.75rem;flex-shrink:0}' +
      '#senda-cookie-banner button{font-family:inherit;font-size:.75rem;font-weight:500;letter-spacing:.1em;' +
      'text-transform:uppercase;cursor:pointer;border-radius:999px;padding:.55rem 1.25rem;transition:background .2s,border-color .2s,opacity .2s}' +
      '#senda-cookie-banner .senda-cc-accept{background:#faf9f6;color:#1a1916;border:1px solid #faf9f6}' +
      '#senda-cookie-banner .senda-cc-accept:hover{opacity:.85}' +
      '#senda-cookie-banner .senda-cc-decline{background:transparent;color:rgba(250,249,246,.75);border:.5px solid rgba(250,249,246,.3)}' +
      '#senda-cookie-banner .senda-cc-decline:hover{background:rgba(250,249,246,.1);border-color:rgba(250,249,246,.5)}' +
      '@media(max-width:640px){#senda-cookie-banner{flex-direction:column;align-items:stretch;text-align:center}' +
      '#senda-cookie-banner p{max-width:100%}#senda-cookie-banner .senda-cc-actions{justify-content:center}}';
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'senda-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', isGerman ? 'Cookie-Hinweis' : 'Cookie notice');
    banner.innerHTML =
      '<p>' + text.msg + ' <a href="/legal/privacy.html">' + text.link + '</a></p>' +
      '<div class="senda-cc-actions">' +
      '<button type="button" class="senda-cc-decline">' + text.decline + '</button>' +
      '<button type="button" class="senda-cc-accept">' + text.accept + '</button>' +
      '</div>';
    document.body.appendChild(banner);

    banner.querySelector('.senda-cc-accept').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'accepted');
      loadClarity();
      banner.remove();
    });
    banner.querySelector('.senda-cc-decline').addEventListener('click', function () {
      localStorage.setItem(CONSENT_KEY, 'declined');
      banner.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
