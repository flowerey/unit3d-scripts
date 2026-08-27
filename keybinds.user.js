// ==UserScript==
// @name         UNIT3D Keybinds
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.2
// @description  Adds keybinds to UNIT3D.
// @author       blueberry
// @match        https://*/torrents*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

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

        toggleHelp() {
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

            const detailBinds = [
                { key: 'S', desc: 'Open IMDb' },
                { key: 'L', desc: 'Open Letterboxd' },
                { key: 'M', desc: 'Open TMDB' },
                { key: 'X', desc: 'Open Blu-ray.com' },
                { key: 'D', desc: 'Search NZBGeek' },
                { key: 'T', desc: 'Search YouTube Trailer' },
                { key: 'E', desc: 'Edit Torrent' },
                { key: 'B', desc: 'Back to Torrents' }
            ];

            const listBinds = [
                { key: 'J', desc: 'Select next torrent' },
                { key: 'K', desc: 'Select previous torrent' },
                { key: 'Enter', desc: 'Open selected torrent' },
                { key: '/', desc: 'Focus search box' },
                { key: 'Esc', desc: 'Clear selection / unfocus' }
            ];

            const sharedBinds = [
                { key: '?', desc: 'Show/Hide this help' }
            ];

            let bindsHtml = '';
            if (!isListPage) {
                bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:8px;">Torrent Detail</div>`;
                bindsHtml += detailBinds.map(b => `<span style="color:#2ecc71; font-weight:bold;">${b.key}</span><span>${b.desc}</span>`).join('');
            }
            if (isListPage) {
                bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-bottom:8px;">Torrent List</div>`;
                bindsHtml += listBinds.map(b => `<span style="color:#2ecc71; font-weight:bold;">${b.key}</span><span>${b.desc}</span>`).join('');
            }
            bindsHtml += `<div style="color:#2ecc71; font-weight:bold; margin-top:12px; margin-bottom:8px;">General</div>`;
            bindsHtml += sharedBinds.map(b => `<span style="color:#2ecc71; font-weight:bold;">${b.key}</span><span>${b.desc}</span>`).join('');

            content.innerHTML = `
                <h3 style="margin-top:0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px;">Keybinds Help</h3>
                <div style="display: grid; grid-template-columns: 50px 1fr; gap: 10px; margin-top: 20px;">
                    ${bindsHtml}
                </div>
                <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666;">Click anywhere to close</div>
            `;

            this.helpOverlay.appendChild(content);
            this.helpOverlay.onclick = () => {
                this.helpOverlay.remove();
                this.helpOverlay = null;
            };
            document.body.appendChild(this.helpOverlay);
        }
    };

    const LIST_SELECTORS = [
        'tr.torrent-search--list__no-poster-row',
        'tr:has(.torrent-search--grouped__overview)',
        'tr.torrent-search--list__row'
    ].join(', ');

    class KeybindManager {
        constructor() {
            this.selectors = {
                title: 'h1.meta__title',
                metaLink: 'a.meta-id-tag'
            };
            this.selectedIndex = -1;
            this.boundHandler = this.handleKeydown.bind(this);
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

        handleKeydown(e) {
            const active = document.activeElement;
            if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) return;

            const key = e.key;
            const keyLower = key.toLowerCase();
            const isListPage = /\/torrents\/?$/.test(window.location.pathname);

            if (key === 'Escape') {
                if (UI.helpOverlay) {
                    e.preventDefault();
                    UI.toggleHelp();
                    return;
                }
                if (isListPage) {
                    e.preventDefault();
                    this.clearHighlight();
                    return;
                }
            }

            if (key === '?') {
                e.preventDefault();
                UI.toggleHelp();
                return;
            }

            if (isListPage) {
                const rows = this.getVisibleRows();
                if (rows.length === 0) return;

                if (keyLower === 'j') {
                    e.preventDefault();
                    const next = Math.min(this.selectedIndex + 1, rows.length - 1);
                    this.highlightRow(next);
                    return;
                }
                if (keyLower === 'k') {
                    e.preventDefault();
                    const prev = Math.max(this.selectedIndex - 1, 0);
                    this.highlightRow(prev);
                    return;
                }
                if (key === 'Enter' && this.selectedIndex >= 0) {
                    e.preventDefault();
                    const link = rows[this.selectedIndex].querySelector('a[href*="/torrents/"]');
                    if (link) window.location.href = link.href;
                    return;
                }
                if (key === '/') {
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

                const actions = {
                    's': () => links.imdb ? window.open(links.imdb, '_blank') : UI.showToast('IMDb link not found'),
                    'l': () => links.letterboxd ? window.open(links.letterboxd, '_blank') : UI.showToast('Letterboxd link not found'),
                    'm': () => links.tmdb ? window.open(links.tmdb, '_blank') : UI.showToast('TMDB link not found'),
                    'x': () => links.bluray ? window.open(links.bluray, '_blank') : UI.showToast('Blu-ray.com link not found'),
                    'd': () => window.open(`https://nzbgeek.info/geekseek.php?browseincludewords=${query}`, '_blank'),
                    't': () => window.open(`https://www.youtube.com/results?search_query=${query}+trailer`, '_blank'),
                    'e': () => {
                        const path = window.location.pathname.replace(/\/$/, '');
                        window.location.href = `${window.location.origin}${path}/edit`;
                    },
                    'b': () => window.location.href = `${window.location.origin}/torrents`
                };

                if (actions[keyLower]) {
                    e.preventDefault();
                    actions[keyLower]();
                }
            }
        }
    }

    const start = () => new KeybindManager();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('turbolinks:load', start);
})();
