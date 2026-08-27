// ==UserScript==
// @name         UNIT3D Keybinds
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.4
// @description  Adds keybinds to UNIT3D.
// @author       blueberry
// @match        https://*/torrents*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/keybinds.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/keybinds.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'unit3d-keybinds-map';

    const DEFAULT_BINDS = {
        imdb: 's',
        letterboxd: 'l',
        tmdb: 'm',
        bluray: 'x',
        nzbgeek: 'd',
        trailer: 't',
        edit: 'e',
        back: 'b',
        listNext: 'j',
        listPrev: 'k',
        listOpen: 'Enter',
        search: '/',
        help: '?'
    };

    function loadBinds() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (stored && typeof stored === 'object') return { ...DEFAULT_BINDS, ...stored };
        } catch (e) { /* ignore */ }
        return { ...DEFAULT_BINDS };
    }

    function saveBinds(binds) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(binds));
        } catch (e) { /* ignore */ }
    }

    const UI = {
        toastEl: null,
        toastTimeout: null,

        showToast(message, type = 'error') {
            if (!this.toastEl) {
                this.toastEl = document.createElement('div');
                this.toastEl.id = 'unit3d-kb-toast';
                Object.assign(this.toastEl.style, {
                    position: 'fixed',
                    top: '20px',
                    right: '20px',
                    padding: '12px 24px',
                    borderRadius: '4px',
                    zIndex: '10000',
                    color: '#fff',
                    fontWeight: '600',
                    fontSize: '14px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    transition: 'all 0.3s ease',
                    pointerEvents: 'none',
                    opacity: '0',
                    transform: 'translateY(-20px)'
                });
                document.body.appendChild(this.toastEl);
            }
            this.toastEl.innerText = message;
            this.toastEl.style.backgroundColor = type === 'error' ? '#e74c3c' : '#2ecc71';
            this.toastEl.style.opacity = '1';
            this.toastEl.style.transform = 'translateY(0)';

            clearTimeout(this.toastTimeout);
            this.toastTimeout = setTimeout(() => {
                this.toastEl.style.opacity = '0';
                this.toastEl.style.transform = 'translateY(-20px)';
            }, 3000);
        },

        helpOverlay: null,

        toggleHelp(binds) {
            if (this.helpOverlay) {
                this.helpOverlay.remove();
                this.helpOverlay = null;
                return;
            }

            this.helpOverlay = document.createElement('div');
            this.helpOverlay.id = 'unit3d-kb-help';
            Object.assign(this.helpOverlay.style, {
                position: 'fixed',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                backgroundColor: 'rgba(0,0,0,0.85)',
                zIndex: '20000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(4px)'
            });

            const content = document.createElement('div');
            Object.assign(content.style, {
                backgroundColor: '#1a1a1a',
                padding: '30px',
                borderRadius: '8px',
                border: '1px solid #333',
                maxWidth: '500px',
                width: '90%',
                color: '#ddd',
                fontFamily: 'system-ui, sans-serif'
            });

            const isListPage = /\/torrents\/?$/.test(window.location.pathname);

            const fmt = (key) => key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key.length === 1 ? key.toUpperCase() : key;

            const detailBinds = [
                { key: binds.imdb, desc: 'Open IMDb' },
                { key: binds.letterboxd, desc: 'Open Letterboxd' },
                { key: binds.tmdb, desc: 'Open TMDB' },
                { key: binds.bluray, desc: 'Open Blu-ray.com' },
                { key: binds.nzbgeek, desc: 'Search NZBGeek' },
                { key: binds.trailer, desc: 'Search YouTube Trailer' },
                { key: binds.edit, desc: 'Edit Torrent' },
                { key: binds.back, desc: 'Back to Torrents' }
            ];

            const listBinds = [
                { key: binds.listNext, desc: 'Select next torrent' },
                { key: binds.listPrev, desc: 'Select previous torrent' },
                { key: binds.listOpen, desc: 'Open selected torrent' },
                { key: binds.search, desc: 'Focus search box' },
                { key: 'Esc', desc: 'Clear selection / unfocus' }
            ];

            const sharedBinds = [
                { key: binds.help, desc: 'Show/Hide this help' }
            ];

            let bindsHtml = '';
            if (!isListPage) {
                bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:6px; font-size:13px;">Torrent Detail</div>`;
                bindsHtml += detailBinds.map(b => `<div style="display:contents;"><span style="color:#2ecc71; font-weight:bold; text-align:center; min-width:60px;">[${fmt(b.key)}]</span><span style="color:#ccc;">${b.desc}</span></div>`).join('');
            }
            if (isListPage) {
                bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:6px; font-size:13px;">Torrent List</div>`;
                bindsHtml += listBinds.map(b => `<div style="display:contents;"><span style="color:#2ecc71; font-weight:bold; text-align:center; min-width:60px;">[${fmt(b.key)}]</span><span style="color:#ccc;">${b.desc}</span></div>`).join('');
            }
            bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-top:10px; margin-bottom:6px; font-size:13px;">General</div>`;
            bindsHtml += sharedBinds.map(b => `<div style="display:contents;"><span style="color:#2ecc71; font-weight:bold; text-align:center; min-width:60px;">[${fmt(b.key)}]</span><span style="color:#ccc;">${b.desc}</span></div>`).join('');

            content.innerHTML = `
                <h3 style="margin-top:0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px; font-size: 16px;">Keybinds Help</h3>
                <div style="display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin-top: 16px; align-items: center;">
                    ${bindsHtml}
                </div>
                <div style="margin-top: 20px; text-align: center;">
                    <button id="kb-settings-btn" style="padding: 6px 16px; background:#333; color:#ddd; border:1px solid #555; border-radius:4px; cursor:pointer; font-size:12px;">Customize Keybinds</button>
                </div>
                <div style="margin-top: 15px; text-align: center; font-size: 12px; color: #666;">Click anywhere to close</div>
            `;

            this.helpOverlay.appendChild(content);
            this.helpOverlay.onclick = (e) => {
                if (e.target.id === 'kb-settings-btn') return;
                this.helpOverlay.remove();
                this.helpOverlay = null;
            };
            document.body.appendChild(this.helpOverlay);

            content.querySelector('#kb-settings-btn').onclick = (e) => {
                e.stopPropagation();
                this.helpOverlay.remove();
                this.helpOverlay = null;
                this.openSettings(binds);
            };
        },

        openSettings(binds) {
            if (document.querySelector('.kb-settings-overlay')) return;

            const overlay = document.createElement('div');
            overlay.className = 'kb-settings-overlay';
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:29999;';
            overlay.onclick = () => overlay.remove();

            const panel = document.createElement('div');
            panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1a1a1a;border:1px solid #444;border-radius:8px;padding:20px;z-index:30000;color:#ddd;font-family:system-ui,sans-serif;min-width:340px;max-width:90vw;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
            panel.onclick = (e) => e.stopPropagation();

            const fields = [
                { key: 'imdb', label: 'IMDb' },
                { key: 'letterboxd', label: 'Letterboxd' },
                { key: 'tmdb', label: 'TMDB' },
                { key: 'bluray', label: 'Blu-ray.com' },
                { key: 'nzbgeek', label: 'NZBGeek' },
                { key: 'trailer', label: 'YouTube Trailer' },
                { key: 'edit', label: 'Edit Torrent' },
                { key: 'back', label: 'Back to Torrents' },
                { key: 'listNext', label: 'Next (List)' },
                { key: 'listPrev', label: 'Previous (List)' },
                { key: 'listOpen', label: 'Open (List)' },
                { key: 'search', label: 'Focus Search' },
                { key: 'help', label: 'Toggle Help' }
            ];

            panel.innerHTML = `
                <h3 style="margin:0 0 12px 0;color:#fff;border-bottom:1px solid #333;padding-bottom:8px;font-size:14px;">Customize Keybinds</h3>
                ${fields.map(f => `
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                        <label style="font-size:12px;color:#aaa;">${f.label}</label>
                        <input type="text" data-bind="${f.key}" value="${binds[f.key]}" style="width:60px;padding:4px 8px;border:1px solid #444;border-radius:4px;background:#111;color:#ddd;font-size:12px;text-align:center;">
                    </div>
                `).join('')}
                <div style="display:flex;gap:8px;margin-top:12px;">
                    <button class="kb-save-btn" style="flex:1;padding:8px;background:#2ecc71;color:#fff;border:none;border-radius:4px;font-weight:bold;cursor:pointer;">Save</button>
                    <button class="kb-reset-btn" style="flex:1;padding:8px;background:#555;color:#fff;border:none;border-radius:4px;cursor:pointer;">Reset</button>
                </div>
            `;

            panel.querySelector('.kb-save-btn').onclick = () => {
                const newBinds = { ...binds };
                panel.querySelectorAll('[data-bind]').forEach(input => {
                    newBinds[input.dataset.bind] = input.value.trim() || binds[input.dataset.bind];
                });
                saveBinds(newBinds);
                overlay.remove();
                UI.showToast('Keybinds saved!', 'success');
            };

            panel.querySelector('.kb-reset-btn').onclick = () => {
                panel.querySelectorAll('[data-bind]').forEach(input => {
                    input.value = DEFAULT_BINDS[input.dataset.bind];
                });
            };

            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        }
    };

    const LIST_SELECTORS = [
        'tr.torrent-search--list__no-poster-row',
        'tr:has(.torrent-search--grouped__overview)',
        'tr.torrent-search--list__row'
    ].join(', ');

    let currentInstance = null;

    class KeybindManager {
        constructor() {
            this.selectors = {
                title: 'h1.meta__title',
                metaLink: 'a.meta-id-tag'
            };
            this.selectedIndex = -1;
            this.boundHandler = this.handleKeydown.bind(this);
            this.binds = loadBinds();
            this.init();
        }

        getLink(parentSelector) {
            const el = document.querySelector(`${parentSelector} ${this.selectors.metaLink}`);
            return el ? el.href : null;
        }

        getMediaInfo() {
            const h1 = document.querySelector(this.selectors.title);
            if (!h1) return { name: '', year: '' };

            const text = h1.innerText.trim();
            const match = text.match(/\((\d{4})\)/);
            const year = match ? match[1] : '';
            const name = match ? text.split(`(${year})`)[0].trim() : text;

            return { name, year };
        }

        getVisibleRows() {
            return Array.from(document.querySelectorAll(LIST_SELECTORS)).filter(r => r.offsetParent !== null);
        }

        highlightRow(index) {
            const rows = this.getVisibleRows();
            rows.forEach((r, i) => {
                r.style.outline = i === index ? '2px solid #2ecc71' : '';
                r.style.outlineOffset = i === index ? '-2px' : '';
            });
            this.selectedIndex = index;

            if (index >= 0 && rows[index]) {
                rows[index].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }

        clearHighlight() {
            const rows = this.getVisibleRows();
            rows.forEach(r => {
                r.style.outline = '';
                r.style.outlineOffset = '';
            });
            this.selectedIndex = -1;
        }

        init() {
            document.removeEventListener('keydown', this.boundHandler);
            document.addEventListener('keydown', this.boundHandler);
        }

        destroy() {
            document.removeEventListener('keydown', this.boundHandler);
        }

        handleKeydown(e) {
            const active = document.activeElement;
            if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) return;

            const key = e.key;
            const keyLower = key.toLowerCase();
            const isListPage = /\/torrents\/?$/.test(window.location.pathname);
            const b = this.binds;

            if (key === 'Escape') {
                if (UI.helpOverlay) {
                    e.preventDefault();
                    UI.toggleHelp(b);
                    return;
                }
                if (isListPage) {
                    e.preventDefault();
                    this.clearHighlight();
                    return;
                }
            }

            if (key === b.help) {
                e.preventDefault();
                UI.toggleHelp(b);
                return;
            }

            if (isListPage) {
                const rows = this.getVisibleRows();
                if (rows.length === 0) return;

                if (keyLower === b.listNext) {
                    e.preventDefault();
                    const next = Math.min(this.selectedIndex + 1, rows.length - 1);
                    this.highlightRow(next);
                    return;
                }
                if (keyLower === b.listPrev) {
                    e.preventDefault();
                    const prev = Math.max(this.selectedIndex - 1, 0);
                    this.highlightRow(prev);
                    return;
                }
                if (key === b.listOpen && this.selectedIndex >= 0) {
                    e.preventDefault();
                    const link = rows[this.selectedIndex].querySelector('a[href*="/torrents/"]');
                    if (link) window.location.href = link.href;
                    return;
                }
                if (key === b.search) {
                    e.preventDefault();
                    const searchInput = document.querySelector('input[type="search"], input[name="search"], input.form-control');
                    if (searchInput) searchInput.focus();
                    return;
                }
            }

            if (!isListPage) {
                const { name, year } = this.getMediaInfo();
                const query = encodeURIComponent(`${name} ${year}`.trim());

                const links = {
                    imdb: this.getLink('.meta__imdb'),
                    letterboxd: this.getLink('.meta__letterboxd'),
                    tmdb: this.getLink('.meta__tmdb'),
                    bluray: this.getLink('.meta__blu-ray')
                };

                const actions = {};
                actions[b.imdb] = () => links.imdb ? window.open(links.imdb, '_blank') : UI.showToast('IMDb link not found');
                actions[b.letterboxd] = () => links.letterboxd ? window.open(links.letterboxd, '_blank') : UI.showToast('Letterboxd link not found');
                actions[b.tmdb] = () => links.tmdb ? window.open(links.tmdb, '_blank') : UI.showToast('TMDB link not found');
                actions[b.bluray] = () => links.bluray ? window.open(links.bluray, '_blank') : UI.showToast('Blu-ray.com link not found');
                actions[b.nzbgeek] = () => window.open(`https://nzbgeek.info/geekseek.php?browseincludewords=${query}`, '_blank');
                actions[b.trailer] = () => window.open(`https://www.youtube.com/results?search_query=${query}+trailer`, '_blank');
                actions[b.edit] = () => {
                    const path = window.location.pathname.replace(/\/$/, '');
                    window.location.href = `${window.location.origin}${path}/edit`;
                };
                actions[b.back] = () => window.location.href = `${window.location.origin}/torrents`;

                const action = actions[keyLower] || actions[key];
                if (action) {
                    e.preventDefault();
                    action();
                }
            }
        }
    }

    const start = () => {
        if (currentInstance) currentInstance.destroy();
        currentInstance = new KeybindManager();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('turbolinks:load', start);
})();
