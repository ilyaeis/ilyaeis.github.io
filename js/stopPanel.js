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
    let hideTimer = 0;

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
        el.scrollTop = 0;
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
}
