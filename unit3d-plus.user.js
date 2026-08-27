// ==UserScript==
// @name         UNIT3D++
// @description  Various QoL improvements for UNIT3D sites
// @version      1.0
// @author       Seraph2
// @match        https://*/torrents*
// @match        https://*/upload*
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

    statsChange();
    if (window.location.pathname.endsWith('/torrents')) {
        randomTorrent();
    }

    window.addEventListener('turbolinks:load', () => {
        statsChange();
        if (window.location.pathname.endsWith('/torrents')) {
            randomTorrent();
        }
    });
})();
