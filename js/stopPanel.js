// HTML panel shown beside milestone rocks. Driven by the 'journey:stop'
// CustomEvent from the orchestrator: detail = { phase: 'enter' | 'leave',
// index, type, panel }. Text is set with textContent only (no innerHTML).

const HIDE_FALLBACK_MS = 700;

const el = document.querySelector('.stop-panel');
if (el) {
    const dates = el.querySelector('.stop-panel-dates');
    const title = el.querySelector('.stop-panel-title');
    const subtitle = el.querySelector('.stop-panel-subtitle');
    const list = el.querySelector('.stop-panel-items');
    const more = el.querySelector('.stop-panel-more');
    const portal = el.querySelector('.stop-panel-portal');
    let hideTimer = 0;

    // The portal link opens the app inside the journey (dimension.js); it
    // is a real link, so a new tab or a middle click opens the app page
    portal?.addEventListener('click', (e) => {
        if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('journey:portal-request'));
    });

    // Click-to-load embed (panel.embed): a button first; only the click
    // inserts the iframe, so nothing from the embed host loads before it.
    // Only https://www.instagram.com/ embeds are allowed.
    function embedItem(emb) {
        const li = document.createElement('li');
        li.className = 'stop-panel-embed';
        if (!/^https:\/\/www\.instagram\.com\//.test(emb.src)) return li;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'stop-panel-embed-btn';
        btn.textContent = emb.label;
        btn.addEventListener('click', () => {
            const frame = document.createElement('iframe');
            frame.src = emb.src;
            frame.title = emb.title || emb.label;
            frame.setAttribute('allowfullscreen', '');
            frame.referrerPolicy = 'strict-origin-when-cross-origin';
            const box = document.createElement('div');
            box.className = 'stop-panel-embed-box';
            box.appendChild(frame);
            btn.replaceWith(box);
            el.classList.add('embed-open');
            frame.focus();
        });
        li.appendChild(btn);
        return li;
    }

    function fill(p) {
        dates.textContent = p.dates || '';
        dates.hidden = !p.dates;
        title.textContent = p.title || '';
        subtitle.textContent = p.subtitle || '';
        subtitle.hidden = !p.subtitle;

        list.replaceChildren();
        for (const item of p.items || []) {
            const li = document.createElement('li');
            if (item.href) {
                const a = document.createElement('a');
                a.href = item.href;
                a.target = '_blank';
                a.rel = 'noopener';
                a.textContent = item.text;
                li.appendChild(a);
            } else {
                li.textContent = item.text;
            }
            list.appendChild(li);
        }
        if (p.embed) list.appendChild(embedItem(p.embed));
        el.classList.remove('embed-open');

        more.hidden = !p.more;
        if (p.more) {
            more.href = p.more.href;
            more.textContent = p.more.label;
            if (/^https?:/.test(p.more.href)) {
                more.target = '_blank';
                more.rel = 'noopener';
            } else {
                more.removeAttribute('target');
                more.removeAttribute('rel');
            }
        }
        if (portal) {
            portal.hidden = !p.portal;
            if (p.portal) {
                portal.href = p.portal.href;
                portal.textContent = p.portal.label;
            }
        }
        list.scrollTop = 0;
    }

    function show(p) {
        clearTimeout(hideTimer);
        fill(p);
        el.hidden = false;
        void el.offsetWidth; // reflow so the transition runs from the hidden state
        el.classList.add('visible');
        document.body.classList.add('panel-open');
    }

    function hide() {
        el.classList.remove('visible');
        document.body.classList.remove('panel-open');
        if (el.hidden) return;
        clearTimeout(hideTimer);
        const done = () => {
            clearTimeout(hideTimer);
            el.removeEventListener('transitionend', onEnd);
            if (!el.classList.contains('visible')) el.hidden = true;
        };
        const onEnd = (e) => { if (e.target === el && e.propertyName === 'opacity') done(); };
        el.addEventListener('transitionend', onEnd);
        hideTimer = setTimeout(done, HIDE_FALLBACK_MS);
    }

    window.addEventListener('journey:stop', (e) => {
        const d = e.detail || {};
        if (d.phase === 'enter' && d.panel) show(d.panel);
        else hide();
    });

    // Walk mode (walk.js): the panel of a picked object, or null to hide
    window.addEventListener('walk:panel', (e) => {
        const p = e.detail?.panel;
        if (p) show(p);
        else hide();
    });
}
