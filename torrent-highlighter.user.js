// ==UserScript==
// @name         UNIT3D Torrent Highlighter
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.3
// @description  UNIT3D torrent row highlighting and visual enhancements.
// @author       blueberry
// @match        https://*/torrents/*
// @match        https://*/torrents/similar/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'unit3d-highlighter-settings';

    const DEFAULT_SETTINGS = {
        colors: {
            internal: '#2D1E3A',
            freeleech: '#3D351B',
            doubleUpload: '#1D343D',
            highSpeed: '#3D1B1D',
            seeding: '#1F2D1F',
            lowSeeders: '#3D1B1D'
        },
        minSeeders: 3,
        enableInternal: true,
        enableFreeleech: true,
        enableDoubleUpload: true,
        enableHighSpeed: true,
        enableSeeding: true,
        enableLowSeeders: true,
        throttleMs: 100
    };

    function loadSettings() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...stored, colors: { ...DEFAULT_SETTINGS.colors, ...stored.colors } };
            }
        } catch (e) { /* ignore */ }
        return { ...DEFAULT_SETTINGS };
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        } catch (e) { /* ignore */ }
    }

    let settings = loadSettings();

    const CSS = `
        .unit3d-name-badge {
            padding: 2px 8px;
            border-radius: 4px;
            color: #fff !important;
            display: inline-block;
            transition: background 0.2s ease;
            box-shadow: 0 1px 3px rgba(0,0,0,0.4);
        }

        .unit3d-internal-sparkle {
            background-image: url('/img/sparkels.gif');
            background-repeat: repeat;
        }

        .unit3d-icon-pulse {
            animation: unit3d-pulse 2s ease-in-out infinite;
        }
        @keyframes unit3d-pulse {
            0%, 100% { opacity: 0.7; }
            50% { opacity: 1; }
        }

        .unit3d-trump-alert {
            display: inline-flex !important;
            margin-left: 8px;
            animation: unit3d-trump 2s ease-in-out infinite;
        }
        @keyframes unit3d-trump {
            0%, 100% { filter: drop-shadow(0 0 1px rgba(255,71,87,0.3)); }
            50% { filter: drop-shadow(0 0 4px rgba(255,71,87,0.5)); }
        }

        .unit3d-settings-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #1a1a1a;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 24px;
            z-index: 30000;
            color: #ddd;
            font-family: system-ui, sans-serif;
            min-width: 340px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }
        .unit3d-settings-overlay {
            position: fixed;
            top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.7);
            z-index: 29999;
        }
        .unit3d-settings-panel h3 {
            margin: 0 0 16px 0;
            color: #fff;
            border-bottom: 1px solid #333;
            padding-bottom: 10px;
        }
        .unit3d-settings-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }
        .unit3d-settings-row label {
            font-size: 13px;
        }
        .unit3d-settings-row input[type="color"] {
            width: 32px;
            height: 24px;
            border: 1px solid #444;
            border-radius: 4px;
            background: none;
            cursor: pointer;
        }
        .unit3d-settings-row input[type="number"] {
            width: 60px;
            padding: 4px 8px;
            border: 1px solid #444;
            border-radius: 4px;
            background: #111;
            color: #ddd;
            font-size: 12px;
        }
        .unit3d-settings-row input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .unit3d-settings-save {
            margin-top: 16px;
            padding: 8px 20px;
            background: #2ecc71;
            color: #fff;
            border: none;
            border-radius: 4px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
        }
        .unit3d-settings-save:hover { background: #27ae60; }
        .unit3d-hl-settings-btn {
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #333;
            color: #aaa;
            border: 1px solid #555;
            font-size: 16px;
            cursor: pointer;
            z-index: 25000;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }
        .unit3d-hl-settings-btn:hover {
            background: #2ecc71;
            color: #fff;
            border-color: #2ecc71;
        }
    `;

    class Highlighter {
        constructor() {
            this.throttleTimer = null;
            this.observer = null;
            this.init();
        }

        init() {
            const style = document.createElement('style');
            style.textContent = CSS;
            document.head.appendChild(style);

            this.process();
            this.setupObserver();
            this.injectSettingsButton();
            window.addEventListener('turbolinks:load', () => this.process());
        }

        setupObserver() {
            if (this.observer) this.observer.disconnect();

            this.observer = new MutationObserver(() => {
                if (this.throttleTimer) return;
                this.throttleTimer = setTimeout(() => {
                    this.process();
                    this.throttleTimer = null;
                }, settings.throttleMs);
            });
            this.observer.observe(document.body, { childList: true, subtree: true });
        }

        process() {
            const rows = document.querySelectorAll('tr.torrent-search--list__no-poster-row, tr:has(.torrent-search--grouped__overview)');

            rows.forEach(row => {
                this.highlightRow(row);
                this.handleInternal(row);
                this.handleTrump(row);
                this.animateIcons(row);
                this.handleLowSeeders(row);
            });
        }

        highlightRow(row) {
            if (row.dataset.hiChecked) return;

            const icons = row.querySelector('.torrent-icons');
            if (!icons) return;

            const nameEl = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
            if (!nameEl) return;

            const statuses = [
                { id: 'int', color: settings.colors.internal, icon: '.torrent-icons__internal', check: () => true, enabled: settings.enableInternal },
                { id: 'fl', color: settings.colors.freeleech, icon: '.torrent-icons__freeleech', check: (el) => el.title.includes('100% Free') || el.title.includes('Global Freeleech'), enabled: settings.enableFreeleech },
                { id: 'du', color: settings.colors.doubleUpload, icon: '.torrent-icons__double-upload', check: () => true, enabled: settings.enableDoubleUpload },
                { id: 'hs', color: settings.colors.highSpeed, icon: '.torrent-icons__highspeed', check: () => true, enabled: settings.enableHighSpeed }
            ];

            const active = statuses.filter(s => {
                if (!s.enabled) return false;
                const el = icons.querySelector(s.icon);
                return el && s.check(el);
            });

            const seeding = row.querySelector('.torrent__seeder-count.text-success');
            if (active.length === 0 && seeding && settings.enableSeeding) {
                active.push({ id: 'sd', color: settings.colors.seeding });
            }

            if (active.length > 0) {
                const primaryColor = active[0].color;
                nameEl.classList.add('unit3d-name-badge');
                nameEl.style.backgroundColor = primaryColor;
            }

            row.dataset.hiChecked = "true";
        }

        handleLowSeeders(row) {
            if (!settings.enableLowSeeders || settings.minSeeders <= 0) return;

            const seederCell = row.querySelector('.torrent__seeder-count');
            if (!seederCell) return;

            const text = seederCell.textContent.trim();
            const count = parseInt(text.replace(/[^0-9]/g, ''), 10);

            if (count > 0 && count <= settings.minSeeders) {
                seederCell.style.color = '#e74c3c';
                seederCell.style.fontWeight = 'bold';
                seederCell.title = `Low seeders (${count} <= ${settings.minSeeders})`;
            }
        }

        handleInternal(row) {
            const internal = row.querySelector('.torrent-icons__internal');
            if (internal && !internal.dataset.styled) {
                const name = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
                if (name) name.classList.add('unit3d-internal-sparkle');
                internal.style.color = '#fff';
                internal.dataset.styled = "true";
            }
        }

        handleTrump(row) {
            const trump = row.querySelector('.torrent-icons__torrent-trump');
            if (trump && !trump.dataset.moved) {
                const target = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
                if (target) {
                    target.insertAdjacentElement('afterend', trump);
                    trump.classList.add('unit3d-trump-alert');
                    trump.dataset.moved = "true";
                }
            }
        }

        animateIcons(row) {
            const specialIcons = [
                '.torrent-icons__internal',
                '.torrent-icons__freeleech',
                '.torrent-icons__double-upload',
                '.torrent-icons__highspeed'
            ];

            for (const selector of specialIcons) {
                const icon = row.querySelector(selector);
                if (icon && !icon.classList.contains('unit3d-icon-pulse')) {
                    icon.classList.add('unit3d-icon-pulse');
                }
            }
        }

        injectSettingsButton() {
            if (document.getElementById('unit3d-hl-settings-btn')) return;

            const btn = document.createElement('button');
            btn.id = 'unit3d-hl-settings-btn';
            btn.className = 'unit3d-hl-settings-btn';
            btn.title = 'Highlighter Settings';
            btn.textContent = '\u2699';
            btn.onclick = () => this.openSettings();
            document.body.appendChild(btn);
        }

        openSettings() {
            if (document.querySelector('.unit3d-settings-overlay')) return;

            const overlay = document.createElement('div');
            overlay.className = 'unit3d-settings-overlay';
            overlay.onclick = () => overlay.remove();

            const panel = document.createElement('div');
            panel.className = 'unit3d-settings-panel';
            panel.onclick = (e) => e.stopPropagation();

            const colorKeys = [
                { key: 'internal', label: 'Internal' },
                { key: 'freeleech', label: 'Freeleech' },
                { key: 'doubleUpload', label: 'Double Upload' },
                { key: 'highSpeed', label: 'High Speed' },
                { key: 'seeding', label: 'Seeding' },
                { key: 'lowSeeders', label: 'Low Seeders' }
            ];

            const toggleKeys = [
                { key: 'enableInternal', label: 'Internal highlight' },
                { key: 'enableFreeleech', label: 'Freeleech highlight' },
                { key: 'enableDoubleUpload', label: 'Double Upload highlight' },
                { key: 'enableHighSpeed', label: 'High Speed highlight' },
                { key: 'enableSeeding', label: 'Seeding highlight' },
                { key: 'enableLowSeeders', label: 'Low seeder warning' }
            ];

            panel.innerHTML = `
                <h3>Highlighter Settings</h3>
                ${colorKeys.map(c => `
                    <div class="unit3d-settings-row">
                        <label>${c.label}</label>
                        <input type="color" data-color="${c.key}" value="${settings.colors[c.key]}">
                    </div>
                `).join('')}
                <div class="unit3d-settings-row">
                    <label>Min Seeders (warn below)</label>
                    <input type="number" id="unit3d-min-seeders" value="${settings.minSeeders}" min="0" max="50">
                </div>
                <hr style="border-color:#333; margin: 12px 0;">
                ${toggleKeys.map(t => `
                    <div class="unit3d-settings-row">
                        <label>${t.label}</label>
                        <input type="checkbox" data-toggle="${t.key}" ${settings[t.key] ? 'checked' : ''}>
                    </div>
                `).join('')}
                <button class="unit3d-settings-save">Save</button>
            `;

            panel.querySelector('.unit3d-settings-save').onclick = () => {
                colorKeys.forEach(c => {
                    const input = panel.querySelector(`[data-color="${c.key}"]`);
                    if (input) settings.colors[c.key] = input.value;
                });

                toggleKeys.forEach(t => {
                    const input = panel.querySelector(`[data-toggle="${t.key}"]`);
                    if (input) settings[t.key] = input.checked;
                });

                const minInput = panel.querySelector('#unit3d-min-seeders');
                if (minInput) settings.minSeeders = parseInt(minInput.value, 10) || 0;

                saveSettings(settings);

                document.querySelectorAll('tr[data-hi-checked]').forEach(row => {
                    delete row.dataset.hiChecked;
                    const nameEl = row.querySelector('.unit3d-name-badge');
                    if (nameEl) {
                        nameEl.classList.remove('unit3d-name-badge');
                        nameEl.style.backgroundColor = '';
                    }
                });

                this.process();
                overlay.remove();
            };

            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        }
    }

    let currentInstance = null;

    const start = () => {
        if (currentInstance && currentInstance.observer) {
            currentInstance.observer.disconnect();
            currentInstance.observer = null;
        }
        currentInstance = new Highlighter();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('turbolinks:load', start);
})();
