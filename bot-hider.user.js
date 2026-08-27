// ==UserScript==
// @name         UNIT3D Bot Hider
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.3
// @description  Toggles the visibility of bot messages on UNIT3D chatbox.
// @author       blueberry
// @match        https://*/chatbox*
// @match        https://*/chat/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bot-hider.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bot-hider.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY_NAMES = 'bh_bot_names';
    const STORAGE_KEY_PATTERNS = 'bh_filter_patterns';
    const STORAGE_KEY_ENABLED = 'bh_enabled';
    const STORAGE_KEY_MODE = 'bh_filter_mode';

    const DEFAULT_BOT_NAMES = ['SystemBot'];
    const DEFAULT_PATTERNS = [];

    function loadBotNames() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_NAMES));
            if (Array.isArray(stored) && stored.length > 0) return stored;
        } catch (e) { /* ignore */ }
        return [...DEFAULT_BOT_NAMES];
    }

    function saveBotNames(names) {
        try {
            localStorage.setItem(STORAGE_KEY_NAMES, JSON.stringify(names));
        } catch (e) { /* ignore */ }
    }

    function loadPatterns() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY_PATTERNS));
            if (Array.isArray(stored)) return stored;
        } catch (e) { /* ignore */ }
        return [...DEFAULT_PATTERNS];
    }

    function savePatterns(patterns) {
        try {
            localStorage.setItem(STORAGE_KEY_PATTERNS, JSON.stringify(patterns));
        } catch (e) { /* ignore */ }
    }

    const SELECTORS = {
        MESSAGES: 'li, article.chatbox-message',
        CHAT_CONTAINER: '.chatroom__messages, #chatbox__messages',
        UI_PANEL: '#chatbox_header .panel__actions',
        WRAPPER_ID: 'bothider-wrap'
    };

    class BotHider {
        constructor() {
            this.isEnabled = localStorage.getItem(STORAGE_KEY_ENABLED) !== 'false';
            this.filterMode = localStorage.getItem(STORAGE_KEY_MODE) || 'names';
            this.botNames = loadBotNames();
            this.patterns = loadPatterns();
            this.compiledPatterns = [];
            this.observer = null;
            this.hiddenCount = 0;
            this.compilePatterns();
            this.init();
        }

        compilePatterns() {
            this.compiledPatterns = [];
            for (const p of this.patterns) {
                try {
                    this.compiledPatterns.push(new RegExp(p, 'i'));
                } catch (e) { /* skip invalid regex */ }
            }
        }

        init() {
            this.injectStyles();
            this.injectUI();
            this.processMessages();
            this.setupObserver();
        }

        injectStyles() {
            if (document.getElementById('bothider-custom-css')) return;
            const style = document.createElement('style');
            style.id = 'bothider-custom-css';
            style.textContent = `
                .bh-inactive { display: none !important; }
                #bothider-wrap {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 0 10px;
                    border-right: 1px solid rgba(255,255,255,0.1);
                    height: 100%;
                }
                .bh-toggle {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    cursor: pointer;
                    user-select: none;
                    transition: opacity 0.2s;
                }
                .bh-toggle:hover { opacity: 0.8; }
                .bh-toggle input { cursor: pointer; margin: 0; }
                .bh-toggle span {
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: rgba(255,255,255,0.9);
                    letter-spacing: 0.5px;
                }
                .bh-settings-btn {
                    background: none;
                    border: 1px solid rgba(255,255,255,0.2);
                    color: rgba(255,255,255,0.7);
                    border-radius: 4px;
                    padding: 2px 6px;
                    font-size: 11px;
                    cursor: pointer;
                    transition: all 0.2s;
                }
                .bh-settings-btn:hover {
                    background: rgba(255,255,255,0.1);
                    color: #fff;
                }
                .bh-counter {
                    font-size: 10px;
                    color: #888;
                    min-width: 20px;
                    text-align: center;
                }
                .bh-settings-overlay {
                    position: fixed;
                    top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0,0,0,0.7);
                    z-index: 29999;
                }
                .bh-settings-panel {
                    position: fixed;
                    top: 50%; left: 50%;
                    transform: translate(-50%, -50%);
                    background: #1a1a1a;
                    border: 1px solid #444;
                    border-radius: 8px;
                    padding: 20px;
                    z-index: 30000;
                    color: #ddd;
                    font-family: system-ui, sans-serif;
                    min-width: 360px;
                    max-width: 90vw;
                    max-height: 80vh;
                    overflow-y: auto;
                    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
                }
                .bh-settings-panel h3 {
                    margin: 0 0 12px 0;
                    color: #fff;
                    border-bottom: 1px solid #333;
                    padding-bottom: 8px;
                    font-size: 14px;
                }
                .bh-settings-panel label {
                    display: block;
                    font-size: 12px;
                    color: #aaa;
                    margin-bottom: 4px;
                }
                .bh-settings-panel input[type="text"] {
                    width: 100%;
                    padding: 6px 10px;
                    border: 1px solid #444;
                    border-radius: 4px;
                    background: #111;
                    color: #ddd;
                    font-size: 12px;
                    box-sizing: border-box;
                    margin-bottom: 8px;
                }
                .bh-settings-panel input[type="text"]:focus {
                    outline: none;
                    border-color: #2ecc71;
                }
                .bh-settings-panel .bh-tag-list {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                    margin-bottom: 10px;
                }
                .bh-settings-panel .bh-tag {
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 8px;
                    background: #333;
                    border-radius: 4px;
                    font-size: 11px;
                    color: #ddd;
                }
                .bh-settings-panel .bh-tag-remove {
                    cursor: pointer;
                    color: #e74c3c;
                    font-weight: bold;
                    font-size: 13px;
                }
                .bh-settings-panel .bh-tag-remove:hover { color: #ff6b6b; }
                .bh-settings-panel .bh-row {
                    display: flex;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .bh-settings-panel .bh-row input[type="text"] {
                    flex: 1;
                    margin-bottom: 0;
                }
                .bh-settings-panel .bh-row button {
                    padding: 6px 12px;
                    background: #2ecc71;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    white-space: nowrap;
                }
                .bh-settings-panel .bh-row button:hover { background: #27ae60; }
                .bh-settings-panel .bh-save-btn {
                    width: 100%;
                    padding: 8px;
                    background: #2ecc71;
                    color: #fff;
                    border: none;
                    border-radius: 4px;
                    font-weight: bold;
                    cursor: pointer;
                    margin-top: 8px;
                }
                .bh-settings-panel .bh-save-btn:hover { background: #27ae60; }
                .bh-settings-panel .bh-hint {
                    font-size: 10px;
                    color: #666;
                    margin-top: -6px;
                    margin-bottom: 8px;
                }
                .bh-settings-panel .bh-mode-row {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 12px;
                }
                .bh-settings-panel .bh-mode-row label {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                    color: #ddd;
                    font-size: 12px;
                }
            `;
            document.head.appendChild(style);
        }

        shouldHide(textContent) {
            if (!this.isEnabled) return false;
            const lower = textContent.toLowerCase();

            for (const name of this.botNames) {
                if (lower.includes(name.toLowerCase())) return true;
            }

            for (const re of this.compiledPatterns) {
                if (re.test(textContent)) return true;
            }

            return false;
        }

        processMessages() {
            const targets = document.querySelectorAll(SELECTORS.MESSAGES);
            this.hiddenCount = 0;

            targets.forEach(el => {
                const content = el.textContent || '';
                if (this.shouldHide(content)) {
                    el.classList.add('bh-inactive');
                    this.hiddenCount++;
                } else {
                    el.classList.remove('bh-inactive');
                }
            });

            this.updateCounter();
        }

        updateCounter() {
            const counter = document.querySelector('.bh-counter');
            if (counter) {
                counter.textContent = this.hiddenCount > 0 ? `(${this.hiddenCount})` : '';
                counter.title = this.hiddenCount > 0 ? `${this.hiddenCount} messages hidden` : '';
            }
        }

        injectUI() {
            if (document.getElementById(SELECTORS.WRAPPER_ID)) return;

            const panel = document.querySelector(SELECTORS.UI_PANEL);
            if (!panel) return;

            const controls = document.createElement('div');
            controls.id = SELECTORS.WRAPPER_ID;

            const labelWrap = document.createElement('label');
            labelWrap.className = 'bh-toggle';
            labelWrap.innerHTML = `
                <input type="checkbox" id="bh-cb" ${this.isEnabled ? 'checked' : ''}>
                <span>Hide Bots</span>
            `;

            labelWrap.querySelector('input').addEventListener('change', (e) => {
                this.isEnabled = e.target.checked;
                localStorage.setItem(STORAGE_KEY_ENABLED, this.isEnabled);
                this.processMessages();
            });

            const counter = document.createElement('span');
            counter.className = 'bh-counter';

            const settingsBtn = document.createElement('button');
            settingsBtn.className = 'bh-settings-btn';
            settingsBtn.textContent = '\u2699';
            settingsBtn.title = 'Bot Hider Settings';
            settingsBtn.addEventListener('click', () => this.openSettings());

            controls.append(labelWrap, counter, settingsBtn);
            panel.prepend(controls);
        }

        openSettings() {
            if (document.querySelector('.bh-settings-overlay')) return;

            const overlay = document.createElement('div');
            overlay.className = 'bh-settings-overlay';
            overlay.onclick = () => overlay.remove();

            const panel = document.createElement('div');
            panel.className = 'bh-settings-panel';
            panel.onclick = (e) => e.stopPropagation();

            const renderTagList = (container, items, onRemove) => {
                container.innerHTML = '';
                items.forEach((item, i) => {
                    const tag = document.createElement('span');
                    tag.className = 'bh-tag';
                    tag.innerHTML = `${item.replace(/</g, '&lt;')} <span class="bh-tag-remove" data-idx="${i}">\u00D7</span>`;
                    tag.querySelector('.bh-tag-remove').onclick = (e) => {
                        e.stopPropagation();
                        onRemove(i);
                        renderTagList(container, items, onRemove);
                    };
                    container.appendChild(tag);
                });
            };

            const names = [...this.botNames];
            const patterns = [...this.patterns];

            panel.innerHTML = `
                <h3>Bot Hider Settings</h3>
                <div class="bh-mode-row">
                    <label><input type="radio" name="bh-mode" value="names" ${this.filterMode === 'names' ? 'checked' : ''}> By Username</label>
                    <label><input type="radio" name="bh-mode" value="patterns" ${this.filterMode === 'patterns' ? 'checked' : ''}> By Pattern</label>
                    <label><input type="radio" name="bh-mode" value="both" ${this.filterMode === 'both' ? 'checked' : ''}> Both</label>
                </div>

                <div class="bh-names-section" style="display:${this.filterMode !== 'patterns' ? 'block' : 'none'}">
                    <label>Bot Names</label>
                    <div class="bh-tag-list" id="bh-names-tags"></div>
                    <div class="bh-row">
                        <input type="text" id="bh-name-input" placeholder="Add bot name...">
                        <button id="bh-name-add">Add</button>
                    </div>
                    <div class="bh-hint">Messages containing these names will be hidden.</div>
                </div>

                <div class="bh-patterns-section" style="display:${this.filterMode !== 'names' ? 'block' : 'none'}">
                    <label>Regex Patterns</label>
                    <div class="bh-tag-list" id="bh-patterns-tags"></div>
                    <div class="bh-row">
                        <input type="text" id="bh-pattern-input" placeholder="Add regex pattern...">
                        <button id="bh-pattern-add">Add</button>
                    </div>
                    <div class="bh-hint">Messages matching these regex patterns will be hidden. Example: <code>has gifted</code> hides gift messages.</div>
                </div>

                <button class="bh-save-btn">Save & Close</button>
            `;

            const namesTags = panel.querySelector('#bh-names-tags');
            const patternsTags = panel.querySelector('#bh-patterns-tags');

            const removeName = (i) => { names.splice(i, 1); };
            const removePattern = (i) => { patterns.splice(i, 1); };

            renderTagList(namesTags, names, removeName);
            renderTagList(patternsTags, patterns, removePattern);

            panel.querySelector('#bh-name-add').onclick = () => {
                const input = panel.querySelector('#bh-name-input');
                const val = input.value.trim();
                if (val && !names.includes(val)) {
                    names.push(val);
                    renderTagList(namesTags, names, removeName);
                }
                input.value = '';
            };

            panel.querySelector('#bh-name-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    panel.querySelector('#bh-name-add').click();
                }
            });

            panel.querySelector('#bh-pattern-add').onclick = () => {
                const input = panel.querySelector('#bh-pattern-input');
                const val = input.value.trim();
                if (val) {
                    try {
                        new RegExp(val, 'i');
                        patterns.push(val);
                        renderTagList(patternsTags, patterns, removePattern);
                    } catch (e) {
                        input.style.borderColor = '#e74c3c';
                        setTimeout(() => { input.style.borderColor = ''; }, 1500);
                    }
                }
                input.value = '';
            };

            panel.querySelector('#bh-pattern-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    panel.querySelector('#bh-pattern-add').click();
                }
            });

            panel.querySelectorAll('input[name="bh-mode"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    this.filterMode = e.target.value;
                    panel.querySelector('.bh-names-section').style.display = this.filterMode !== 'patterns' ? 'block' : 'none';
                    panel.querySelector('.bh-patterns-section').style.display = this.filterMode !== 'names' ? 'block' : 'none';
                });
            });

            panel.querySelector('.bh-save-btn').onclick = () => {
                this.botNames = [...names];
                this.patterns = [...patterns];
                this.compilePatterns();
                saveBotNames(this.botNames);
                savePatterns(this.patterns);
                localStorage.setItem(STORAGE_KEY_MODE, this.filterMode);
                this.processMessages();
                overlay.remove();
            };

            overlay.appendChild(panel);
            document.body.appendChild(overlay);
        }

        setupObserver() {
            if (this.observer) this.observer.disconnect();

            const container = document.querySelector(SELECTORS.CHAT_CONTAINER);
            if (!container) return;

            this.observer = new MutationObserver((mutations) => {
                let shouldProcess = false;
                for (const mutation of mutations) {
                    if (mutation.addedNodes.length > 0) {
                        shouldProcess = true;
                        break;
                    }
                }

                if (shouldProcess) {
                    this.injectUI();
                    this.processMessages();
                }
            });

            this.observer.observe(container, { childList: true, subtree: true });
        }
    }

    let currentInstance = null;

    const start = () => {
        if (currentInstance && currentInstance.observer) {
            currentInstance.observer.disconnect();
            currentInstance.observer = null;
        }
        currentInstance = new BotHider();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('turbolinks:load', start);
})();
