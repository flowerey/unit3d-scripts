// ==UserScript==
// @name         UNIT3D Table Sorter
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.2
// @description  Sort torrent tables by size, age, seeders, and more.
// @author       blueberry
// @match        https://*/torrents
// @match        https://*/torrents/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const SORT_STORAGE_KEY = 'unit3d-sort-prefs';

    const Utils = {
        parseSize(text) {
            const units = { 'B': 1, 'KB': 1e3, 'MB': 1e6, 'GB': 1e9, 'TB': 1e12, 'KiB': 1024, 'MiB': 1048576, 'GiB': 1073741824, 'TiB': 1099511627776 };
            const match = text.match(/([\d.]+)\s*([A-Za-z]+)/);
            if (!match) return 0;
            const [_, val, unit] = match;
            return parseFloat(val) * (units[unit] || 1);
        },
        parseNumber(text) {
            return parseInt(text.replace(/[^0-9]/g, '')) || 0;
        },
        parseDate(el) {
            const time = el.querySelector('time');
            return time ? new Date(time.getAttribute('datetime')).getTime() : 0;
        }
    };

    class TableSorter {
        constructor(table, prefs) {
            this.table = table;
            this.tbody = table.querySelector('tbody');
            this.headers = Array.from(table.querySelectorAll('thead th'));
            this.currentSort = { index: -1, desc: true };
            this.prefs = prefs;
            this.config = [
                { name: 'Type', parser: el => el.textContent.trim(), type: 'string' },
                { name: 'Name', parser: el => el.textContent.trim(), type: 'string' },
                { name: 'Size', parser: el => Utils.parseSize(el.textContent), type: 'number' },
                { name: 'Age', parser: el => Utils.parseDate(el), type: 'number' },
                { name: 'Seeders', parser: el => Utils.parseNumber(el.textContent), type: 'number' },
                { name: 'Leechers', parser: el => Utils.parseNumber(el.textContent), type: 'number' },
                { name: 'Completed', parser: el => Utils.parseNumber(el.textContent), type: 'number' }
            ];
            this.init();
        }

        init() {
            this.headers.forEach((th, i) => {
                const name = th.textContent.trim();
                const spec = this.config.find(c => name.includes(c.name));
                if (spec) {
                    th.style.cursor = 'pointer';
                    th.style.userSelect = 'none';
                    th.title = `Sort by ${spec.name}`;
                    th.addEventListener('click', () => this.sort(i, spec));
                }
            });

            if (this.prefs && this.prefs.index >= 0 && this.prefs.index < this.headers.length) {
                const spec = this.config.find(c => this.headers[this.prefs.index].textContent.trim().includes(c.name));
                if (spec) {
                    this.sort(this.prefs.index, spec, this.prefs.desc);
                }
            }
        }

        sort(index, spec, forceDesc) {
            const rows = Array.from(this.tbody.querySelectorAll('tr'));
            const isDesc = forceDesc !== undefined ? forceDesc : (this.currentSort.index === index ? !this.currentSort.desc : true);

            rows.sort((a, b) => {
                const cellA = a.children[index];
                const cellB = b.children[index];
                if (!cellA || !cellB) return 0;

                const valA = spec.parser(cellA);
                const valB = spec.parser(cellB);

                if (spec.type === 'string') {
                    return isDesc ? valB.localeCompare(valA) : valA.localeCompare(valB);
                }
                return isDesc ? valB - valA : valA - valB;
            });

            this.updateUI(index, isDesc, rows);
            this.savePrefs(index, isDesc);
        }

        savePrefs(index, desc) {
            try {
                localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ index, desc }));
            } catch (e) { /* ignore */ }
        }

        updateUI(index, isDesc, rows) {
            this.currentSort = { index, desc: isDesc };
            rows.forEach(row => this.tbody.appendChild(row));

            this.headers.forEach((th, i) => {
                const indicator = th.querySelector('.sort-indicator');
                if (indicator) indicator.remove();
                if (i === index) {
                    const span = document.createElement('span');
                    span.className = 'sort-indicator';
                    span.textContent = isDesc ? ' \u25BC' : ' \u25B2';
                    span.style.color = '#2ecc71';
                    th.appendChild(span);
                }
            });
        }
    }

    class QuickFilter {
        constructor() {
            this.filterInput = null;
            this.filterBtn = null;
            this.active = false;
        }

        inject() {
            const panel = document.querySelector('.panel__heading');
            if (!panel || document.getElementById('quick-filter-container')) return;

            const container = document.createElement('div');
            container.id = 'quick-filter-container';
            Object.assign(container.style, {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                marginLeft: '12px',
                verticalAlign: 'middle'
            });

            this.filterInput = document.createElement('input');
            this.filterInput.type = 'text';
            this.filterInput.placeholder = 'Filter torrents...';
            this.filterInput.id = 'quick-filter-input';
            Object.assign(this.filterInput.style, {
                padding: '4px 10px',
                border: '1px solid #444',
                borderRadius: '4px',
                backgroundColor: '#1a1a1a',
                color: '#ddd',
                fontSize: '11px',
                width: '180px',
                outline: 'none',
                transition: 'border-color 0.2s'
            });
            this.filterInput.onfocus = () => this.filterInput.style.borderColor = '#2ecc71';
            this.filterInput.onblur = () => this.filterInput.style.borderColor = '#444';

            this.filterBtn = document.createElement('button');
            this.filterBtn.innerHTML = '<i class="fas fa-filter"></i>';
            this.filterBtn.title = 'Toggle filter';
            Object.assign(this.filterBtn.style, {
                padding: '4px 8px',
                backgroundColor: '#444',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'background 0.2s'
            });
            this.filterBtn.onmouseover = () => { if (!this.active) this.filterBtn.style.backgroundColor = '#555'; };
            this.filterBtn.onmouseout = () => { if (!this.active) this.filterBtn.style.backgroundColor = '#444'; };

            this.filterBtn.onclick = () => {
                this.active = !this.active;
                if (this.active) {
                    this.filterBtn.style.backgroundColor = '#2ecc71';
                    this.applyFilter();
                } else {
                    this.filterBtn.style.backgroundColor = '#444';
                    this.clearFilter();
                }
            };

            this.filterInput.addEventListener('input', () => {
                if (this.active) this.applyFilter();
            });

            const clearBtn = document.createElement('button');
            clearBtn.innerHTML = '<i class="fas fa-times"></i>';
            clearBtn.title = 'Clear filter';
            Object.assign(clearBtn.style, {
                padding: '4px 8px',
                backgroundColor: 'transparent',
                color: '#888',
                border: '1px solid #444',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'color 0.2s'
            });
            clearBtn.onmouseover = () => clearBtn.style.color = '#e74c3c';
            clearBtn.onmouseout = () => clearBtn.style.color = '#888';
            clearBtn.onclick = () => {
                this.filterInput.value = '';
                this.active = false;
                this.filterBtn.style.backgroundColor = '#444';
                this.clearFilter();
            };

            container.appendChild(this.filterInput);
            container.appendChild(this.filterBtn);
            container.appendChild(clearBtn);
            panel.appendChild(container);

            this.filterInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.filterInput.value = '';
                    this.active = false;
                    this.filterBtn.style.backgroundColor = '#444';
                    this.clearFilter();
                    this.filterInput.blur();
                }
            });
        }

        applyFilter() {
            const query = this.filterInput.value.toLowerCase().trim();
            const tables = document.querySelectorAll(SORTABLE_TABLES);
            tables.forEach(table => {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => {
                    const text = row.textContent.toLowerCase();
                    row.style.display = text.includes(query) ? '' : 'none';
                });
            });
        }

        clearFilter() {
            const tables = document.querySelectorAll(SORTABLE_TABLES);
            tables.forEach(table => {
                const rows = table.querySelectorAll('tbody tr');
                rows.forEach(row => { row.style.display = ''; });
            });
        }
    }

    const SORTABLE_TABLES = [
        '.similar-torrents__torrents',
        '.table-torrents',
        '.torrents__torrents',
        'table.data-table'
    ].join(', ');

    let savedPrefs = null;
    try {
        savedPrefs = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY));
    } catch (e) { /* ignore */ }

    const filter = new QuickFilter();

    const setupUI = () => {
        const panel = document.querySelector('.panel__heading');
        if (!panel || document.getElementById('enable-sort-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'enable-sort-btn';
        btn.innerHTML = '<i class="fas fa-sort-amount-down"></i> Enable Sorting';
        Object.assign(btn.style, {
            marginLeft: '15px',
            padding: '4px 12px',
            backgroundColor: '#2ecc71',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background 0.2s'
        });
        btn.onmouseover = () => btn.style.backgroundColor = '#27ae60';
        btn.onmouseout = () => btn.style.backgroundColor = '#2ecc71';

        btn.onclick = () => {
            const tables = document.querySelectorAll(SORTABLE_TABLES);
            tables.forEach(t => new TableSorter(t, savedPrefs));
            btn.remove();
        };

        panel.appendChild(btn);
        filter.inject();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUI);
    } else {
        setupUI();
    }
    window.addEventListener('turbolinks:load', setupUI);
})();
