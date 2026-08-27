// ==UserScript==
// @name         UNIT3D Request Tracker
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Track request bounties, auto-vote, filter by status, and bounty alerts.
// @author       blueberry
// @match        https://*/requests*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/request-tracker.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/request-tracker.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_TRACKED = 'rt_tracked';
    const STORAGE_KEY_ALERT = 'rt_alert_threshold';
    const STORAGE_KEY_AUTO_VOTE = 'rt_auto_vote';
    const STORAGE_KEY_AUTO_MIN = 'rt_auto_min_bounty';

    function getTracked() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_TRACKED)) || {}; }
        catch { return {}; }
    }

    function saveTracked(data) {
        localStorage.setItem(STORAGE_KEY_TRACKED, JSON.stringify(data));
    }

    function getAlertThreshold() {
        try { return parseInt(localStorage.getItem(STORAGE_KEY_ALERT)) || 0; }
        catch { return 0; }
    }

    function setAlertThreshold(val) {
        localStorage.setItem(STORAGE_KEY_ALERT, String(val));
    }

    function isAutoVoteEnabled() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_AUTO_VOTE)) || false; }
        catch { return false; }
    }

    function setAutoVote(val) {
        localStorage.setItem(STORAGE_KEY_AUTO_VOTE, JSON.stringify(val));
    }

    function getAutoVoteMin() {
        try { return parseInt(localStorage.getItem(STORAGE_KEY_AUTO_MIN)) || 100; }
        catch { return 100; }
    }

    function setAutoVoteMin(val) {
        localStorage.setItem(STORAGE_KEY_AUTO_MIN, String(val));
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    async function voteOnRequest(requestId, amount) {
        const token = csrfToken();
        if (!token) return false;

        const liveEl = document.querySelector('[wire\\:id]');
        if (!liveEl) return false;

        try {
            const snapshot = liveEl.getAttribute('wire:snapshot');
            const res = await fetch('/livewire/message/torrent-request-search', {
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
                        updates: {
                            callMethod: {
                                path: '',
                                method: 'addVote',
                                params: [requestId, amount],
                            },
                        },
                        type: 'callMethod',
                    }],
                }),
            });
            return res.ok;
        } catch { return false; }
    }

    function extractRequestData(row) {
        const nameLink = row.querySelector('td:nth-child(1) a, .torrent-request-search__name a');
        if (!nameLink) return null;

        const href = nameLink.getAttribute('href') || '';
        const idMatch = href.match(/\/requests\/(\d+)/);
        if (!idMatch) return null;

        const bountyEl = row.querySelector('td:nth-child(8), .torrent-request-search__bounty');
        let bounty = 0;
        if (bountyEl) {
            const bountyMatch = bountyEl.textContent.match(/(\d+)/);
            if (bountyMatch) bounty = parseInt(bountyMatch[1], 10);
        }

        const votesEl = row.querySelector('td:nth-child(6), .torrent-request-search__votes');
        let votes = 0;
        if (votesEl) {
            const votesMatch = votesEl.textContent.match(/(\d+)/);
            if (votesMatch) votes = parseInt(votesMatch[1], 10);
        }

        const statusEl = row.querySelector('.torrent-request-search__status, td:last-child');
        let status = 'unknown';
        if (statusEl) {
            const statusIcon = statusEl.querySelector('[class*="circle"], i');
            if (statusIcon) {
                const cls = statusIcon.className;
                if (cls.includes('green') || cls.includes('check')) status = 'filled';
                else if (cls.includes('blue')) status = 'claimed';
                else if (cls.includes('purple')) status = 'pending';
                else if (cls.includes('red')) status = 'unfilled';
            }
        }

        return {
            id: parseInt(idMatch[1], 10),
            name: nameLink.textContent.trim(),
            bounty,
            votes,
            status,
        };
    }

    function addTrackButtons() {
        document.querySelectorAll('.torrent-request-search__row, .table-responsive tr').forEach(row => {
            if (row.querySelector('.rt-track-btn')) return;

            const data = extractRequestData(row);
            if (!data) return;

            const tracked = getTracked();
            const isTracked = !!tracked[data.id];

            const btn = document.createElement('button');
            btn.className = 'rt-track-btn';
            btn.textContent = isTracked ? '★ Tracked' : '☆ Track';
            btn.style.cssText = 'font-size:10px; padding:2px 6px; margin-left:4px; background:#1a1a2e; color:#e94560; border:1px solid #e94560; border-radius:3px; cursor:pointer;';
            if (isTracked) {
                btn.style.color = '#66ff66';
                btn.style.borderColor = '#66ff66';
            }

            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const t = getTracked();
                if (t[data.id]) {
                    delete t[data.id];
                    btn.textContent = '☆ Track';
                    btn.style.color = '#e94560';
                    btn.style.borderColor = '#e94560';
                } else {
                    t[data.id] = { ...data, trackedAt: Date.now() };
                    btn.textContent = '★ Tracked';
                    btn.style.color = '#66ff66';
                    btn.style.borderColor = '#66ff66';
                }
                saveTracked(t);
                updateTrackedCount();
            });

            const firstTd = row.querySelector('td');
            if (firstTd) firstTd.appendChild(btn);
        });
    }

    function checkBountyAlerts() {
        const threshold = getAlertThreshold();
        if (threshold <= 0) return;

        const tracked = getTracked();
        Object.entries(tracked).forEach(([id, data]) => {
            if (data.bounty >= threshold && !data.alerted) {
                const alert = `Bounty Alert: "${data.name}" reached ${data.bounty} BON!`;
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('Request Bounty', { body: alert });
                }
                tracked[id].alerted = true;
                saveTracked(tracked);
            }
        });
    }

    function updateTrackedCount() {
        let badge = document.getElementById('rt-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'rt-badge';
            badge.style.cssText = 'background:#e94560; color:#fff; font-size:10px; font-weight:bold; padding:1px 5px; border-radius:8px; margin-left:6px;';
            const header = document.querySelector('h1, .panel__heading');
            if (header) header.appendChild(badge);
        }
        const count = Object.keys(getTracked()).length;
        badge.textContent = count;
    }

    function injectDashboard() {
        if (document.querySelector('.rt-dashboard')) return;

        const page = document.querySelector('.panelV2, .data-table-wrapper');
        if (!page) return;

        const tracked = getTracked();
        const trackedList = Object.values(tracked);

        if (trackedList.length === 0) return;

        const sorted = trackedList.sort((a, b) => b.bounty - a.bounty);

        const dash = document.createElement('div');
        dash.className = 'rt-dashboard';
        dash.style.cssText = 'background:#0a0a23; border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px; font-family:sans-serif; font-size:13px;';
        dash.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                <strong style="color:#e94560;">★ Tracked Requests (${trackedList.length})</strong>
                <button id="rt-expand" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:12px;">Show/Hide</button>
            </div>
            <div id="rt-list" style="display:none;">
                <div style="display:flex; gap:8px; margin-bottom:8px;">
                    <button id="rt-filter-all" class="rt-filter-btn" style="padding:3px 8px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:11px;">All</button>
                    <button id="rt-filter-unfilled" class="rt-filter-btn" style="padding:3px 8px; background:#16213e; color:#aaa; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:11px;">Unfilled</button>
                    <button id="rt-filter-claimed" class="rt-filter-btn" style="padding:3px 8px; background:#16213e; color:#aaa; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:11px;">Claimed</button>
                    <button id="rt-filter-filled" class="rt-filter-btn" style="padding:3px 8px; background:#16213e; color:#aaa; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:11px;">Filled</button>
                </div>
                <div id="rt-tracked-list" style="max-height:200px; overflow-y:auto;">
                    ${sorted.map(r => `
                        <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 0; border-bottom:1px solid #333;" data-status="${r.status}">
                            <a href="/requests/${r.id}" style="color:#4fc3f7; text-decoration:none; flex:1;">${r.name}</a>
                            <span style="color:#66ff66; margin-left:8px; font-weight:bold;">${r.bounty} BON</span>
                            <span style="color:#888; margin-left:8px; font-size:11px;">${r.votes} votes</span>
                            <button class="rt-untrack" data-id="${r.id}" style="background:#500; color:#f66; border:none; cursor:pointer; font-size:11px; margin-left:8px;">✕</button>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        page.parentNode.insertBefore(dash, page);

        document.getElementById('rt-expand').addEventListener('click', () => {
            const list = document.getElementById('rt-list');
            list.style.display = list.style.display === 'none' ? 'block' : 'none';
        });

        document.querySelectorAll('.rt-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rt-filter-btn').forEach(b => {
                    b.style.background = '#16213e';
                    b.style.color = '#aaa';
                });
                btn.style.background = '#0f3460';
                btn.style.color = '#fff';

                const filter = btn.id.replace('rt-filter-', '');
                document.querySelectorAll('#rt-tracked-list > div').forEach(row => {
                    if (filter === 'all') {
                        row.style.display = '';
                    } else {
                        row.style.display = row.dataset.status === filter ? '' : 'none';
                    }
                });
            });
        });

        dash.querySelectorAll('.rt-untrack').forEach(btn => {
            btn.addEventListener('click', () => {
                const t = getTracked();
                delete t[btn.dataset.id];
                saveTracked(t);
                btn.closest('div').remove();
                updateTrackedCount();
            });
        });
    }

    function injectSettingsPanel() {
        if (document.querySelector('.rt-settings')) return;

        const panel = document.createElement('div');
        panel.id = 'rt-panel';
        panel.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:99999; background:#1a1a2e; color:#fff; border:1px solid #444; border-radius:8px; padding:16px; font-family:sans-serif; font-size:13px; display:none; min-width:300px;';
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.className = 'rt-settings';
        btn.textContent = '★ Request Settings';
        btn.style.cssText = 'font-size:10px; padding:2px 6px; background:#16213e; color:#aaa; border:1px solid #555; border-radius:3px; cursor:pointer; margin-left:8px;';
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            render();
        });

        const header = document.querySelector('h1, .panel__heading');
        if (header) header.appendChild(btn);

        function render() {
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                    <strong>Request Tracker Settings</strong>
                    <button id="rt-close" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:18px;">&times;</button>
                </div>
                <div style="margin-bottom:12px;">
                    <label>Bounty alert threshold (BON):</label>
                    <input type="number" id="rt-threshold" value="${getAlertThreshold()}" min="0"
                        style="width:80px; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; margin-left:8px;" />
                    <div style="font-size:11px; color:#888;">Notify when a tracked request reaches this bounty</div>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" id="rt-auto-vote" ${isAutoVoteEnabled() ? 'checked' : ''} style="cursor:pointer;" />
                    <span>Auto-vote on unfilled requests</span>
                </label>
                <div style="margin-bottom:12px;">
                    <label>Min bounty for auto-vote:</label>
                    <input type="number" id="rt-auto-min" value="${getAutoVoteMin()}" min="1"
                        style="width:80px; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; margin-left:8px;" />
                </div>
                <button id="rt-save" style="width:100%; padding:6px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:4px; cursor:pointer; font-size:12px;">Save</button>
            `;
            document.getElementById('rt-close').addEventListener('click', () => panel.style.display = 'none');
            document.getElementById('rt-save').addEventListener('click', () => {
                setAlertThreshold(parseInt(document.getElementById('rt-threshold').value) || 0);
                setAutoVote(document.getElementById('rt-auto-vote').checked);
                setAutoVoteMin(parseInt(document.getElementById('rt-auto-min').value) || 100);
                panel.style.display = 'none';
                checkBountyAlerts();
            });
        }
    }

    function runAll() {
        addTrackButtons();
        updateTrackedCount();
        checkBountyAlerts();
        injectDashboard();
        injectSettingsPanel();
    }

    const obs = new MutationObserver(runAll);
    obs.observe(document.body, { childList: true, subtree: true });
    runAll();
})();
