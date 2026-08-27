// ==UserScript==
// @name         UNIT3D Keybinds
// @version      1.0
// @description  Adds keybinds to UNIT3D.
// @author       blueberry
// @match        https://*/torrents/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const UI = {
        showToast(message, type = 'error') {
            let toast = document.getElementById('unit3d-kb-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'unit3d-kb-toast';
                Object.assign(toast.style, {
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
                document.body.appendChild(toast);
            }
            toast.innerText = message;
            toast.style.backgroundColor = type === 'error' ? '#e74c3c' : '#2ecc71';
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';

            clearTimeout(toast.timeout);
            toast.timeout = setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
            }, 3000);
        },

        showHelp() {
            let overlay = document.getElementById('unit3d-kb-help');
            if (overlay) {
                overlay.remove();
                return;
            }

            overlay = document.createElement('div');
            overlay.id = 'unit3d-kb-help';
            Object.assign(overlay.style, {
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
                maxWidth: '400px',
                width: '90%',
                color: '#ddd',
                fontFamily: 'system-ui, sans-serif'
            });

            const binds = [
                { key: 'S', desc: 'Open IMDb' },
                { key: 'L', desc: 'Open Letterboxd' },
                { key: 'M', desc: 'Open TMDB' },
                { key: 'X', desc: 'Open Blu-ray.com' },
                { key: 'D', desc: 'Search NZBGeek' },
                { key: 'T', desc: 'Search YouTube Trailer' },
                { key: 'E', desc: 'Edit Torrent' },
                { key: 'B', desc: 'Back to Torrents' },
                { key: '?', desc: 'Show/Hide this help' }
            ];

            content.innerHTML = `
                <h3 style="margin-top:0; color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px;">Keybinds Help</h3>
                <div style="display: grid; grid-template-columns: 50px 1fr; gap: 10px; margin-top: 20px;">
                    ${binds.map(b => `<span style="color:#2ecc71; font-weight:bold;">${b.key}</span><span>${b.desc}</span>`).join('')}
                </div>
                <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666;">Click anywhere to close</div>
            `;

            overlay.appendChild(content);
            overlay.onclick = () => overlay.remove();
            document.body.appendChild(overlay);
        }
    };

    class KeybindManager {
        constructor() {
            this.selectors = {
                title: 'h1.meta__title',
                metaLink: 'a.meta-id-tag'
            };
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

        init() {
            document.addEventListener('keydown', (e) => this.handleKeydown(e));
        }

        handleKeydown(e) {
            const active = document.activeElement;
            if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable) return;

            const key = e.key.toLowerCase();
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
                'b': () => window.location.href = `${window.location.origin}/torrents`,
                '?': () => UI.showHelp()
            };

            if (actions[key]) {
                e.preventDefault();
                actions[key]();
            }
        }
    }

    const start = () => new KeybindManager();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();