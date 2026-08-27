// ==UserScript==
// @name         UNIT3D Chat Refresh Fix
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Fixes chatbox auto-refresh with polling, unread badges, and desktop notifications.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/chat-refresh.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/chat-refresh.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_ENABLED = 'cr_enabled';
    const STORAGE_KEY_INTERVAL = 'cr_interval';
    const STORAGE_KEY_SOUND = 'cr_sound';
    const STORAGE_KEY_DESKTOP = 'cr_desktop';
    const STORAGE_KEY_MUTED_USERS = 'cr_muted';

    let enabled = true;
    let pollInterval = 5000;
    let soundEnabled = false;
    let desktopEnabled = false;
    let lastMessageId = null;
    let pollTimer = null;

    function getSettings() {
        try {
            enabled = JSON.parse(localStorage.getItem(STORAGE_KEY_ENABLED)) ?? true;
            pollInterval = parseInt(localStorage.getItem(STORAGE_KEY_INTERVAL)) || 5000;
            soundEnabled = JSON.parse(localStorage.getItem(STORAGE_KEY_SOUND)) || false;
            desktopEnabled = JSON.parse(localStorage.getItem(STORAGE_KEY_DESKTOP)) || false;
        } catch { }
    }

    function saveSettings() {
        localStorage.setItem(STORAGE_KEY_ENABLED, JSON.stringify(enabled));
        localStorage.setItem(STORAGE_KEY_INTERVAL, String(pollInterval));
        localStorage.setItem(STORAGE_KEY_SOUND, JSON.stringify(soundEnabled));
        localStorage.setItem(STORAGE_KEY_DESKTOP, JSON.stringify(desktopEnabled));
    }

    function getMutedUsers() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY_MUTED_USERS)) || []; }
        catch { return []; }
    }

    function csrfToken() {
        const meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : null;
    }

    function getActiveRoomId() {
        const tab = document.querySelector('.chatbox__tab--active, .panel__tab--active');
        if (!tab) return 1;
        const match = tab.getAttribute('wire:click')?.match(/chatroomId\((\d+)\)/);
        return match ? parseInt(match[1], 10) : 1;
    }

    async function fetchMessages(roomId) {
        const token = csrfToken();
        if (!token) return null;

        try {
            const res = await fetch(`/api/chat/rooms/${roomId}/messages`, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                    'X-Requested-With': 'XMLHttpRequest',
                },
            });
            if (!res.ok) return null;
            const data = await res.json();
            return data;
        } catch { return null; }
    }

    function playNotificationSound() {
        if (!soundEnabled) return;
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.value = 0.1;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.stop(ctx.currentTime + 0.3);
        } catch { }
    }

    function showDesktopNotification(username, message) {
        if (!desktopEnabled || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        new Notification(`${username} in Chat`, {
            body: message.replace(/<[^>]+>/g, '').substring(0, 100),
            icon: 'https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/icon.png',
            tag: 'chat-' + username,
        });
    }

    function updateStatusDot() {
        let dot = document.getElementById('cr-status');
        if (!dot) {
            dot = document.createElement('span');
            dot.id = 'cr-status';
            dot.style.cssText = 'display:inline-block; width:8px; height:8px; border-radius:50%; margin-left:6px; vertical-align:middle;';
            const header = document.querySelector('#chatbody .panel__header, .chatbox .panel__header');
            if (header) header.appendChild(dot);
        }
        dot.style.background = enabled ? '#66ff66' : '#ff4d4d';
        dot.title = enabled ? 'Chat refresh: ON' : 'Chat refresh: OFF';
    }

    function updateBadge(count) {
        let badge = document.getElementById('cr-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'cr-badge';
            badge.style.cssText = 'background:#e94560; color:#fff; font-size:10px; font-weight:bold; padding:1px 5px; border-radius:8px; margin-left:6px; display:none;';
            const header = document.querySelector('#chatbody .panel__header, .chatbox .panel__header');
            if (header) header.appendChild(badge);
        }
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }

    let unreadCount = 0;

    async function poll() {
        if (!enabled) return;

        const roomId = getActiveRoomId();
        const messages = await fetchMessages(roomId);
        if (!messages || !Array.isArray(messages)) return;

        const muted = getMutedUsers();
        const newMessages = messages.filter(m => {
            if (lastMessageId === null) return false;
            if (m.id <= lastMessageId) return false;
            const username = m.user?.username || '';
            if (muted.some(u => u.toLowerCase() === username.toLowerCase())) return false;
            return true;
        });

        if (newMessages.length > 0 && lastMessageId !== null) {
            unreadCount += newMessages.length;
            updateBadge(unreadCount);
            playNotificationSound();

            newMessages.forEach(m => {
                const username = m.user?.username || 'Unknown';
                const text = m.message?.replace(/<[^>]+>/g, '') || '';
                if (text.length > 0) {
                    showDesktopNotification(username, text);
                }
            });
        }

        if (messages.length > 0) {
            lastMessageId = messages[messages.length - 1].id;
        }
    }

    function resetUnread() {
        unreadCount = 0;
        updateBadge(0);
    }

    function startPolling() {
        stopPolling();
        if (!enabled) return;
        pollTimer = setInterval(poll, pollInterval);
    }

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function createSettingsPanel() {
        const panel = document.createElement('div');
        panel.id = 'cr-panel';
        panel.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:99999; background:#1a1a2e; color:#fff; border:1px solid #444; border-radius:8px; padding:16px; font-family:sans-serif; font-size:13px; display:none; min-width:280px;';
        document.body.appendChild(panel);

        const btn = document.createElement('button');
        btn.id = 'cr-settings-btn';
        btn.textContent = 'Chat Settings';
        btn.style.cssText = 'font-size:10px; padding:2px 6px; background:#16213e; color:#aaa; border:1px solid #555; border-radius:3px; cursor:pointer;';
        btn.addEventListener('click', () => {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
            renderPanel();
        });

        const header = document.querySelector('#chatbody .panel__header, .chatbox .panel__header');
        if (header) header.appendChild(btn);

        function renderPanel() {
            const muted = getMutedUsers();
            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                    <strong>Chat Refresh Settings</strong>
                    <button id="cr-close" style="background:none; color:#aaa; border:none; cursor:pointer; font-size:18px;">&times;</button>
                </div>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" id="cr-enabled" ${enabled ? 'checked' : ''} style="cursor:pointer;" />
                    <span>Enable auto-refresh</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" id="cr-sound" ${soundEnabled ? 'checked' : ''} style="cursor:pointer;" />
                    <span>Sound notification</span>
                </label>
                <label style="display:flex; align-items:center; gap:8px; margin-bottom:8px; cursor:pointer;">
                    <input type="checkbox" id="cr-desktop" ${desktopEnabled ? 'checked' : ''} style="cursor:pointer;" />
                    <span>Desktop notifications</span>
                </label>
                <div style="margin-bottom:8px;">
                    <label>Poll interval (ms):</label>
                    <input type="number" id="cr-interval" value="${pollInterval}" min="1000" max="60000" step="1000"
                        style="width:80px; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px; margin-left:8px;" />
                </div>
                <div style="margin-bottom:8px;">
                    <label>Muted users:</label>
                    <div style="display:flex; gap:4px; margin-top:4px;">
                        <input id="cr-mute-input" type="text" placeholder="Username..."
                            style="flex:1; padding:4px 6px; background:#16213e; color:#fff; border:1px solid #555; border-radius:3px; font-size:12px;" />
                        <button id="cr-mute-add" style="padding:4px 8px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:3px; cursor:pointer; font-size:12px;">Mute</button>
                    </div>
                    <div style="margin-top:4px;">${muted.length === 0 ? '<span style="color:#666;">No muted users</span>' :
                        muted.map(u => `<div style="display:flex; justify-content:space-between; padding:2px 0; font-size:12px;">
                            <span>${u}</span>
                            <button class="cr-unmute" data-user="${u}" style="background:#500; color:#f66; border:none; cursor:pointer; font-size:11px;">Unmute</button>
                        </div>`).join('')}</div>
                </div>
                <button id="cr-save" style="width:100%; padding:6px; background:#0f3460; color:#fff; border:1px solid #333; border-radius:4px; cursor:pointer; font-size:12px; margin-top:8px;">Save & Restart</button>
            `;
            document.getElementById('cr-close').addEventListener('click', () => panel.style.display = 'none');
            document.getElementById('cr-save').addEventListener('click', () => {
                enabled = document.getElementById('cr-enabled').checked;
                soundEnabled = document.getElementById('cr-sound').checked;
                desktopEnabled = document.getElementById('cr-desktop').checked;
                pollInterval = parseInt(document.getElementById('cr-interval').value) || 5000;
                saveSettings();
                updateStatusDot();
                startPolling();
                panel.style.display = 'none';

                if (desktopEnabled && 'Notification' in window && Notification.permission !== 'granted') {
                    Notification.requestPermission();
                }
            });
            document.getElementById('cr-mute-add').addEventListener('click', () => {
                const input = document.getElementById('cr-mute-input');
                const val = input.value.trim();
                if (val) {
                    const list = getMutedUsers();
                    list.push(val);
                    localStorage.setItem(STORAGE_KEY_MUTED_USERS, JSON.stringify(list));
                    input.value = '';
                    renderPanel();
                }
            });
            panel.querySelectorAll('.cr-unmute').forEach(b => {
                b.addEventListener('click', () => {
                    const list = getMutedUsers().filter(u => u !== b.dataset.user);
                    localStorage.setItem(STORAGE_KEY_MUTED_USERS, JSON.stringify(list));
                    renderPanel();
                });
            });
        }
    }

    function init() {
        getSettings();
        createSettingsPanel();
        updateStatusDot();
        updateBadge(0);

        const chatEl = document.querySelector('#chatbody, .chatbox');
        if (chatEl) {
            chatEl.addEventListener('click', resetUnread);
        }

        startPolling();
    }

    const obs = new MutationObserver(() => {
        const chatEl = document.querySelector('#chatbody, .chatbox');
        if (chatEl && !chatEl.dataset.crInit) {
            chatEl.dataset.crInit = '1';
            init();
        }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const chatEl = document.querySelector('#chatbody, .chatbox');
    if (chatEl) {
        chatEl.dataset.crInit = '1';
        init();
    }
})();
