// ==UserScript==
// @name         UNIT3D Bonus Optimizer
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Optimize bonus point spending: value ratings, best deals, earning history, BON/hour.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bonus-optimizer.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bonus-optimizer.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_HISTORY = 'bo_history';
    const STORAGE_KEY_PREFERENCES = 'bo_prefs';

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    function parseBytes(str) {
        if (!str) return 0;
        const match = str.match(/([\d.]+)\s*(B|KB|MB|GB|TB)/i);
        if (!match) return 0;
        const val = parseFloat(match[1]);
        const unit = match[2].toUpperCase();
        const multipliers = { 'B': 1, 'KB': 1024, 'MB': 1048576, 'GB': 1073741824, 'TB': 1099511627776 };
        return val * (multipliers[unit] || 1);
    }

    function getItemValue(item) {
        const desc = (item.description || '').toLowerCase();
        const value = item.value || 0;
        const cost = item.cost || 0;

        if (cost === 0) return 0;

        if (item.upload) {
            return value / cost;
        }
        if (item.download) {
            return value / cost;
        }
        if (item.personal_freeleech) {
            return 5000000000 / cost;
        }
        if (item.invite) {
            return 10000000000 / cost;
        }

        if (desc.includes('upload')) {
            return value / cost;
        }
        if (desc.includes('download')) {
            return value / cost;
        }
        if (desc.includes('freeleech') || desc.includes('free leech')) {
            return 5000000000 / cost;
        }
        if (desc.includes('invite')) {
            return 10000000000 / cost;
        }

        return value / cost;
    }

    function getItemType(item) {
        const desc = (item.description || '').toLowerCase();
        if (item.upload || desc.includes('upload')) return 'Upload Credit';
        if (item.download || desc.includes('download')) return 'Download Credit';
        if (item.personal_freeleech || desc.includes('freeleech') || desc.includes('free leech')) return 'Personal Freeleech';
        if (item.invite || desc.includes('invite')) return 'Invite';
        return 'Unknown';
    }

    function getValueRating(valuePerBON, itemType) {
        const benchmarks = {
            'Upload Credit': { good: 1000000, excellent: 5000000 },
            'Download Credit': { good: 1000000, excellent: 5000000 },
            'Personal Freeleech': { good: 5000000000, excellent: 20000000000 },
            'Invite': { good: 10000000000, excellent: 50000000000 },
        };

        const bench = benchmarks[itemType] || { good: 1000, excellent: 10000 };
        if (valuePerBON >= bench.excellent) return { label: '★★★', color: '#66ff66' };
        if (valuePerBON >= bench.good) return { label: '★★', color: '#ffcc00' };
        return { label: '★', color: '#ff9900' };
    }

    function injectStoreEnhancements() {
        if (!window.location.pathname.includes('/transactions/create') && !window.location.pathname.includes('/store')) return;
        if (document.querySelector('.bo-enhanced')) return;

        const table = document.querySelector('.data-table');
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr');
        const items = [];

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 2) return;

            const desc = cells[0]?.textContent?.trim() || '';
            const costText = cells[1]?.textContent?.trim() || '';
            const cost = parseInt(costText.replace(/[^\d]/g, ''), 10);

            const item = { description: desc, cost, value: 0, upload: false, download: false, personal_freeleech: false, invite: false };
            const descLower = desc.toLowerCase();

            if (descLower.includes('upload')) {
                item.upload = true;
                const match = desc.match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
                if (match) item.value = parseBytes(match[0]);
            } else if (descLower.includes('download')) {
                item.download = true;
                const match = desc.match(/([\d.]+)\s*(KB|MB|GB|TB)/i);
                if (match) item.value = parseBytes(match[0]);
            } else if (descLower.includes('freeleech')) {
                item.personal_freeleech = true;
                item.value = 1;
            } else if (descLower.includes('invite')) {
                item.invite = true;
                const match = desc.match(/(\d+)/);
                if (match) item.value = parseInt(match[1], 10);
            }

            items.push({ ...item, row });
        });

        const bonText = document.querySelector('.panel__heading, .panelV2')?.textContent?.match(/([\d,]+)\s*(?:BON|bonus)/i);
        const currentBon = bonText ? parseInt(bonText[1].replace(/,/g, ''), 10) : 0;

        items.forEach(item => {
            if (!item.row || item.cost === 0) return;
            const vpB = getItemValue(item);
            const itemType = getItemType(item);
            const rating = getValueRating(vpB, itemType);

            const badge = document.createElement('span');
            badge.className = 'bo-badge';
            badge.style.cssText = `font-size:10px; padding:1px 5px; margin-left:6px; border-radius:3px; font-weight:bold; color:${rating.color}; background:#1a1a2e; border:1px solid ${rating.color};`;
            badge.textContent = rating.label;
            badge.title = `Value: ${vpB.toFixed(0)} per BON`;
            item.row.querySelector('td')?.appendChild(badge);

            if (currentBon > 0 && item.cost > currentBon) {
                item.row.style.opacity = '0.5';
                item.row.title = `You need ${item.cost - currentBon} more BON`;
            }

            const valueCell = document.createElement('td');
            valueCell.className = 'bo-value';
            valueCell.style.cssText = 'font-size:11px; color:#888;';
            valueCell.textContent = `${vpB.toFixed(0)}/BON`;
            if (item.row.querySelector('td:last-child')?.querySelector('button, form')) {
                item.row.insertBefore(valueCell, item.row.querySelector('td:last-child'));
            }
        });

        if (items.length > 0) {
            const sorted = [...items].filter(i => i.cost > 0).sort((a, b) => getItemValue(b) - getItemValue(a));
            if (sorted.length > 0) {
                const best = sorted[0];
                const bestRow = best.row;
                if (bestRow) {
                    bestRow.style.background = '#0a2e0a';
                    const bestBadge = document.createElement('td');
                    bestBadge.style.cssText = 'font-size:10px; color:#66ff66; font-weight:bold;';
                    bestBadge.textContent = '← BEST VALUE';
                    bestRow.appendChild(bestBadge);
                }
            }
        }

        const header = table.querySelector('thead tr');
        if (header) {
            const th = document.createElement('th');
            th.textContent = 'Value';
            const cells = header.querySelectorAll('th');
            if (cells.length >= 2) header.insertBefore(th, cells[cells.length - 1]);
        }

        const panel = document.querySelector('.bo-enhanced') || document.createElement('div');
        panel.className = 'bo-enhanced';
        panel.style.cssText = 'background:#0a0a23; border:1px solid #444; border-radius:8px; padding:12px; margin-bottom:16px; font-family:sans-serif; font-size:13px;';

        const sorted = [...items].filter(i => i.cost > 0).sort((a, b) => getItemValue(b) - getItemValue(a));
        panel.innerHTML = `
            <div style="margin-bottom:8px;"><strong style="color:#66ff66;">★ Bonus Optimizer</strong></div>
            <div style="font-size:12px; color:#aaa;">
                ${currentBon > 0 ? `<div>Current BON: <strong style="color:#ffcc00;">${currentBon.toLocaleString()}</strong></div>` : ''}
                <div style="margin-top:6px;">
                    <strong>Best Deals:</strong>
                    ${sorted.slice(0, 3).map((item, i) => {
            const vpB = getItemValue(item);
            const itemType = getItemType(item);
            const rating = getValueRating(vpB, itemType);
            const canAfford = currentBon >= item.cost;
            return `<div style="padding:2px 0; ${canAfford ? '' : 'opacity:0.5;'}">
                                ${i + 1}. ${item.description} (${item.cost} BON) <span style="color:${rating.color};">${rating.label}</span>
                                ${canAfford ? '<span style="color:#66ff66;"> ✓</span>' : ''}
                            </div>`;
        }).join('')}
                </div>
                <div style="margin-top:6px; font-size:11px; color:#888;">
                    ★ = Good value, ★★ = Very good, ★★★ = Excellent
                </div>
            </div>
        `;

        const tableParent = table.closest('.panelV2, section') || table.parentNode;
        if (tableParent) tableParent.parentNode?.insertBefore(panel, tableParent);
    }

    function recordBonHistory() {
        const bonText = document.body.textContent.match(/([\d,]+)\s*(?:BON|bonus)/i);
        if (!bonText) return;
        const bon = parseInt(bonText[1].replace(/,/g, ''), 10);
        if (isNaN(bon)) return;

        try {
            const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
            const now = Date.now();
            const last = history[history.length - 1];
            if (last && Math.abs(last.date - now) < 3600000) {
                last.bon = bon;
            } else {
                history.push({ bon, date: now });
            }
            localStorage.setItem(STORAGE_KEY_HISTORY, JSON.stringify(history.slice(-500)));
        } catch { }
    }

    function calculateBonPerHour() {
        try {
            const history = JSON.parse(localStorage.getItem(STORAGE_KEY_HISTORY)) || [];
            if (history.length < 2) return null;

            const recent = history.slice(-20);
            const first = recent[0];
            const last = recent[recent.length - 1];
            const hours = (last.date - first.date) / 3600000;

            if (hours < 0.1) return null;
            return (last.bon - first.bon) / hours;
        } catch { return null; }
    }

    function injectBonRate() {
        if (document.querySelector('.bo-rate')) return;

        const rate = calculateBonPerHour();
        if (rate === null) return;

        const sidebar = document.querySelector('.sidebar, aside, .panelV2:last-child');
        if (!sidebar) return;

        const el = document.createElement('div');
        el.className = 'bo-rate';
        el.style.cssText = 'padding:8px; font-family:sans-serif; font-size:12px;';
        el.innerHTML = `
            <div style="background:#0a0a23; border:1px solid #444; border-radius:6px; padding:8px;">
                <div style="color:#ffcc00; font-weight:bold;">BON Earning Rate</div>
                <div style="font-size:18px; color:#66ff66; margin-top:4px;">${rate.toFixed(1)} <span style="font-size:11px; color:#888;">BON/hr</span></div>
                <div style="font-size:10px; color:#666; margin-top:2px;">Based on recent history</div>
            </div>
        `;
        sidebar.appendChild(el);
    }

    function runAll() {
        injectStoreEnhancements();
        injectBonRate();
        recordBonHistory();
    }

    const obs = new MutationObserver(runAll);
    obs.observe(document.body, { childList: true, subtree: true });
    runAll();
})();
