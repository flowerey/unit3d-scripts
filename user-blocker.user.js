// ==UserScript==
// @name         UNIT3D User Blocker
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Block users client-side: hide their uploads, forum posts, and chat messages.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/user-blocker.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/user-blocker.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'ub_blocked_users';

    function getBlocked() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
        catch { return []; }
    }

    function saveBlocked(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }

    function isBlocked(username) {
        return getBlocked().some(u => u.toLowerCase() === username.toLowerCase());
    }

    function addBlock(username) {
        const list = getBlocked();
        if (!list.some(u => u.toLowerCase() === username.toLowerCase())) {
            list.push(username);
            saveBlocked(list);
        }
    }

    function removeBlock(username) {
        const list = getBlocked().filter(u => u.toLowerCase() !== username.toLowerCase());
        saveBlocked(list);
    }

    function getUsernameFromRow(el) {
        const tag = el.querySelector('.user-tag');
        if (!tag) return null;
        const nameEl = tag.querySelector('a') || tag;
        return nameEl?.textContent?.trim() || null;
    }

    function hideBlockedTorrentRows() {
        document.querySelectorAll('.torrent-search__results .torrent-search__row, .table-responsive tr').forEach(row => {
            const userEl = row.querySelector('td:nth-child(5) a, td:nth-child(6) a, .torrent-search__uploader a');
            if (!userEl) return;
            const username = userEl.textContent.trim();
            if (isBlocked(username)) {
                row.style.display = 'none';
            }
        });
    }

    function hideBlockedChatMessages() {
        document.querySelectorAll('.chatbox-message').forEach(msg => {
            const userEl = msg.querySelector('.chatbox-message__address a, .user-tag a');
            if (!userEl) return;
            const username = userEl.textContent.trim();
            if (isBlocked(username)) {
                msg.style.display = 'none';
            }
        });
    }

    function hideBlockedForumPosts() {
        document.querySelectorAll('.post, .forum-topic__post, [class*="comment"]').forEach(post => {
            const userEl = post.querySelector('.user-tag a, .post__username a');
            if (!userEl) return;
            const username = userEl.textContent.trim();
            if (isBlocked(username)) {
                post.style.display = 'none';
            }
        });
    }

    function addBlockButtons() {
        document.querySelectorAll('.user-tag').forEach(tag => {
            if (tag.querySelector('.ub-block-btn')) return;
            const nameEl = tag.querySelector('a') || tag;
            const username = nameEl?.textContent?.trim();
            if (!username) return;

            const btn = document.createElement('button');
            btn.className = 'ub-block-btn';
            btn.textContent = isBlocked(username) ? 'Unblock' : 'Block';
            btn.style.cssText = 'font-size:10px; padding:1px 5px; margin-left:4px; background:#333; color:#ddd; border:1px solid #555; border-radius:3px; cursor:pointer;';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (isBlocked(username)) {
                    removeBlock(username);
                    btn.textContent = 'Block';
                } else {
                    addBlock(username);
                    btn.textContent = 'Unblock';
                }
                runAll();
            });
            tag.appendChild(btn);
        });
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'ub-panel';
        panel.style.cssText = 'position:fixed; bottom:10px; right:10px; z-index:99999; background:#1a1a2e; color:#fff; border:1px solid #333; border-radius:8px; padding:10px 14px; font-family:sans-serif; font-size:13px; box-shadow:0 4px 12px rgba(0,0,0,0.5); max-height:300px; overflow-y:auto; display:none; min-width:220px;';
        document.body.appendChild(panel);

        const toggle = document.createElement('button');
        toggle.id = 'ub-toggle';
        toggle.textContent = 'Blocked Users';
        toggle.style.cssText = 'position:fixed; bottom:10px; right:10px; z-index:99998; background:#1a1a2e; color:#66ff66; border:1px solid #66ff66; border-radius:6px; padding:6px 12px; cursor:pointer; font-family:sans-serif; font-size:12px; font-weight:bold;';
        toggle.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            renderPanel();
        });
        document.body.appendChild(toggle);

        return { panel, toggle };
    }

    function renderPanel() {
        const panel = document.getElementById('ub-panel');
        if (!panel) return;
        const blocked = getBlocked();
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <strong>Blocked Users (${blocked.length})</strong>
                <button id="ub-close" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:16px;">&times;</button>
            </div>
            <div style="display:flex; gap:4px; margin-bottom:8px;">
                <input id="ub-add-input" type="text" placeholder="Username..." style="flex:1; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px;" />
                <button id="ub-add-btn" style="padding:4px 8px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:12px;">Add</button>
            </div>
            <div id="ub-list" style="font-size:12px;">${blocked.length === 0 ? '<div style="color:#888;">No blocked users</div>' :
                blocked.map(u => `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid #333;">
                    <span>${u}</span>
                    <button class="ub-remove" data-user="${u}" style="background:#500; color:#f66; border:none; cursor:pointer; font-size:11px;">Remove</button>
                </div>`).join('')}
            </div>
        `;
        document.getElementById('ub-close').addEventListener('click', () => panel.style.display = 'none');
        document.getElementById('ub-add-btn').addEventListener('click', () => {
            const input = document.getElementById('ub-add-input');
            const val = input.value.trim();
            if (val) { addBlock(val); input.value = ''; renderPanel(); runAll(); }
        });
        document.getElementById('ub-add-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') document.getElementById('ub-add-btn').click();
        });
        panel.querySelectorAll('.ub-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                removeBlock(btn.dataset.user);
                renderPanel();
                runAll();
            });
        });
    }

    function runAll() {
        hideBlockedTorrentRows();
        hideBlockedChatMessages();
        hideBlockedForumPosts();
        addBlockButtons();
    }

    const { panel, toggle } = createPanel();

    const observer = new MutationObserver(() => runAll());
    observer.observe(document.body, { childList: true, subtree: true });

    runAll();
})();
