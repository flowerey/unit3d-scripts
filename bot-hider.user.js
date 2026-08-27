// ==UserScript==
// @name         UNIT3D Bot Hider
// @version      1.1
// @description  Toggles the visibility of bot messages on UNIT3D chatbox.
// @author       blueberry
// @match        https://*/chatbox*
// @match        https://*/chat/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        BOT_NAMES: ['SystemBot'],
        STORAGE_KEY: 'bh_enabled',
        SELECTORS: {
            MESSAGES: 'li, article.chatbox-message',
            CHAT_CONTAINER: '.chatroom__messages, #chatbox__messages',
            UI_PANEL: '#chatbox_header .panel__actions',
            WRAPPER_ID: 'bothider-wrap'
        }
    };

    class BotHider {
        constructor() {
            this.isEnabled = localStorage.getItem(CONFIG.STORAGE_KEY) !== 'false';
            this.observer = null;
            this.init();
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
            `;
            document.head.appendChild(style);
        }

        processMessages() {
            const targets = document.querySelectorAll(CONFIG.SELECTORS.MESSAGES);
            const botNamesLower = CONFIG.BOT_NAMES.map(name => name.toLowerCase());

            targets.forEach(el => {
                const content = el.textContent.toLowerCase();
                const isBotMessage = botNamesLower.some(name => content.includes(name));

                if (isBotMessage) {
                    el.classList.toggle('bh-inactive', this.isEnabled);
                }
            });
        }

        injectUI() {
            if (document.getElementById(CONFIG.WRAPPER_ID)) return;

            const panel = document.querySelector(CONFIG.SELECTORS.UI_PANEL);
            if (!panel) return;

            const controls = document.createElement('div');
            controls.id = CONFIG.WRAPPER_ID;

            const labelWrap = document.createElement('label');
            labelWrap.className = 'bh-toggle';
            labelWrap.innerHTML = `
                <input type="checkbox" id="bh-cb" ${this.isEnabled ? 'checked' : ''}>
                <span>Hide Bots</span>
            `;

            labelWrap.querySelector('input').addEventListener('change', (e) => {
                this.isEnabled = e.target.checked;
                localStorage.setItem(CONFIG.STORAGE_KEY, this.isEnabled);
                this.processMessages();
            });

            controls.append(labelWrap);
            panel.prepend(controls);
        }

        setupObserver() {
            if (this.observer) this.observer.disconnect();

            const container = document.querySelector(CONFIG.SELECTORS.CHAT_CONTAINER);
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

    const start = () => new BotHider();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
    window.addEventListener('turbolinks:load', start);
})();
