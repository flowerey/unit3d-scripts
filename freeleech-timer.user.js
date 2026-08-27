// ==UserScript==
// @name         UNIT3D Freeleech Timer
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Shows freeleech countdown timers, auto-apply FL tokens, and highlight expiring soon.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/freeleech-timer.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/freeleech-timer.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_AUTO_FL = 'ft_auto_fl';
    const STORAGE_KEY_THRESHOLD = 'ft_threshold';
    const STORAGE_KEY_LOG = 'ft_log';

    function getAutoFL() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_AUTO_FL)) || false; }
        catch { return false; }
    }

    function setAutoFL(val) {
        localStorage.setItem(STORAGE_KEY_AUTO_FL, JSON.stringify(val));
    }

    function getThreshold() {
        try { return parseInt(localStorage.getItem(STORAGE_KEY_THRESHOLD)) || 5; }
        catch { return 5; }
    }

    function setThreshold(val) {
        localStorage.setItem(STORAGE_KEY_THRESHOLD, String(val));
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    function formatTimeRemaining(seconds) {
        if (seconds <= 0) return 'Expired';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    }

    function getTimeUntilExpiry(dateStr) {
        if (!dateStr) return null;
        const target = new Date(dateStr);
        const now = new Date();
        const diff = (target.getTime() - now.getTime()) / 1000;
        return diff > 0 ? diff : 0;
    }

    function injectTimers() {
        document.querySelectorAll('.torrent-search__row, .table-responsive tr').forEach(row => {
            if (row.querySelector('.ft-timer')) return;

            const flIcon = row.querySelector('.torrent-icons__freeleech, [title*="freeleech"], [title*="free"]');
            if (!flIcon) return;

            const tooltip = flIcon.closest('li')?.querySelector('.torrent-icons__text, .torrent-icons__tooltip');
            let expiryStr = null;

            if (tooltip) {
                const match = tooltip.textContent.match(/expires?\s+(.+?)(?:\)|\.|$)/i) ||
                    tooltip.textContent.match(/until\s+(.+?)(?:\)|\.|$)/i);
                if (match) expiryStr = match[1].trim();
            }

            const flUntil = row.getAttribute('data-fl-until') || row.querySelector('[data-fl-until]')?.getAttribute('data-fl-until');
            if (flUntil) expiryStr = flUntil;

            if (!expiryStr) {
                const text = row.textContent;
                const dateMatch = text.match(/(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2})/);
                if (dateMatch) expiryStr = dateMatch[1];
            }

            if (!expiryStr) return;

            let remaining;
            try {
                const d = new Date(expiryStr);
                remaining = getTimeUntilExpiry(d.toISOString());
            } catch { return; }

            if (remaining === null || remaining <= 0) return;

            const timerEl = document.createElement('span');
            timerEl.className = 'ft-timer';
            timerEl.style.cssText = 'font-size:10px; padding:1px 5px; margin-left:4px; border-radius:3px; font-weight:bold; display:inline-block;';

            if (remaining < 86400) {
                timerEl.style.background = '#ff4d4d';
                timerEl.style.color = '#fff';
            } else if (remaining < 172800) {
                timerEl.style.background = '#ff9900';
                timerEl.style.color = '#000';
            } else {
                timerEl.style.background = '#0f3460';
                timerEl.style.color = '#4fc3f7';
            }

            timerEl.textContent = formatTimeRemaining(remaining);
            timerEl.title = `Freeleech expires: ${new Date(expiryStr).toLocaleString()}`;

            const iconLi = flIcon.closest('li') || flIcon.closest('td');
            if (iconLi) {
                iconLi.appendChild(timerEl);
            }

            const updateTimer = () => {
                remaining = getTimeUntilExpiry(new Date(expiryStr).toISOString());
                if (remaining <= 0) {
                    timerEl.textContent = 'Expired';
                    timerEl.style.background = '#333';
                    timerEl.style.color = '#888';
                    return;
                }
                timerEl.textContent = formatTimeRemaining(remaining);
                if (remaining < 86400) {
                    timerEl.style.background = '#ff4d4d';
                    timerEl.style.color = '#fff';
                }
            };
            setInterval(updateTimer, 60000);
        });
    }

    async function applyFLToken(torrentId) {
        const token = csrfToken();
        if (!token) return false;

        try {
            const res = await fetch(`/torrent/${torrentId}/freeleech_token`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRF-TOKEN': token,
                },
            });
            return res.ok;
        } catch { return false; }
    }

    function logAutoFL(torrentId, success) {
        try {
            const log = JSON.parse(localStorage.getItem(STORAGE_KEY_LOG)) || [];
            log.push({ torrentId, success, date: Date.now() });
            localStorage.setItem(STORAGE_KEY_LOG, JSON.stringify(log.slice(-100)));
        } catch { }
    }

    function injectAutoFLButtons() {
        document.querySelectorAll('.torrent-search__row, .table-responsive tr').forEach(row => {
            if (row.querySelector('.ft-fl-btn')) return;

            const linkEl = row.querySelector('td:nth-child(2) a, .torrent-search__name a');
            if (!linkEl) return;
            const href = linkEl.getAttribute('href');
            const match = href && href.match(/\/torrents\/(\d+)/);
            if (!match) return;
            const torrentId = parseInt(match[1], 10);

            const btn = document.createElement('button');
            btn.className = 'ft-fl-btn';
            btn.textContent = '🎟 FL';
            btn.style.cssText = 'font-size:10px; padding:2px 6px; margin-left:4px; background:#16213e; color:#66ff66; border:1px solid #66ff66; border-radius:3px; cursor:pointer;';

            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                btn.disabled = true;
                btn.textContent = '...';
                const ok = await applyFLToken(torrentId);
                logAutoFL(torrentId, ok);
                if (ok) {
                    btn.textContent = '✓ Applied';
                    btn.style.color = '#66ff66';
                } else {
                    btn.textContent = 'Failed';
                    btn.style.color = '#ff4d4d';
                    btn.disabled = false;
                }
            });

            const firstTd = row.querySelector('td');
            if (firstTd) firstTd.appendChild(btn);
        });
    }

    function injectSettingsPanel() {
        if (document.querySelector('.ft-settings')) return;

        const nav = document.querySelector('.nav-topbar, .nav, header');
        if (!nav) return;

        const panel = document.createElement('div');
        panel.id = 'ft-panel';
        panel.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:99999; background:#1a1a2e; color:#fff; border:1px solid #444; border-radius:8px; padding:16px; font-family:sans-serif; font-size:13px; display:none; min-width:280px;';
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.className = 'ft-settings';
        btn.textContent = '🎟 FL Settings';
        btn.style.cssText = 'font-size:10px; padding:2px 6px; background:#16213e; color:#aaa; border:1px solid #555; border-radius:3px; cursor:pointer; margin-left:8px;';
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            render();
        });
        nav.appendChild(btn);

        function render() {
            const autoFl = getAutoFL();
            const threshold = getThreshold();
            const log = JSON.parse(localStorage.getItem(STORAGE_KEY_LOG) || '[]');

            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                    <strong>Freeleech Timer Settings</strong>
                    <button id="ft-close" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:18px;">&times;</button>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:12px; cursor:pointer;">
                    <input type="checkbox" id="ft-auto" ${autoFl ? 'checked' : ''} style="cursor:pointer;" />
                    <span>Auto-apply FL tokens on download</span>
                </label>
                <div style="margin-bottom:12px;">
                    <label>Min FL token threshold:</label>
                    <input type="number" id="ft-threshold" value="${threshold}" min="0" max="100"
                        style="width:60px; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; margin-left:8px;" />
                    <div style="font-size:11px; color:#888; margin-top:2px;">Only auto-apply if you have more than this many tokens</div>
                </div>
                <div style="margin-bottom:12px;">
                    <strong>Recent FL Usage</strong>
                    <div style="margin-top:4px; max-height:120px; overflow-y:auto; font-size:12px;">${log.length === 0 ? '<div style="color:#666;">No FL usage yet</div>' :
                        log.slice().reverse().slice(0, 20).map(h =>
                            `<div style="padding:2px 0; border-bottom:1px solid #333;">
                                Torrent #${h.torrentId} - ${h.success ? '✓' : '✗'} - ${new Date(h.date).toLocaleDateString()}
                            </div>`
                        ).join('')}</div>
                </div>
                <button id="ft-save" style="width:100%; padding:6px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
            `;
            document.getElementById('ft-close').addEventListener('click', () => panel.style.display = 'none');
            document.getElementById('ft-save').addEventListener('click', () => {
                setAutoFL(document.getElementById('ft-auto').checked);
                setThreshold(parseInt(document.getElementById('ft-threshold').value) || 5);
                panel.style.display = 'none';
            });
        }
    }

    function runAll() {
        injectTimers();
        injectAutoFLButtons();
        injectSettingsPanel();
    }

    const obs = new MutationObserver(runAll);
    obs.observe(document.body, { childList: true, subtree: true });
    runAll();
})();
