// ==UserScript==
// @name         UNIT3D Forum Bookmarks
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0.1
// @description  Bookmark and manage forum posts on UNIT3D sites
// @author       blueberry
// @match        https://*/forums/*
// @match        https://*/forum/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/forum-bookmarks.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/forum-bookmarks.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'u3d-forum-bookmarks';
    const MAX_BOOKMARKS = 200;

    function loadData() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (stored && stored.bookmarks) return stored;
        } catch (e) { /* ignore */ }
        return { bookmarks: [], tags: [] };
    }

    function saveData(data) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ }
    }

    function addBookmark(bm) {
        const data = loadData();
        if (data.bookmarks.some(b => b.id === bm.id)) return false;
        data.bookmarks.unshift(bm);
        if (data.bookmarks.length > MAX_BOOKMARKS) data.bookmarks = data.bookmarks.slice(0, MAX_BOOKMARKS);
        saveData(data);
        return true;
    }

    function removeBookmark(id) {
        const data = loadData();
        data.bookmarks = data.bookmarks.filter(b => b.id !== id);
        saveData(data);
    }

    function isBookmarked(id) {
        return loadData().bookmarks.some(b => b.id === id);
    }

    function getPostInfo() {
        const url = window.location.href;

        // UNIT3D permalink route: /forums/topics/{topicId}/posts/{postId}
        const permalink = url.match(/\/forums\/topics\/\d+\/posts\/(\d+)/);
        const query = url.match(/[?&]post=(\d+)/);
        const postId = permalink ? permalink[1] : (query ? query[1] : null);

        // Legacy path fallback: /forums|/forum/{category}/{slug}/{postId}
        let legacyId = null;
        if (!postId) {
            const legacy = url.match(/\/(?:forums|forum)\/[^/]+\/[^/]+\/(\d+)/);
            if (legacy) legacyId = legacy[1];
        }
        const id = postId || legacyId;
        if (!id) return null;

        const titleEl = document.querySelector('h2.panel__heading, .topic-title, h2.post-title, h1');
        const title = titleEl ? titleEl.textContent.trim().substring(0, 200) : document.title;

        const topicEl = document.querySelector('.topic-title a, .forum-topic__title a, h2.panel__heading');
        const topicTitle = topicEl ? topicEl.textContent.trim() : '';
        const topicUrl = topicEl && topicEl.href ? topicEl.href : '';

        const categoryEl = document.querySelector('.forum-category, .breadcrumb--active, .breadcrumb a:last-child');
        const category = categoryEl ? categoryEl.textContent.trim() : '';

        return { id, url: url.split('?')[0], title, topicTitle, topicUrl, category };
    }

    function injectBookmarkButton(postInfo) {
        if (!postInfo || document.querySelector('.u3d-fb-btn')) return;

        const actions = document.querySelector('.post__toolbar, .post__actions, .topic__actions, .panel__actions');
        if (!actions) return;

        const btn = document.createElement('button');
        btn.className = 'u3d-fb-btn';
        btn.style.cssText = 'padding:4px 10px;background:#1a1a2e;color:#e94560;border:1px solid #e94560;border-radius:4px;cursor:pointer;font-size:12px;margin-left:8px;';
        const updateBtn = () => {
            const saved = isBookmarked(postInfo.id);
            btn.textContent = saved ? '\u2605 Saved' : '\u2606 Bookmark';
            btn.style.color = saved ? '#66ff66' : '#e94560';
            btn.style.borderColor = saved ? '#66ff66' : '#e94560';
        };
        updateBtn();

        btn.addEventListener('click', () => {
            if (isBookmarked(postInfo.id)) {
                removeBookmark(postInfo.id);
            } else {
                addBookmark({
                    ...postInfo,
                    timestamp: Date.now(),
                    readAt: null,
                    tags: []
                });
            }
            updateBtn();
        });
        // UNIT3D forum posts render their action buttons inside a <menu class="post__toolbar">
        // whose children are <li class="post__toolbar-item">. Wrap the button in an <li> when
        // injecting there so it nests correctly (and align it with the existing items).
        if (actions.classList && actions.classList.contains('post__toolbar')) {
            btn.style.cssText += 'margin-left:4px;';
            const item = document.createElement('li');
            item.className = 'post__toolbar-item';
            item.style.cssText = 'display:inline-flex;align-items:center;margin:0 4px;';
            item.appendChild(btn);
            actions.appendChild(item);
        } else {
            actions.appendChild(btn);
        }
    }

    function createPanel() {
        const toggle = document.createElement('button');
        toggle.id = 'u3d-fb-toggle';
        toggle.textContent = '\u2605 Forum Bookmarks';
        toggle.style.cssText = 'position:fixed;bottom:60px;right:20px;z-index:25000;padding:6px 12px;background:#1a1a2e;color:#e94560;border:1px solid #e94560;border-radius:6px;cursor:pointer;font-family:system-ui,sans-serif;font-size:12px;font-weight:bold;';
        document.body.appendChild(toggle);

        const panel = document.createElement('div');
        panel.id = 'u3d-fb-panel';
        panel.style.cssText = 'position:fixed;bottom:100px;right:20px;z-index:25001;background:#1a1a2e;color:#ddd;border:1px solid #444;border-radius:8px;padding:16px;font-family:system-ui,sans-serif;font-size:13px;display:none;min-width:360px;max-height:500px;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,0.5);';
        document.body.appendChild(panel);

        toggle.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            if (panel.style.display === 'block') renderPanel();
        });

        return { toggle, panel };
    }

    function escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function renderPanel() {
        const panel = document.getElementById('u3d-fb-panel');
        if (!panel) return;
        const data = loadData();
        const bms = data.bookmarks;

        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <strong style="color:#e94560;">\u2605 Forum Bookmarks (${bms.length})</strong>
                <button id="u3d-fb-close" style="background:none;color:#aaa;border:none;cursor:pointer;font-size:18px;">&times;</button>
            </div>
            <div style="display:flex;gap:4px;margin-bottom:12px;">
                <input id="u3d-fb-search" type="text" placeholder="Search bookmarks..." style="flex:1;padding:4px 8px;background:#16213e;color:#fff;border:1px solid #555;border-radius:3px;font-size:12px;">
                <select id="u3d-fb-sort" style="padding:4px;background:#16213e;color:#fff;border:1px solid #555;border-radius:3px;font-size:12px;">
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="title">Title</option>
                </select>
            </div>
            <div id="u3d-fb-list" style="max-height:350px;overflow-y:auto;">
                ${bms.length === 0 ? '<div style="color:#666;text-align:center;padding:20px;">No bookmarks yet</div>' :
                    bms.map(b => `
                    <div style="padding:8px;margin-bottom:6px;background:#16213e;border-radius:4px;border-left:3px solid #e94560;" data-id="${escHtml(b.id)}">
                        <div style="display:flex;justify-content:space-between;align-items:start;">
                            <div style="flex:1;">
                                <a href="${escHtml(b.url)}" style="color:#4fc3f7;text-decoration:none;font-size:12px;font-weight:bold;">${escHtml(b.title)}</a>
                                ${b.topicTitle ? `<div style="font-size:11px;color:#888;margin-top:2px;">${escHtml(b.topicTitle)}</div>` : ''}
                                <div style="font-size:10px;color:#666;margin-top:2px;">${b.category ? escHtml(b.category) + ' \u2022 ' : ''}${new Date(b.timestamp).toLocaleDateString()}</div>
                            </div>
                            <button class="u3d-fb-rm" data-id="${escHtml(b.id)}" style="background:none;color:#f66;border:none;cursor:pointer;font-size:14px;">\u2715</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:12px;display:flex;gap:4px;">
                <button id="u3d-fb-export" style="flex:1;padding:4px;background:#0f3460;color:#fff;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:11px;">Export</button>
                <button id="u3d-fb-import" style="flex:1;padding:4px;background:#0f3460;color:#fff;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:11px;">Import</button>
                <button id="u3d-fb-clear" style="flex:1;padding:4px;background:#500;color:#f66;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:11px;">Clear All</button>
            </div>
            <input type="file" id="u3d-fb-file" accept=".json" style="display:none;">
        `;

        document.getElementById('u3d-fb-close').addEventListener('click', () => panel.style.display = 'none');

        document.getElementById('u3d-fb-search').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            panel.querySelectorAll('[data-id]').forEach(el => {
                const id = el.dataset.id;
                const bm = bms.find(b => b.id === id);
                if (bm) el.style.display = bm.title.toLowerCase().includes(q) || (bm.topicTitle && bm.topicTitle.toLowerCase().includes(q)) ? '' : 'none';
            });
        });

        document.getElementById('u3d-fb-sort').addEventListener('change', (e) => {
            const sorted = [...bms];
            if (e.target.value === 'oldest') sorted.reverse();
            else if (e.target.value === 'title') sorted.sort((a, b) => a.title.localeCompare(b.title));
            data.bookmarks = sorted;
            saveData(data);
            renderPanel();
        });

        panel.querySelectorAll('.u3d-fb-rm').forEach(btn => {
            btn.addEventListener('click', () => {
                removeBookmark(btn.dataset.id);
                renderPanel();
            });
        });

        document.getElementById('u3d-fb-export').addEventListener('click', () => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `forum-bookmarks-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        document.getElementById('u3d-fb-import').addEventListener('click', () => {
            document.getElementById('u3d-fb-file').click();
        });

        document.getElementById('u3d-fb-file').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const imported = JSON.parse(ev.target.result);
                    if (imported.bookmarks) {
                        const merged = loadData();
                        for (const bm of imported.bookmarks) {
                            if (!merged.bookmarks.some(b => b.id === bm.id)) {
                                merged.bookmarks.push(bm);
                            }
                        }
                        merged.bookmarks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                        saveData(merged);
                        renderPanel();
                    }
                } catch (err) { alert('Invalid file format'); }
            };
            reader.readAsText(file);
        });

        document.getElementById('u3d-fb-clear').addEventListener('click', () => {
            if (confirm('Clear all bookmarks?')) {
                saveData({ bookmarks: [], tags: [] });
                renderPanel();
            }
        });
    }

    function init() {
        const postInfo = getPostInfo();
        if (postInfo) injectBookmarkButton(postInfo);
        createPanel();
    }

    init();
})();
