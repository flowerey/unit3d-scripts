// ==UserScript==
// @name         UNIT3D Torrent Highlighter
// @version      1.1
// @description  UNIT3D torrent row highlighting and visual enhancements.
// @author       blueberry
// @match        https://*/torrents/*
// @match        https://*/torrents/similar/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        colors: {
            internal: '#2D1E3A',
            freeleech: '#3D351B',
            doubleUpload: '#1D343D',
            highSpeed: '#3D1B1D',
            seeding: '#1F2D1F'
        },
        throttleMs: 100
    };

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
    `;

    class Highlighter {
        constructor() {
            this.throttleTimer = null;
            this.init();
        }

        init() {
            const style = document.createElement('style');
            style.textContent = CSS;
            document.head.appendChild(style);

            this.process();
            this.setupObserver();
            window.addEventListener('turbolinks:load', () => this.process());
        }

        setupObserver() {
            const observer = new MutationObserver(() => {
                if (this.throttleTimer) return;
                this.throttleTimer = setTimeout(() => {
                    this.process();
                    this.throttleTimer = null;
                }, CONFIG.throttleMs);
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }

        process() {
            const rows = document.querySelectorAll('tr.torrent-search--list__no-poster-row, tr:has(.torrent-search--grouped__overview)');

            rows.forEach(row => {
                this.highlightRow(row);
                this.handleInternal(row);
                this.handleTrump(row);
                this.animateIcons(row);
            });
        }

        highlightRow(row) {
            if (row.dataset.hiChecked) return;

            const icons = row.querySelector('.torrent-icons');
            if (!icons) return;

            const nameEl = row.querySelector('.torrent-search--list__name, .torrent-search--grouped__name a');
            if (!nameEl) return;

            const statuses = [
                { id: 'int', color: CONFIG.colors.internal, icon: '.torrent-icons__internal', check: () => true },
                { id: 'fl', color: CONFIG.colors.freeleech, icon: '.torrent-icons__freeleech', check: (el) => el.title.includes('100% Free') || el.title.includes('Global Freeleech') },
                { id: 'du', color: CONFIG.colors.doubleUpload, icon: '.torrent-icons__double-upload', check: () => true },
                { id: 'hs', color: CONFIG.colors.highSpeed, icon: '.torrent-icons__highspeed', check: () => true }
            ];

            const active = statuses.filter(s => {
                const el = icons.querySelector(s.icon);
                return el && s.check(el);
            });

            const seeding = row.querySelector('.torrent__seeder-count.text-success');
            if (active.length === 0 && seeding) {
                active.push({ id: 'sd', color: CONFIG.colors.seeding });
            }

            if (active.length > 0) {
                const primaryColor = active[0].color;
                nameEl.classList.add('unit3d-name-badge');
                nameEl.style.backgroundColor = primaryColor;
            }

            row.dataset.hiChecked = "true";
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => new Highlighter());
    } else {
        new Highlighter();
    }
})();
