// ==UserScript==
// @name         UNIT3D Add Letterboxd/IMDB/RT/TMDB rating
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      1.3
// @description  Add Ratings to Letterboxd/IMDB/RT/TMDB.
// @author       blueberry
// @match        https://*/torrents/similar/*
// @match        https://*/torrents/*
// @match        https://*/requests/*
// @grant        GM.xmlHttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

(function () {
    "use strict";

    const CONFIG = {
        cacheHours: 120,
        defaultOmdbKey: "6be019fc",
        debug: false
    };

    const getOmdbKey = () => GM_getValue("omdb_api_key", "") || CONFIG.defaultOmdbKey;

    const ensureOmdbKey = () => {
        let key = GM_getValue("omdb_api_key", "");
        if (!key) {
            key = prompt("Enter your OMDb API key (get one free at https://www.omdbapi.com/apikey.aspx):", "");
            if (key && key.trim()) {
                GM_setValue("omdb_api_key", key.trim());
            }
        }
        return key || CONFIG.defaultOmdbKey;
    };

    const log = (msg, data) => {
        if (CONFIG.debug) console.log(`%c[U3D Rating] ${msg}`, "color: cyan; font-weight: bold;", data || "");
    };

    const Cache = {
        get: (key) => {
            const data = localStorage.getItem(key);
            if (!data) return null;
            try {
                const parsed = JSON.parse(data);
                if (Date.now() - parsed.timestamp > CONFIG.cacheHours * 3600000) {
                    localStorage.removeItem(key);
                    return null;
                }
                return parsed.value;
            } catch (e) { return null; }
        },
        set: (key, value) => {
            localStorage.setItem(key, JSON.stringify({ value: value, timestamp: Date.now() }));
        }
    };

    const injectStyles = () => {
        const style = document.createElement("style");
        style.textContent = `
            .rating-value { font-size: 13px; font-weight: 700; margin-left: 8px; vertical-align: middle; display: inline-block; animation: fadeIn 0.3s ease-in; }
            .meta__ids li a.meta-id-tag { display: inline-flex !important; align-items: center; }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            .meta__filmweb img { width: 18px; height: auto; vertical-align: middle; }
        `;
        document.head.appendChild(style);
    };

    const getColor = (rating, scale = 10) => {
        let n = parseFloat(rating);
        if (scale === 100) n /= 10;
        if (scale === 5) n *= 2;
        if (isNaN(n)) return "var(--text-color)";
        if (n < 5) return "#ff4d4d";
        if (n < 7) return "#ffcc00";
        if (n < 9) return "#66ff66";
        return "#40E0D0";
    };

    const renderRating = (element, rating, scale = 10, suffix = "") => {
        if (!element) return;
        const link = element.tagName === 'A' ? element : element.querySelector('a');
        if (!link || link.querySelector('.rating-value')) return;

        const span = document.createElement("span");
        span.className = "rating-value";
        span.style.color = getColor(rating, scale);
        span.innerText = rating + suffix;
        link.appendChild(span);
    };

    const handleFilmweb = (metaList) => {
        if (document.querySelector('.meta__filmweb')) return;

        const titleEl = document.querySelector('.meta__title') || document.querySelector('h1.panel__heading');
        if (!titleEl) return;

        const cleanTitle = titleEl.textContent
            .replace(/[\n\r]+/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/\[.*?\]/g, '')
            .replace(/\./g, ' ')
            .trim();

        const fwLink = `https://duckduckgo.com/?q=\\${encodeURIComponent(cleanTitle)}%20site%3Afilmweb.pl`;

        const li = document.createElement('li');
        li.className = 'meta__filmweb';
        li.innerHTML = `
            <a href="${fwLink}" class="meta-id-tag" target="_blank" title="Filmweb: ${cleanTitle}">
                <img src="https://fwcdn.pl/prt/static/images/fw/icons2/512x512.png" class="meta-id-icon" alt="Filmweb">
            </a>
        `;
        metaList.appendChild(li);
    };

    const handleOMDB = (imdbId, els) => {
        const cacheKey = `u3d_omdb_${imdbId}`;
        const cached = Cache.get(cacheKey);

        if (cached) {
            if (cached.imdb) renderRating(els.imdb, cached.imdb, 10);
            if (cached.rt && els.rt) renderRating(els.rt, cached.rt.replace('%',''), 100, '%');
            if (cached.rtUrl && els.rt) {
                const rtLink = els.rt.querySelector('a');
                if (rtLink) rtLink.href = cached.rtUrl;
            }
            return;
        }

        const apiKey = ensureOmdbKey();

        GM.xmlHttpRequest({
            method: "GET",
            url: `http://www.omdbapi.com/?apikey=${apiKey}&tomatoes=true&i=${imdbId}`,
            onload: (res) => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (!json || json.Response === "False") return;

                    const dataToCache = {};
                    if (json.imdbRating && json.imdbRating !== "N/A") {
                        dataToCache.imdb = json.imdbRating;
                        renderRating(els.imdb, json.imdbRating, 10);
                    }

                    const rtObj = json.Ratings ? json.Ratings.find(r => r.Source === "Rotten Tomatoes") : null;
                    if (rtObj) {
                        dataToCache.rt = rtObj.Value;
                        if(els.rt) renderRating(els.rt, rtObj.Value.replace('%',''), 100, '%');
                    }

                    if (json.tomatoURL && json.tomatoURL !== "N/A") {
                        dataToCache.rtUrl = json.tomatoURL;
                        if(els.rt && els.rt.querySelector('a')) els.rt.querySelector('a').href = json.tomatoURL;
                    }

                    if (Object.keys(dataToCache).length > 0) Cache.set(cacheKey, dataToCache);
                } catch (e) {
                    log("OMDB parse error", e);
                }
            },
            onerror: (e) => log("OMDB request error", e),
            ontimeout: () => log("OMDB request timed out")
        });
    };

    const handleLetterboxd = (imdbId, container) => {
        const cacheKey = `u3d_lb_${imdbId}`;
        const cached = Cache.get(cacheKey);

        if (cached) {
            renderRating(container, cached, 5);
            return;
        }

        GM.xmlHttpRequest({
            method: "GET",
            url: `https://letterboxd.com/imdb/${imdbId}`,
            onload: (res) => {
                if (res.status !== 200) return;
                const match = res.responseText.match(/"ratingValue":\s*([0-9.]+)/);
                if (match && match[1]) {
                    const rating = parseFloat(match[1]).toFixed(1);
                    renderRating(container, rating, 5);
                    Cache.set(cacheKey, rating);
                }
            },
            onerror: (e) => log("Letterboxd request error", e)
        });
    };

    const handleBluray = (imdbId, container) => {
        const cacheKey = `u3d_br_${imdbId}`;
        const cached = Cache.get(cacheKey);

        const updateUI = (url, rating) => {
            const link = container.querySelector('a');
            if (link && url) link.href = url;
            if (rating) renderRating(container, rating, 10);
        };

        if (cached) {
            updateUI(cached.url, cached.rating);
            return;
        }

        GM.xmlHttpRequest({
            method: "GET",
            url: `https://www.blu-ray.com/search/?quicksearch=1&quicksearch_keyword=${imdbId}&section=theatrical`,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            onload: (res) => {
                if (res.responseText.includes("No results were found")) {
                    container.remove();
                    return;
                }

                let targetUrl = res.finalUrl;
                let rating = null;

                const parser = new DOMParser();
                const doc = parser.parseFromString(res.responseText, "text/html");
                const firstResult = doc.querySelector('.figure');

                if (firstResult) {
                    const linkEl = firstResult.querySelector('a');
                    if (linkEl && linkEl.href) targetUrl = linkEl.href;

                    const starEl = firstResult.querySelector('.fa-star');
                    if (starEl) {
                        rating = starEl.innerText.trim();
                    } else {
                        const textNodes = firstResult.innerText;
                        const match = textNodes.match(/(\d\.\d)/);
                        if(match) rating = match[1];
                    }
                } else if (!targetUrl.includes("/search/")) {
                    const ratingContainer = doc.querySelector('#rating_score') || doc.querySelector('[itemprop="ratingValue"]');
                    if (ratingContainer) rating = ratingContainer.innerText.trim();
                }

                if (targetUrl.includes("/search/") && !rating) {
                    container.remove();
                    return;
                }

                Cache.set(cacheKey, { url: targetUrl, rating: rating });
                updateUI(targetUrl, rating);
            },
            onerror: (e) => log("Blu-ray request error", e)
        });
    };

    const init = () => {
        injectStyles();

        const metaList = document.querySelector('.meta__ids');
        if (metaList) handleFilmweb(metaList);

        const imdbLink = document.querySelector('[href*="://www.imdb.com/title/tt"]');
        if (!imdbLink) return;

        const idMatch = imdbLink.href.match(/tt\d+/);
        const imdbId = idMatch ? idMatch[0] : null;
        if (!imdbId) return;

        const Elements = {
            imdb: document.querySelector('.meta__imdb'),
            rt: document.querySelector('.meta__rotten'),
            tmdb: document.querySelector('.meta__tmdb'),
            lb: document.querySelector('.meta__letterboxd'),
            br: document.querySelector('.meta__bluray') || document.querySelector('a[href*="blu-ray.com"]')?.closest('li')
        };

        if (Elements.lb) {
            const img = Elements.lb.querySelector('img');
            if (img && img.src.includes('polishtorrent.top')) {
                img.src = 'https://infinityhd.net/img/meta/letterboxd.svg';
            }
        }

        if (Elements.tmdb) {
            const tmdbRatingEl = document.querySelector('.work__rating .work__rating-text');
            if (tmdbRatingEl) {
                renderRating(Elements.tmdb, tmdbRatingEl.innerText.trim(), 100);
                const oldContainer = document.querySelector('.work__rating');
                if(oldContainer) oldContainer.remove();
            }
        }

        if (Elements.imdb || Elements.rt) handleOMDB(imdbId, Elements);
        if (Elements.lb) handleLetterboxd(imdbId, Elements.lb);
        if (Elements.br) handleBluray(imdbId, Elements.br);
    };

    init();

})();
