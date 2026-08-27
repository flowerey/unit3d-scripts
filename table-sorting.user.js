// ==UserScript==
// @name         UNIT3D Table Sorter
// @version      1.0
// @description  Sort torrent tables by size, age, seeders, and more.
// @author       blueberry
// @match        https://*/torrents/similar/*
// @match        https://*/torrents*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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
        constructor(table) {
            this.table = table;
            this.tbody = table.querySelector('tbody');
            this.headers = Array.from(table.querySelectorAll('thead th'));
            this.currentSort = { index: -1, desc: true };
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
        }

        sort(index, spec) {
            const rows = Array.from(this.tbody.querySelectorAll('tr'));
            const isDesc = this.currentSort.index === index ? !this.currentSort.desc : true;

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
                    span.innerHTML = isDesc ? ' ⏷' : ' ⏶';
                    span.style.color = '#2ecc71';
                    th.appendChild(span);
                }
            });
        }
    }

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
            const tables = document.querySelectorAll('.similar-torrents__torrents, .table-torrents');
            tables.forEach(t => new TableSorter(t));
            btn.remove();
        };

        panel.appendChild(btn);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupUI);
    } else {
        setupUI();
    }
})();
