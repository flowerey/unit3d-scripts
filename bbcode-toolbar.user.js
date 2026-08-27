// ==UserScript==
// @name         UNIT3D BBCode Toolbar
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.0
// @description  Rich formatting toolbar with preview for chatbox, forums, and upload descriptions.
// @author       blueberry
// @match        https://*/*
// @downloadURL  https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bbcode-toolbar.user.js
// @updateURL    https://raw.githubusercontent.com/flowerey/unit3d-scripts/main/bbcode-toolbar.user.js.meta.js
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'bb_drafts';
    const toolbarStyle = `
        .bb-toolbar {
            display: flex; flex-wrap: wrap; gap: 2px; padding: 4px 6px;
            background: #1a1a2e; border: 1px solid #444; border-bottom: none;
            border-radius: 4px 4px 0 0; font-size: 12px;
        }
        .bb-toolbar button {
            background: #16213e; color: #ddd; border: 1px solid #333;
            border-radius: 3px; padding: 3px 7px; cursor: pointer;
            font-size: 12px; line-height: 1; min-width: 26px; text-align: center;
        }
        .bb-toolbar button:hover { background: #0f3460; color: #fff; }
        .bb-toolbar button.active { background: #e94560; color: #fff; }
        .bb-toolbar .bb-sep { width: 1px; background: #444; margin: 0 3px; align-self: stretch; }
        .bb-preview {
            display: none; padding: 8px; background: #0a0a23; color: #ddd;
            border: 1px solid #444; border-radius: 0 0 4px 4px;
            max-height: 250px; overflow-y: auto; font-size: 13px;
        }
        .bb-charcount { font-size: 11px; color: #888; padding: 2px 6px; }
    `;

    const buttons = [
        { label: 'B', title: 'Bold', tag: 'b' },
        { label: 'I', title: 'Italic', tag: 'i' },
        { label: 'U', title: 'Underline', tag: 'u' },
        { label: 'S', title: 'Strikethrough', tag: 's' },
        'sep',
        { label: 'Size', title: 'Size', prompt: 'Font size (px):', tag: 'size' },
        { label: 'Color', title: 'Color', prompt: 'Color name or hex:', tag: 'color' },
        { label: 'Font', title: 'Font', prompt: 'Font name:', tag: 'font' },
        'sep',
        { label: 'UL', title: 'Bullet List', tag: 'list' },
        { label: 'OL', title: 'Numbered List', tag: 'list=1' },
        { label: 'LI', title: 'List Item', tag: '*' },
        'sep',
        { label: 'URL', title: 'Link', prompt: 'URL:', wrap: 'url' },
        { label: 'Img', title: 'Image', prompt: 'Image URL:', wrap: 'img' },
        { label: 'YT', title: 'YouTube', prompt: 'YouTube ID:', wrap: 'youtube' },
        'sep',
        { label: 'Quote', title: 'Quote', tag: 'quote' },
        { label: 'Code', title: 'Code', tag: 'code' },
        { label: 'Spoiler', title: 'Spoiler', prompt: 'Spoiler title (optional):', wrap: 'spoiler' },
        'sep',
        { label: 'Sub', title: 'Subscript', tag: 'sub' },
        { label: 'Sup', title: 'Superscript', tag: 'sup' },
        { label: 'HR', title: 'Horizontal Rule', insert: '[hr]' },
        { label: 'Table', title: 'Table', insert: '[table]\n[tr]\n[th]Header 1[/th]\n[th]Header 2[/th]\n[/tr]\n[tr]\n[td]Cell 1[/td]\n[td]Cell 2[/td]\n[/tr]\n[/table]' },
    ];

    function wrapSelection(textarea, tag) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        if (selected) {
            textarea.value = before + `[${tag}]${selected}[/${tag}]` + after;
        } else {
            textarea.value = before + `[${tag}][/${tag}]` + after;
            textarea.selectionStart = textarea.selectionEnd = start + tag.length + 2;
        }
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function wrapUrl(textarea, tag, url) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(end);
        if (tag === 'url' && url) {
            textarea.value = before + `[url=${url}]${selected || url}[/url]` + after;
        } else if (tag === 'img' && url) {
            textarea.value = before + `[img]${url}[/img]` + after;
        } else if (tag === 'youtube' && url) {
            textarea.value = before + `[youtube]${url}[/youtube]` + after;
        } else if (tag === 'spoiler') {
            textarea.value = before + (url ? `[spoiler=${url}]${selected}[/spoiler]` : `[spoiler]${selected}[/spoiler]`) + after;
        }
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function insertText(textarea, text) {
        const start = textarea.selectionStart;
        const before = textarea.value.substring(0, start);
        const after = textarea.value.substring(textarea.selectionEnd);
        textarea.value = before + text + after;
        textarea.focus();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function bbToHtml(text) {
        return text
            .replace(/\[b\]/gi, '<b>').replace(/\[\/b\]/gi, '</b>')
            .replace(/\[i\]/gi, '<i>').replace(/\[\/i\]/gi, '</i>')
            .replace(/\[u\]/gi, '<u>').replace(/\[\/u\]/gi, '</u>')
            .replace(/\[s\]/gi, '<s>').replace(/\[\/s\]/gi, '</s>')
            .replace(/\[sub\]/gi, '<sub>').replace(/\[\/sub\]/gi, '</sub>')
            .replace(/\[sup\]/gi, '<sup>').replace(/\[\/sup\]/gi, '</sup>')
            .replace(/\[hr\]/gi, '<hr>')
            .replace(/\[code\]/gi, '<pre style="background:#16213e;padding:6px;border-radius:3px;">').replace(/\[\/code\]/gi, '</pre>')
            .replace(/\[quote\]/gi, '<blockquote style="border-left:3px solid #e94560;padding-left:8px;color:#aaa;">').replace(/\[\/quote\]/gi, '</blockquote>')
            .replace(/\[quote=([^\]]*)\]/gi, '<blockquote style="border-left:3px solid #e94560;padding-left:8px;color:#aaa;"><em>$1:</em><br>')
            .replace(/\[spoiler\]/gi, '<details style="background:#16213e;padding:4px;border-radius:3px;"><summary>Spoiler</summary>').replace(/\[spoiler=([^\]]*)\]/gi, '<details style="background:#16213e;padding:4px;border-radius:3px;"><summary>$1</summary>')
            .replace(/\[\/spoiler\]/gi, '</details>')
            .replace(/\[url=([^\]]*)\]([^\[]*)\[\/url\]/gi, '<a href="$1" style="color:#4fc3f7;">$2</a>')
            .replace(/\[url\]([^\[]*)\[\/url\]/gi, '<a href="$1" style="color:#4fc3f7;">$1</a>')
            .replace(/\[img\]([^\[]*)\[\/img\]/gi, '<img src="$1" style="max-width:300px;max-height:200px;border-radius:3px;">')
            .replace(/\[youtube\]([^\[]*)\[\/youtube\]/gi, '<div style="color:#e94560;">[YouTube: $1]</div>')
            .replace(/\[color=([^\]]*)\]/gi, '<span style="color:$1;">').replace(/\[\/color\]/gi, '</span>')
            .replace(/\[size=([^\]]*)\]/gi, '<span style="font-size:$1px;">').replace(/\[\/size\]/gi, '</span>')
            .replace(/\[font=([^\]]*)\]/gi, '<span style="font-family:$1;">').replace(/\[\/font\]/gi, '</span>')
            .replace(/\[list\]/gi, '<ul>').replace(/\[\/list\]/gi, '</ul>')
            .replace(/\[list=1\]/gi, '<ol>').replace(/\[list=a\]/gi, '<ol type="a">').replace(/\[\/list\]/gi, '</ol>')
            .replace(/\[\*\]/g, '<li>')
            .replace(/\[table\]/gi, '<table style="border-collapse:collapse;">').replace(/\[\/table\]/gi, '</table>')
            .replace(/\[tr\]/gi, '<tr>').replace(/\[\/tr\]/gi, '</tr>')
            .replace(/\[th\]/gi, '<th style="border:1px solid #444;padding:4px;background:#16213e;">').replace(/\[\/th\]/gi, '</th>')
            .replace(/\[td\]/gi, '<td style="border:1px solid #444;padding:4px;">').replace(/\[\/td\]/gi, '</td>')
            .replace(/\n/g, '<br>');
    }

    function saveDraft(id, text) {
        try {
            const drafts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            drafts[id] = text;
            localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
        } catch { }
    }

    function loadDraft(id) {
        try {
            const drafts = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
            return drafts[id] || '';
        } catch { return ''; }
    }

    function createToolbar(textarea) {
        if (textarea.dataset.bbToolbar) return;
        textarea.dataset.bbToolbar = '1';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'width:100%;';
        textarea.parentNode.insertBefore(wrapper, textarea);
        wrapper.appendChild(textarea);

        const toolbar = document.createElement('div');
        toolbar.className = 'bb-toolbar';

        const style = document.createElement('style');
        style.textContent = toolbarStyle;
        document.head.appendChild(style);

        buttons.forEach(btn => {
            if (btn === 'sep') {
                const sep = document.createElement('div');
                sep.className = 'bb-sep';
                toolbar.appendChild(sep);
                return;
            }
            const el = document.createElement('button');
            el.textContent = btn.label;
            el.title = btn.title;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                if (btn.insert) {
                    insertText(textarea, btn.insert);
                } else if (btn.prompt) {
                    const val = prompt(btn.prompt);
                    if (val !== null) {
                        if (btn.wrap) {
                            wrapUrl(textarea, btn.wrap, val);
                        } else {
                            wrapSelection(textarea, btn.tag);
                        }
                    }
                } else {
                    wrapSelection(textarea, btn.tag);
                }
                updatePreview();
                updateCharCount();
                saveDraft(textarea.id || textarea.name, textarea.value);
            });
            toolbar.appendChild(el);
        });

        const previewBtn = document.createElement('button');
        previewBtn.textContent = 'Preview';
        previewBtn.style.cssText = 'margin-left:auto; background:#0f3460; color:#4fc3f7; border:1px solid #4fc3f7;';
        let previewVisible = false;
        previewBtn.addEventListener('click', (e) => {
            e.preventDefault();
            previewVisible = !previewVisible;
            const previewEl = wrapper.querySelector('.bb-preview');
            if (previewVisible) {
                previewEl.innerHTML = bbToHtml(textarea.value);
                previewEl.style.display = 'block';
            } else {
                previewEl.style.display = 'none';
            }
        });
        toolbar.appendChild(previewBtn);

        const preview = document.createElement('div');
        preview.className = 'bb-preview';

        const charCount = document.createElement('span');
        charCount.className = 'bb-charcount';
        charCount.textContent = `${textarea.value.length} chars`;

        wrapper.insertBefore(toolbar, textarea);
        wrapper.appendChild(charCount);
        wrapper.appendChild(preview);

        textarea.addEventListener('input', () => {
            updateCharCount();
            saveDraft(textarea.id || textarea.name, textarea.value);
        });

        function updateCharCount() {
            charCount.textContent = `${textarea.value.length} chars`;
        }

        function updatePreview() {
            if (previewVisible) {
                preview.innerHTML = bbToHtml(textarea.value);
            }
        }

        const draft = loadDraft(textarea.id || textarea.name);
        if (draft && !textarea.value) textarea.value = draft;

        textarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey) {
                if (e.key === 'b') { e.preventDefault(); wrapSelection(textarea, 'b'); }
                else if (e.key === 'i') { e.preventDefault(); wrapSelection(textarea, 'i'); }
                else if (e.key === 'u') { e.preventDefault(); wrapSelection(textarea, 'u'); }
            }
        });
    }

    function scanForTextareas() {
        const selectors = [
            'textarea#chatbox__messages-create',
            'textarea[name="message"]',
            'textarea[name="content"]',
            'textarea[name="description"]',
            '.chatroom__new-message textarea',
            '.form__group textarea',
        ];
        document.querySelectorAll(selectors.join(',')).forEach(ta => {
            if (!ta.dataset.bbToolbar) createToolbar(ta);
        });
    }

    const obs = new MutationObserver(scanForTextareas);
    obs.observe(document.body, { childList: true, subtree: true });
    scanForTextareas();
})();
