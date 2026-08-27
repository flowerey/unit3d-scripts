// ==UserScript==
// @name         UNIT3D++
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.1.1
// @description  Various QoL improvements for UNIT3D sites
// @author       blueberry
// @match        https://*/torrents*
// @match        https://*/upload*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/unit3d-plus.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/unit3d-plus.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STAT_NAMES = ['upload', 'download', 'ratio', 'buffer', 'warnings', 'bon', 'tokens'];

    const BADGE_SELECTORS = {
        upload: 0,
        download: 1,
        ratio: 2,
        buffer: 3,
        warnings: 4,
        bon: 5,
        tokens: 6
    };

    const TRANSFER_UNITS = ['upload', 'download', 'buffer'];

    function parseTransferValue(text) {
        const cleaned = text.replace(/[^0-9.\s]/g, ' ').trim();
        const num = parseFloat(cleaned);
        if (isNaN(num)) return 0;
        if (text.includes('TiB')) return num * 1024;
        if (text.includes('GiB')) return num;
        if (text.includes('MiB')) return num / 1024;
        return num;
    }

    function parseStatValue(text, name) {
        const cleaned = text.replace(/^\D+/g, '');
        if (TRANSFER_UNITS.includes(name)) {
            return parseTransferValue(cleaned);
        }
        if (name === 'bon') {
            return parseInt(cleaned.replace(/\s/g, ''), 10) || 0;
        }
        return parseFloat(cleaned) || 0;
    }

    function formatChange(change, name) {
        const isTransfer = TRANSFER_UNITS.includes(name);
        const isHigherBetter = ['upload', 'ratio', 'buffer', 'bon', 'tokens'].includes(name);
        const sign = change > 0 ? '+' : '';
        const unit = isTransfer ? ' GiB' : '';

        if (['warnings', 'tokens'].includes(name)) {
            return `${sign}${change.toPrecision(1)}`;
        }
        const formatted = Math.abs(change) < 1
            ? change.toFixed(1)
            : change.toFixed(2);
        return `${sign}${formatted}${unit}`;
    }

    function getChangeColor(change, name) {
        const isHigherBetter = ['upload', 'ratio', 'buffer', 'bon', 'tokens'].includes(name);
        const positive = change > 0;
        if (isHigherBetter) {
            return positive ? 'green' : 'red';
        }
        return positive ? 'red' : 'green';
    }

    function statsChange() {
        const badges = document.querySelectorAll('.badge-user');
        if (badges.length < 7) return;

        STAT_NAMES.forEach((name, i) => {
            try {
                const badge = badges[i];
                if (!badge) return;

                const storedValue = localStorage.getItem(name);
                const currentValue = badge.textContent;
                const numValue = parseStatValue(currentValue, name);

                if (storedValue !== null) {
                    const prevValue = parseFloat(storedValue);
                    const change = numValue - prevValue;

                    if (change !== 0) {
                        const span = document.createElement('span');
                        span.textContent = ` ${formatChange(change, name)}`;
                        span.style.color = getChangeColor(change, name);
                        badge.appendChild(span);
                    }
                }

                localStorage.setItem(name, String(numValue));
            } catch (e) {
                // Skip this stat on error
            }
        });
    }

    function randomTorrent() {
        try {
            const buttons = document.querySelector('.button-left');
            if (!buttons) return;

            const table = document.querySelector('#facetedSearch table, .table-torrents');
            if (!table) return;

            const rows = table.querySelectorAll('tr:not(.success)');
            if (rows.length === 0) return;

            const firstRow = rows[0];
            const link = firstRow.querySelector('a[href*="/torrents/"]');
            if (!link) return;

            const href = link.getAttribute('href');
            const idMatch = href.match(/\/torrents\/(\d+)/);
            if (!idMatch) return;

            const latestId = parseInt(idMatch[1], 10);
            const randomId = Math.floor(Math.random() * (latestId - 1)) + 1;
            const baseUrl = window.location.origin;

            const randomButton = document.createElement('a');
            randomButton.href = `${baseUrl}/torrents/${randomId}`;
            randomButton.textContent = '? Random Torrent';
            randomButton.className = 'btn btn-sm btn-warning';
            buttons.appendChild(randomButton);
        } catch (e) {
            // Silently fail
        }
    }

    const FILTER_CSS = `
        .unit3d-filter-bar {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            margin-left: 12px;
            vertical-align: middle;
        }
        .unit3d-filter-btn {
            padding: 4px 10px;
            border: 1px solid #444;
            border-radius: 4px;
            background: #1a1a1a;
            color: #aaa;
            font-size: 11px;
            cursor: pointer;
            transition: all 0.2s;
            white-space: nowrap;
        }
        .unit3d-filter-btn:hover {
            border-color: #2ecc71;
            color: #ddd;
        }
        .unit3d-filter-btn.active {
            background: #2ecc71;
            color: #fff;
            border-color: #2ecc71;
        }
        .unit3d-filter-count {
            font-size: 10px;
            color: #888;
            margin-left: 4px;
        }
    `;

    class TorrentFilter {
        constructor() {
            this.stylesInjected = false;
            this.activeFilter = null;
            this.tableSelector = '#facetedSearch table, .table-torrents, .torrents__torrents';
        }

        injectStyles() {
            if (this.stylesInjected) return;
            const style = document.createElement('style');
            style.textContent = FILTER_CSS;
            document.head.appendChild(style);
            this.stylesInjected = true;
        }

        getRows() {
            const table = document.querySelector(this.tableSelector);
            if (!table) return [];
            return Array.from(table.querySelectorAll('tbody tr'));
        }

        isFreeleech(row) {
            const fl = row.querySelector('.torrent-icons__freeleech');
            return !!fl;
        }

        isInternal(row) {
            const internal = row.querySelector('.torrent-icons__internal');
            return !!internal;
        }

        isDead(row) {
            const seederCell = row.querySelector('.torrent__seeder-count');
            if (!seederCell) return false;
            const text = seederCell.textContent.trim();
            const count = parseInt(text.replace(/[^0-9]/g, ''), 10);
            return count === 0;
        }

        applyFilter(type) {
            const rows = this.getRows();
            if (rows.length === 0) return;

            if (this.activeFilter === type) {
                this.activeFilter = null;
                rows.forEach(r => { r.style.display = ''; });
                this.updateButtons();
                return;
            }

            this.activeFilter = type;
            rows.forEach(row => {
                switch (type) {
                    case 'dead':
                    case 'alive':
                        row.style.display = (this.isDead(row) === (type === 'dead')) ? '' : 'none';
                        break;
                    case 'freeleech':
                        row.style.display = this.isFreeleech(row) ? '' : 'none';
                        break;
                    case 'internal':
                        row.style.display = this.isInternal(row) ? '' : 'none';
                        break;
                }
            });

            this.updateButtons();
        }

        updateButtons() {
            document.querySelectorAll('.unit3d-filter-btn').forEach(btn => {
                const type = btn.dataset.filter;
                btn.classList.toggle('active', type === this.activeFilter);
            });

            const countEl = document.querySelector('.unit3d-filter-count');
            if (countEl) {
                const visible = this.getRows().filter(r => r.style.display !== 'none').length;
                const total = this.getRows().length;
                countEl.textContent = this.activeFilter ? `${visible}/${total} shown` : '';
            }
        }

        inject() {
            this.injectStyles();
            const panel = document.querySelector('.panel__heading');
            if (!panel || document.getElementById('unit3d-filter-bar')) return;

            const bar = document.createElement('div');
            bar.id = 'unit3d-filter-bar';
            bar.className = 'unit3d-filter-bar';

            const filters = [
                { type: 'dead', label: '\u2620 Dead', title: 'Show only dead torrents (0 seeders)' },
                { type: 'alive', label: '\u2618 Alive', title: 'Show only torrents with seeders' },
                { type: 'freeleech', label: '\u2B50 Freeleech', title: 'Show only freeleech torrents' },
                { type: 'internal', label: '\u2605 Internal', title: 'Show only internal torrents' }
            ];

            filters.forEach(f => {
                const btn = document.createElement('button');
                btn.className = 'unit3d-filter-btn';
                btn.dataset.filter = f.type;
                btn.textContent = f.label;
                btn.title = f.title;
                btn.onclick = () => this.applyFilter(f.type);
                bar.appendChild(btn);
            });

            const countEl = document.createElement('span');
            countEl.className = 'unit3d-filter-count';
            bar.appendChild(countEl);

            panel.appendChild(bar);
        }
    }

    const filter = new TorrentFilter();

    const runAll = () => {
        statsChange();
        if (/\/torrents\/?$/.test(window.location.pathname)) {
            randomTorrent();
            filter.inject();
        }
    };

    runAll();
    window.addEventListener('turbolinks:load', runAll);
})();
