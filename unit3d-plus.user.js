// ==UserScript==
// @name         UNIT3D++
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.2.2
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

    // UNT3D v8+ moved the navbar stats from the old `.badge-user` badges into the
    // `.top-nav__ratio-bar` list, each stat in its own `.ratio-bar__*` element.
    // There is no longer a "warnings" stat element in the navbar.
    const STAT_CONFIG = [
        { name: 'upload', selector: '.ratio-bar__uploaded' },
        { name: 'download', selector: '.ratio-bar__downloaded' },
        { name: 'buffer', selector: '.ratio-bar__buffer' },
        { name: 'bon', selector: '.ratio-bar__points' },
        { name: 'ratio', selector: '.ratio-bar__ratio' },
        { name: 'tokens', selector: '.ratio-bar__tokens' }
    ];

    const TRANSFER_UNITS = ['upload', 'download', 'buffer'];

    const HISTORY_KEY = 'u3d-stats-history';
    const HISTORY_MAX = 365;
    const HISTORY_INTERVAL = 6 * 60 * 60 * 1000;

    function parseTransferValue(text) {
        const cleaned = text.replace(/,/g, '').replace(/[^0-9.\-]/g, ' ').trim();
        const num = parseFloat(cleaned);
        if (isNaN(num)) return 0;
        if (text.includes('TiB')) return num * 1024;
        if (text.includes('GiB')) return num;
        if (text.includes('MiB')) return num / 1024;
        if (text.includes('KiB')) return num / (1024 * 1024);
        if (text.includes('B') && !text.includes('iB')) return num / (1024 * 1024 * 1024);
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

    function loadHistory() {
        try {
            const stored = JSON.parse(localStorage.getItem(HISTORY_KEY));
            if (stored && typeof stored === 'object') return stored;
        } catch (e) { /* ignore */ }
        return {};
    }

    function saveHistory(history) {
        try {
            const timestamps = Object.keys(history).sort((a, b) => b - a);
            if (timestamps.length > HISTORY_MAX) {
                for (const ts of timestamps.slice(HISTORY_MAX)) delete history[ts];
            }
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch (e) { /* ignore */ }
    }

    function renderSparkline(data, width = 100, height = 20, color = '#2ecc71') {
        if (!data || data.length < 2) return '';
        const values = data.map(d => d.value);
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const points = values.map((v, i) => {
            const x = (i / (values.length - 1)) * width;
            const y = height - ((v - min) / range) * (height - 4) - 2;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const areaPoints = [`0,${height}`, ...points, `${width},${height}`].join(' ');
        return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="vertical-align:middle;">
            <polygon points="${areaPoints}" fill="${color}" opacity="0.15"/>
            <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
            <circle cx="${points[points.length - 1].split(',')[0]}" cy="${points[points.length - 1].split(',')[1]}" r="2" fill="${color}"/>
        </svg>`;
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
        const stats = STAT_CONFIG
            .map(s => ({ name: s.name, el: document.querySelector(s.selector) }))
            .filter(s => s.el);
        if (stats.length < 2) return;

        const history = loadHistory();
        const now = Date.now();
        const lastTs = Object.keys(history).sort((a, b) => b - a)[0];
        const snapshot = {};

        stats.forEach(({ name, el }) => {
            try {
                const storedValue = localStorage.getItem(name);
                const currentValue = el.textContent;
                const numValue = parseStatValue(currentValue, name);

                snapshot[name] = numValue;

                if (storedValue !== null) {
                    const prevValue = parseFloat(storedValue);
                    const change = numValue - prevValue;

                    if (change !== 0 && !Number.isNaN(change)) {
                        const span = document.createElement('span');
                        span.textContent = ` ${formatChange(change, name)}`;
                        span.style.color = getChangeColor(change, name);
                        el.appendChild(span);
                    }
                }

                localStorage.setItem(name, String(numValue));
            } catch (e) {
                // Skip this stat on error
            }
        });

        if (!lastTs || (now - parseInt(lastTs)) >= HISTORY_INTERVAL) {
            history[String(now)] = snapshot;
            saveHistory(history);
        }

        const timestamps = Object.keys(history).sort((a, b) => a - b).slice(-30);
        if (timestamps.length >= 2) {
            stats.forEach(({ name, el }) => {
                if (!TRANSFER_UNITS.includes(name)) return;
                if (!el || el.querySelector('svg')) return;

                const chartData = timestamps.map(ts => ({
                    timestamp: parseInt(ts),
                    value: history[ts]?.[name] || 0
                }));
                const color = getChangeColor(0, name);
                const svg = renderSparkline(chartData, 100, 20, color);
                if (svg) {
                    const container = document.createElement('span');
                    container.innerHTML = svg;
                    container.style.cssText = 'margin-left:6px;vertical-align:middle;cursor:help;';
                    const last5 = chartData.slice(-5);
                    container.title = `Trend (last ${chartData.length} snapshots)\n${last5.map(d => `${new Date(d.timestamp).toLocaleDateString()}: ${d.value.toFixed(2)} GiB`).join('\n')}`;
                    el.appendChild(container);
                }
            });
        }
    }

    function randomTorrent() {
        try {
            const buttons = document.querySelector('.torrent-search__results .panel__actions, .panel__header .panel__actions');
            if (!buttons) return;

            const table = document.querySelector('table.data-table');
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

            const randomAction = document.createElement('div');
            randomAction.className = 'panel__action';

            const randomButton = document.createElement('a');
            randomButton.href = `${baseUrl}/torrents/${randomId}`;
            randomButton.textContent = '? Random Torrent';
            randomButton.className = 'form__button form__button--text';
            randomButton.title = 'Open a random torrent';

            randomAction.appendChild(randomButton);
            buttons.appendChild(randomAction);
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
            this.tableSelector = 'table.data-table, .torrents__torrents, .table-torrents';
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

    function bustAvatarCache() {
        if (localStorage.getItem('u3d_avatar_cache_bust') !== 'true') return;

        const selectors = [
            'img[src*="/authenticated-images/user-avatars/"]',
            'img[src*="/avatars/"]',
            '.chatbox-message__avatar',
            '.torrent-search--list__uploader img'
        ];
        const seen = new Set();
        for (const sel of selectors) {
            document.querySelectorAll(sel).forEach(img => {
                const src = img.getAttribute('src');
                if (!src || seen.has(src) || src.includes('?cb=') || src.startsWith('data:') || src.startsWith('blob:')) return;
                if (/default|no-avatar|anonymous/i.test(src)) return;
                if (/\?token=|signature=|expires=/i.test(src)) return;
                const sep = src.includes('?') ? '&' : '?';
                img.setAttribute('src', `${src}${sep}cb=${Date.now()}`);
                seen.add(src);
            });
        }
    }

    const runAll = () => {
        statsChange();
        bustAvatarCache();
        if (/\/torrents\/?$/.test(window.location.pathname)) {
            randomTorrent();
            filter.inject();
        }
    };

    runAll();
})();
