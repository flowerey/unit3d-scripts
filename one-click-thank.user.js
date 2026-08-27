// ==UserScript==
// @name         UNIT3D One-Click Thank
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Auto-thank uploaders, bulk thank on browse pages, thank history tracker.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/one-click-thank.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/one-click-thank.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_HISTORY = 'oct_history';
    const STORAGE_KEY_EXCLUDE = 'oct_excludes';
    const STORAGE_KEY_AUTO = 'oct_auto_thank';

    function getHistory() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || []; }
        catch { return []; }
    }

    function saveHistory(list) {
        localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(list.slice(-200)));
    }

    function hasThanked(torrentId) {
        return getHistory().some(h => h.torrentId === torrentId);
    }

    function recordThank(torrentId, uploader) {
        const history = getHistory();
        if (!history.some(h => h.torrentId === torrentId)) {
            history.push({ torrentId, uploader, date: Date.now() });
            saveHistory(history);
        }
    }

    function getExcludes() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_EXCLUDE)) || []; }
        catch { return []; }
    }

    function saveExcludes(list) {
        localStorage.setItem(STORAGE_KEY_EXCLUDE, JSON.stringify(list));
    }

    function isExcluded(username) {
        return getExcludes().some(u => u.toLowerCase() === username.toLowerCase());
    }

    function isAutoThankEnabled() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_AUTO)) || false; }
        catch { return false; }
    }

    function setAutoThank(val) {
        localStorage.setItem(STORAGE_KEY_AUTO, JSON.stringify(val));
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    async function thankTorrent(torrentId) {
        if (hasThanked(torrentId)) return { ok: false, msg: 'Already thanked' };

        const token = csrfToken();
        if (!token) return { ok: false, msg: 'No CSRF token' };

        const liveEl = document.querySelector(`[wire\\:id]`);
        if (!liveEl) return { ok: false, msg: 'Livewire not found' };

        const snapshot = liveEl.getAttribute('wire:snapshot');
        if (!snapshot) return { ok: false, msg: 'No snapshot' };

        try {
            const livewireId = JSON.parse(snapshot).id;
            const response = await fetch('/livewire/message/thank-button', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                    'X-Livewire': 'true',
                },
                body: JSON.stringify({
                    _token: token,
                    components: [{
                        snapshot: snapshot,
                        updates: { callMethod: { path: '', method: 'store', params: [torrentId] } },
                        type: 'callMethod',
                    }],
                }),
            });
            if (response.ok) {
                recordThank(torrentId, '');
                return { ok: true, msg: 'Thanked!' };
            }
            return { ok: false, msg: `HTTP ${response.status}` };
        } catch (e) {
            return { ok: false, msg: e.message };
        }
    }

    function addThankButtonsToRows() {
        document.querySelectorAll('.torrent-search__results .torrent-search__row, .table-responsive tr').forEach(row => {
            if (row.querySelector('.oct-btn')) return;

            const linkEl = row.querySelector('td:nth-child(2) a, .torrent-search__name a');
            if (!linkEl) return;
            const href = linkEl.getAttribute('href');
            const match = href && href.match(/\/torrents\/(\d+)/);
            if (!match) return;
            const torrentId = parseInt(match[1], 10);

            const userEl = row.querySelector('td:nth-child(5) a, td:nth-child(6) a, .torrent-search__uploader a');
            const uploader = userEl ? userEl.textContent.trim() : '';

            const btn = document.createElement('button');
            btn.className = 'oct-btn';
            btn.style.cssText = 'font-size:10px; padding:2px 6px; margin-left:4px; background:#1a1a2e; color:#e94560; border:1px solid #e94560; border-radius:3px; cursor:pointer;';
            btn.textContent = hasThanked(torrentId) ? '♥' : '♥ Thank';
            btn.title = 'Thank uploader';

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isExcluded(uploader)) return;
                btn.textContent = '...';
                btn.disabled = true;
                const result = await thankTorrent(torrentId);
                if (result.ok) {
                    btn.textContent = '♥';
                    btn.style.color = '#66ff66';
                    btn.style.borderColor = '#66ff66';
                } else {
                    btn.textContent = '♥ Thank';
                    btn.disabled = false;
                }
            });

            const firstTd = row.querySelector('td');
            if (firstTd) {
                firstTd.appendChild(btn);
            }
        });
    }

    function addThankAllButton() {
        if (document.querySelector('.oct-thank-all')) return;

        const toolbar = document.querySelector('.torrent-search__header, .panel__header, h1');
        if (!toolbar) return;

        const btn = document.createElement('button');
        btn.className = 'oct-thank-all';
        btn.textContent = '♥ Thank All Visible';
        btn.style.cssText = 'padding:4px 12px; margin-left:12px; background:#1a1a2e; color:#e94560; border:1px solid #e94560; border-radius:4px; cursor:pointer; font-size:12px; font-weight:bold;';
        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = 'Thanking...';
            let count = 0;
            document.querySelectorAll('.oct-btn').forEach(async (b) => {
                if (b.textContent.includes('Thank') && !b.disabled) {
                    b.click();
                    count++;
                }
            });
            setTimeout(() => {
                btn.textContent = `♥ Thanked ${count}`;
                btn.style.color = '#66ff66';
            }, 2000);
        });

        toolbar.appendChild(btn);
    }

    function addAutoThankToggle() {
        if (document.querySelector('.oct-auto-toggle')) return;

        const nav = document.querySelector('.nav-topbar, .nav, header');
        if (!nav) return;

        const wrapper = document.createElement('span');
        wrapper.className = 'oct-auto-toggle';
        wrapper.style.cssText = 'display:inline-flex; align-items:center; gap:4px; margin-left:16px; font-size:11px; color:#aaa;';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = isAutoThankEnabled();
        toggle.style.cssText = 'cursor:pointer;';
        toggle.addEventListener('change', () => setAutoThank(toggle.checked));

        const label = document.createElement('span');
        label.textContent = 'Auto-Thank';
        label.style.cssText = 'cursor:pointer;';

        wrapper.appendChild(toggle);
        wrapper.appendChild(label);
        nav.appendChild(wrapper);
    }

    function addSettingsButton() {
        if (document.querySelector('.oct-settings')) return;

        const panel = document.createElement('div');
        panel.id = 'oct-settings-panel';
        panel.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:99999; background:#1a1a2e; color:#fff; border:1px solid #444; border-radius:8px; padding:16px; font-family:sans-serif; font-size:13px; display:none; min-width:320px; max-height:400px; overflow-y:auto;';
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.className = 'oct-settings';
        btn.textContent = '♥ Thank Settings';
        btn.style.cssText = 'font-size:10px; padding:2px 6px; background:#16213e; color:#aaa; border:1px solid #555; border-radius:3px; cursor:pointer; margin-left:8px;';
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            renderSettings();
        });
        const nav = document.querySelector('.nav-topbar, .nav, header');
        if (nav) nav.appendChild(btn);

        window._octRenderSettings = renderSettings;
        function renderSettings() {
            const history = getHistory();
            const excludes = getExcludes();
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                    <strong>One-Click Thank Settings</strong>
                    <button id="oct-close" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:18px;">&times;</button>
                </div>
                <div style="margin-bottom:12px;">
                    <strong>Exclude List</strong>
                    <div style="display:flex; gap:4px; margin-top:4px;">
                        <input id="oct-exclude-input" type="text" placeholder="Username..." style="flex:1; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px;" />
                        <button id="oct-exclude-add" style="padding:4px 8px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:12px;">Add</button>
                    </div>
                    <div style="margin-top:6px;">${excludes.length === 0 ? '<div style="color:#666;">No excludes</div>' :
                        excludes.map(u => `<div style="display:flex; justify-content:space-between; padding:2px 0; font-size:12px;">
                            <span>${u}</span>
                            <button class="oct-exclude-rm" data-user="${u}" style="background:#500; color:#f66; border:none; cursor:pointer; font-size:11px;">Remove</button>
                        </div>`).join('')}</div>
                </div>
                <div>
                    <strong>Thank History (${history.length})</strong>
                    <div style="margin-top:6px; max-height:150px; overflow-y:auto;">${history.length === 0 ? '<div style="color:#666;">No thanks given yet</div>' :
                        history.slice().reverse().slice(0, 50).map(h => `<div style="padding:2px 0; font-size:12px; border-bottom:1px solid #333;">
                            Torrent #${h.torrentId} - ${new Date(h.date).toLocaleDateString()}
                        </div>`).join('')}</div>
                </div>
            `;
            document.getElementById('oct-close').addEventListener('click', () => panel.style.display = 'none');
            document.getElementById('oct-exclude-add').addEventListener('click', () => {
                const input = document.getElementById('oct-exclude-input');
                const val = input.value.trim();
                if (val) {
                    const list = getExcludes();
                    list.push(val);
                    saveExcludes(list);
                    input.value = '';
                    renderSettings();
                }
            });
            panel.querySelectorAll('.oct-exclude-rm').forEach(b => {
                b.addEventListener('click', () => {
                    saveExcludes(getExcludes().filter(u => u !== b.dataset.user));
                    renderSettings();
                });
            });
        }
    }

    function runAll() {
        addThankButtonsToRows();
        addThankAllButton();
        addAutoThankToggle();
        addSettingsButton();
    }

    const obs = new MutationObserver(runAll);
    obs.observe(document.body, { childList: true, subtree: true });
    runAll();
})();
