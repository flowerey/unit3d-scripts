// ==UserScript==
// @name         UNIT3D Torrent Highlighter
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.4.1
// @description  UNIT3D torrent row highlighting and visual enhancements.
// @author       blueberry
// @match        https://*/torrents/*
// @match        https://*/torrents/similar/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/torrent-highlighter.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/torrent-highlighter.user.js.meta.js
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
            lowSeeders: '#3D1B1D',
            uploaderHighlight: '#2D3A1E',
            selfUpload: '#1E2D3A'
        },
        minSeeders: 3,
        enableInternal: true,
        enableFreeleech: true,
        enableDoubleUpload: true,
        enableHighSpeed: true,
        enableSeeding: true,
        enableLowSeeders: true,
        enableLanguageFlags: true,
        enableUploaderHighlight: true,
        enableSelfUpload: false,
        highlightedUploaders: [],
        currentUsername: '',
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

    const LANGUAGE_FLAGS = {
        'english': '\u{1F1FA}\u{1F1F8}', 'eng': '\u{1F1FA}\u{1F1F8}',
        'french': '\u{1F1EB}\u{1F1F7}', 'fre': '\u{1F1EB}\u{1F1F7}', 'fran\u00e7ais': '\u{1F1EB}\u{1F1F7}',
        'german': '\u{1F1E9}\u{1F1EA}', 'ger': '\u{1F1E9}\u{1F1EA}', 'deutsch': '\u{1F1E9}\u{1F1EA}',
        'spanish': '\u{1F1EA}\u{1F1F8}', 'spa': '\u{1F1EA}\u{1F1F8}', 'espa\u00f1ol': '\u{1F1EA}\u{1F1F8}',
        'italian': '\u{1F1EE}\u{1F1F9}', 'ita': '\u{1F1EE}\u{1F1F9}',
        'portuguese': '\u{1F1E7}\u{1F1F7}', 'por': '\u{1F1E7}\u{1F1F7}',
        'japanese': '\u{1F1EF}\u{1F1F5}', 'jpn': '\u{1F1EF}\u{1F1F5}',
        'korean': '\u{1F1F0}\u{1F1F7}', 'kor': '\u{1F1F0}\u{1F1F7}',
        'chinese': '\u{1F1E8}\u{1F1F3}', 'chi': '\u{1F1E8}\u{1F1F3}', 'zho': '\u{1F1E8}\u{1F1F3}',
        'russian': '\u{1F1F7}\u{1F1FA}', 'rus': '\u{1F1F7}\u{1F1FA}',
        'dutch': '\u{1F1F3}\u{1F1F1}', 'dut': '\u{1F1F3}\u{1F1F1}', 'nld': '\u{1F1F3}\u{1F1F1}',
        'swedish': '\u{1F1F8}\u{1F1EA}', 'swe': '\u{1F1F8}\u{1F1EA}',
        'turkish': '\u{1F1F9}\u{1F1F7}', 'tur': '\u{1F1F9}\u{1F1F7}',
        'polish': '\u{1F1F5}\u{1F1F1}', 'pol': '\u{1F1F5}\u{1F1F1}',
        'czech': '\u{1F1E8}\u{1F1FF}', 'cze': '\u{1F1E8}\u{1F1FF}', 'ces': '\u{1F1E8}\u{1F1FF}',
        'danish': '\u{1F1E9}\u{1F1F0}', 'dan': '\u{1F1E9}\u{1F1F0}',
        'finnish': '\u{1F1EB}\u{1F1EE}', 'fin': '\u{1F1EB}\u{1F1EE}',
        'norwegian': '\u{1F1F3}\u{1F1F4}', 'nor': '\u{1F1F3}\u{1F1F4}',
        'hungarian': '\u{1F1ED}\u{1F1FA}', 'hun': '\u{1F1ED}\u{1F1FA}',
        'romanian': '\u{1F1F7}\u{1F1F4}', 'rum': '\u{1F1F7}\u{1F1F4}',
        'greek': '\u{1F1EC}\u{1F1F7}', 'gre': '\u{1F1EC}\u{1F1F7}',
        'arabic': '\u{1F1F8}\u{1F1E6}', 'ara': '\u{1F1F8}\u{1F1E6}',
        'hindi': '\u{1F1EE}\u{1F1F3}', 'hin': '\u{1F1EE}\u{1F1F3}',
        'thai': '\u{1F1F9}\u{1F1ED}', 'tha': '\u{1F1F9}\u{1F1ED}',
        'vietnamese': '\u{1F1FB}\u{1F1F3}', 'vie': '\u{1F1FB}\u{1F1F3}',
        'indonesian': '\u{1F1EE}\u{1F1E9}', 'ind': '\u{1F1EE}\u{1F1E9}',
        'multi': '\u{1F310}', 'undetermined': '\u2753'
    };

    function getFlagForLanguage(lang) {
        if (!lang || !settings.enableLanguageFlags) return null;
        const lower = lang.toLowerCase().trim();
        if (LANGUAGE_FLAGS[lower]) return LANGUAGE_FLAGS[lower];
        if (/[\u{1F1E0}-\u{1F1FF}]{2}/u.test(lang)) return lang;
        for (const [key, flag] of Object.entries(LANGUAGE_FLAGS)) {
            if (lower.includes(key)) return flag;
        }
        return null;
    }

    function getUploaderName(row) {
        const uploaderLink = row.querySelector(
            '.torrent-info__uploader a, .torrent-search--list__uploader a, a[href*="/users/"]'
        );
        if (uploaderLink) {
            const match = uploaderLink.href.match(/\/users\/([^/]+)/);
            if (match) return decodeURIComponent(match[1]);
            return uploaderLink.textContent.trim();
        }
        return null;
    }

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
                this.handleLanguageFlags(row);
                this.handleUploaderHighlight(row);
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

        handleLanguageFlags(row) {
            if (!settings.enableLanguageFlags) return;
            if (row.dataset.langFlagAdded) return;

            let langEl = row.querySelector('.torrent-info__language span[title]');
            if (!langEl) langEl = row.querySelector('.torrent-icons img[title], .torrent-icons i[title]');
            if (!langEl) langEl = row.querySelector('[title*="Language"], [title*="lang"]');
            if (!langEl) { row.dataset.langFlagAdded = "true"; return; }

            const langText = langEl.getAttribute('title') || langEl.textContent || '';
            const firstLang = langText.split('/')[0].split('|')[0].trim();
            const flag = getFlagForLanguage(firstLang);
            if (!flag) { row.dataset.langFlagAdded = "true"; return; }

            const nameEl = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
            const flagSpan = document.createElement('span');
            flagSpan.textContent = ` ${flag}`;
            flagSpan.style.cssText = 'font-size:14px; vertical-align:middle; margin-left:4px;';
            flagSpan.title = firstLang;
            if (nameEl) nameEl.parentNode.insertBefore(flagSpan, nameEl.nextSibling);
            row.dataset.langFlagAdded = "true";
        }

        handleUploaderHighlight(row) {
            if (!settings.enableUploaderHighlight && !settings.enableSelfUpload) return;
            if (row.dataset.uploaderChecked) return;

            const uploader = getUploaderName(row);
            if (!uploader) { row.dataset.uploaderChecked = "true"; return; }

            let color = null;
            let tooltip = null;

            if (settings.enableSelfUpload && settings.currentUsername &&
                uploader.toLowerCase() === settings.currentUsername.toLowerCase()) {
                color = settings.colors.selfUpload;
                tooltip = 'Your upload';
            } else if (settings.enableUploaderHighlight) {
                const match = settings.highlightedUploaders.find(
                    u => u.toLowerCase() === uploader.toLowerCase()
                );
                if (match) {
                    color = settings.colors.uploaderHighlight;
                    tooltip = `Highlighted uploader: ${match}`;
                }
            }

            if (color) {
                const nameEl = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
                if (nameEl) {
                    if (nameEl.classList.contains('unit3d-name-badge')) {
                        nameEl.style.borderLeft = `4px solid ${color}`;
                    } else {
                        nameEl.classList.add('unit3d-name-badge');
                        nameEl.style.backgroundColor = color;
                    }
                    nameEl.title = tooltip;
                }
            }
            row.dataset.uploaderChecked = "true";
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
                { key: 'lowSeeders', label: 'Low Seeders' },
                { key: 'uploaderHighlight', label: 'Uploader Highlight' },
                { key: 'selfUpload', label: 'Self Upload' }
            ];

            const toggleKeys = [
                { key: 'enableInternal', label: 'Internal highlight' },
                { key: 'enableFreeleech', label: 'Freeleech highlight' },
                { key: 'enableDoubleUpload', label: 'Double Upload highlight' },
                { key: 'enableHighSpeed', label: 'High Speed highlight' },
                { key: 'enableSeeding', label: 'Seeding highlight' },
                { key: 'enableLowSeeders', label: 'Low seeder warning' },
                { key: 'enableLanguageFlags', label: 'Language flags' },
                { key: 'enableUploaderHighlight', label: 'Uploader highlight' },
                { key: 'enableSelfUpload', label: 'Highlight my uploads' }
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
                <div class="unit3d-settings-row">
                    <label>My Username</label>
                    <input type="text" id="unit3d-username" value="${settings.currentUsername}" placeholder="Your username..." style="width:120px;padding:4px 8px;border:1px solid #444;border-radius:4px;background:#111;color:#ddd;font-size:12px;">
                </div>
                <div style="margin-bottom:10px;">
                    <label style="font-size:13px;">Highlighted Uploaders</label>
                    <div id="unit3d-uploader-tags" style="margin-top:4px;">${settings.highlightedUploaders.map(u => `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 6px;margin:2px;background:#333;border-radius:3px;font-size:11px;">${u}<button class="unit3d-rm-uploader" data-user="${u}" style="background:none;color:#f66;border:none;cursor:pointer;font-size:10px;">\u00d7</button></span>`).join('')}</div>
                    <div style="display:flex;gap:4px;margin-top:4px;">
                        <input type="text" id="unit3d-uploader-input" placeholder="Add username..." style="flex:1;padding:4px 8px;border:1px solid #444;border-radius:4px;background:#111;color:#ddd;font-size:12px;">
                        <button id="unit3d-uploader-add" style="padding:4px 8px;background:#2ecc71;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">Add</button>
                    </div>
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

                const usernameInput = panel.querySelector('#unit3d-username');
                if (usernameInput) settings.currentUsername = usernameInput.value.trim();

                const uploaderTags = panel.querySelectorAll('#unit3d-uploader-tags span');
                settings.highlightedUploaders = Array.from(uploaderTags).map(el => el.textContent.replace('\u00d7', '').trim());

                saveSettings(settings);

                document.querySelectorAll('tr[data-hi-checked], tr[data-uploader-checked], tr[data-lang-flag-added]').forEach(row => {
                    delete row.dataset.hiChecked;
                    delete row.dataset.uploaderChecked;
                    delete row.dataset.langFlagAdded;
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

            panel.querySelector('#unit3d-uploader-add').onclick = () => {
                const input = panel.querySelector('#unit3d-uploader-input');
                const val = input.value.trim();
                if (val) {
                    const tags = panel.querySelector('#unit3d-uploader-tags');
                    const span = document.createElement('span');
                    span.style.cssText = 'display:inline-flex;align-items:center;gap:4px;padding:2px 6px;margin:2px;background:#333;border-radius:3px;font-size:11px;';
                    const textNode = document.createTextNode(val);
                    span.appendChild(textNode);
                    const removeBtn = document.createElement('button');
                    removeBtn.className = 'unit3d-rm-uploader';
                    removeBtn.style.cssText = 'background:none;color:#f66;border:none;cursor:pointer;font-size:10px;';
                    removeBtn.textContent = '\u00d7';
                    removeBtn.onclick = () => span.remove();
                    span.appendChild(removeBtn);
                    tags.appendChild(span);
                    input.value = '';
                }
            };
            panel.querySelectorAll('.unit3d-rm-uploader').forEach(btn => {
                btn.onclick = () => btn.closest('span').remove();
            });
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
})();
