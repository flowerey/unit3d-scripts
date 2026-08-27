// ==UserScript==
// @name         UNIT3D Encode Type
// @namespace    https://github.com/flowerey/unit3d-scripts
// @version      2.0
// @description  Adds encode analysis, compatibility checks, and quality indicators to mediainfo.
// @author       blueberry
// @match        https://*/torrents/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    // ───────────────────────────────────────────────────────────
    // State
    // ───────────────────────────────────────────────────────────
    const state = {
        // Video
        videoFormat: null,
        videoBits: NaN,
        videoSettings: {},
        videoResolution: null,
        videoHeight: NaN,
        videoWidth: NaN,
        container: null,
        videoHdrFormat: "",
        fps: null,
        frameRateMode: null,
        writingLibrary: null,
        scanType: null,
        colorSpace: null,
        chromaSubsampling: null,
        aspectRatio: null,
        videoBitrate: null,

        // Audio
        audioFormat: null,
        audioChannels: null,
        audioBitrate: null,
        audioLanguage: null,
        audioTracks: [],

        // Subtitles
        subtitleCount: 0,
        subtitleLanguages: [],

        // Computed
        bitsPerPixel: null,

        // DOM references
        mediainfoSection: null,
        generalSection: null,
        encodeSettings: null,
        audioSection: null,
        videoSection: null,

        // Analysis
        streamOpFailed: [],
        dxvaOpFailed: [],
        analysisResults: []
    };

    // ───────────────────────────────────────────────────────────
    // Mediainfo DOM Helpers
    // ───────────────────────────────────────────────────────────
    function getMediainfoElement(className) {
        try {
            const section = state.mediainfoSection;
            if (!section) return null;
            const el = section.getElementsByClassName(className)[0];
            if (!el) return null;
            return el.getElementsByTagName("dl")[0] || null;
        } catch {
            return null;
        }
    }

    function getMediainfoGeneral() {
        return getMediainfoElement("mediainfo__general");
    }

    function getMediainfoVideo() {
        return getMediainfoElement("mediainfo__video");
    }

    function getMediainfoAudio() {
        return getMediainfoElement("mediainfo__audio");
    }

    function getMediainfoEncodeSettings() {
        try {
            return state.mediainfoSection
                .getElementsByClassName("mediainfo__encode-settings")[0]
                .getElementsByTagName("code")[0];
        } catch {
            return null;
        }
    }

    function getMediainfoSection() {
        try {
            return document.getElementsByClassName("mediainfo")[0] || null;
        } catch {
            return null;
        }
    }

    function getMediainfoSubtitles() {
        try {
            return state.mediainfoSection
                .getElementsByClassName("mediainfo__subtitles")[0] || null;
        } catch {
            return null;
        }
    }

    // ───────────────────────────────────────────────────────────
    // Utility
    // ───────────────────────────────────────────────────────────
    function parseNumeric(text) {
        if (!text) return NaN;
        return parseFloat(String(text).replace(/[^0-9.\-]/g, '')) || NaN;
    }

    function addResult(category, name, status, value, detail) {
        state.analysisResults.push({ category, name, status, value, detail });
    }

    // ───────────────────────────────────────────────────────────
    // Resolution & Container Parsing
    // ───────────────────────────────────────────────────────────
    function set_resolution() {
        try {
            state.videoSection = getMediainfoVideo();
            if (!state.videoSection) throw new Error("No video section");

            const videoNodes = state.videoSection.childNodes;
            let i = 1;
            while (i < videoNodes.length) {
                if (videoNodes.innerHTML.trim() == "Resolution") {
                    state.videoWidth = videoNodes[i + 2].innerHTML.split("\u00D7")[0].replace(' ', '').trim();
                    state.videoHeight = videoNodes[i + 2].innerHTML.split("\u00D7")[1].replace(' ', '').trim();
                    break;
                }
                i += 2;
            }
        } catch {
            state.videoWidth = NaN;
            state.videoHeight = NaN;
        }

        try {
            state.videoResolution = document.getElementsByClassName("torrent__resolution-link")[0].innerHTML.trim();
        } catch {
            state.videoResolution = "Unknown";
        }
    }

    function set_container() {
        try {
            state.generalSection = getMediainfoGeneral();
            if (!state.generalSection) throw new Error("No general section");

            const generalNodes = state.generalSection.childNodes;
            let i = 1;
            while (i < generalNodes.length) {
                if (generalNodes.innerHTML.trim() == "Format") {
                    state.container = generalNodes[i + 2].innerHTML.trim();
                    break;
                }
                i += 2;
            }
        } catch {
            state.container = "Unknown";
        }
    }

    function set_hdr_type() {
        try {
            const mediainfoVideoSection = getMediainfoVideo();
            if (!mediainfoVideoSection) throw new Error("No video section");

            const videoNodes = mediainfoVideoSection.childNodes;
            let i = 1;
            while (i < videoNodes.length) {
                if (videoNodes.innerHTML.trim() == "HDR format") {
                    state.videoHdrFormat = videoNodes[i + 2].innerHTML.trim();
                }
                i += 2;
            }
        } catch {
            state.videoHdrFormat = "SDR";
        }
    }

    // ───────────────────────────────────────────────────────────
    // Encode Settings Parsing
    // ───────────────────────────────────────────────────────────
    function set_video_enc_settings(encodeSettingsText) {
        const parts = encodeSettingsText.split(" / ");
        for (const setting of parts) {
            const eqIndex = setting.indexOf('=');
            if (eqIndex === -1) continue;
            const name = setting.substring(0, eqIndex);
            const value = setting.substring(eqIndex + 1);
            state.videoSettings[name] = value;
        }
    }

    // ───────────────────────────────────────────────────────────
    // New: Video Detail Parsing
    // ───────────────────────────────────────────────────────────
    function parseVideoDetails() {
        const videoSection = getMediainfoVideo();
        if (!videoSection) return;

        // Try reading dt/dd pairs from the video section's dl
        const dl = videoSection.getElementsByTagName("dl")[0];
        if (!dl) return;

        const nodes = dl.childNodes;
        let i = 1;
        while (i < nodes.length) {
            const dt = nodes[i];
            if (!dt || dt.nodeType !== 1) { i += 2; continue; }

            const label = (dt.textContent || "").trim().toLowerCase();
            const dd = nodes[i + 1];
            const value = dd ? dd.textContent.trim() : "";

            if (label.includes("frame rate") && !label.includes("mode")) {
                state.fps = parseNumeric(value);
            } else if (label.includes("frame rate mode")) {
                state.frameRateMode = value;
            } else if (label.includes("writing library") || label.includes("encoded library")) {
                state.writingLibrary = value;
            } else if (label.includes("scan type")) {
                state.scanType = value;
            } else if (label.includes("color space")) {
                state.colorSpace = value;
            } else if (label.includes("chroma")) {
                state.chromaSubsampling = value;
            } else if (label.includes("aspect ratio") && !state.aspectRatio) {
                state.aspectRatio = value;
            } else if (label.includes("bit rate") && !label.includes("mode") && !label.includes("nominal")) {
                state.videoBitrate = parseNumeric(value);
            }

            i += 2;
        }
    }

    // ───────────────────────────────────────────────────────────
    // New: Audio Detail Parsing
    // ───────────────────────────────────────────────────────────
    function parseAudioDetails() {
        const audioSection = getMediainfoAudio();
        if (!audioSection) return;

        const dl = audioSection.getElementsByTagName("dl")[0];
        if (!dl) return;

        const ddElements = dl.getElementsByTagName("dd");
        state.audioTracks = [];

        for (const dd of ddElements) {
            const text = dd.textContent.trim();
            // Format: "language / format / channels / bitrate / title"
            const parts = text.split('/').map(p => p.trim());
            const track = {
                language: parts[0] || "",
                format: parts[1] || "",
                channels: parts[2] || "",
                bitrate: parts[3] || "",
                title: parts[4] || ""
            };
            state.audioTracks.push(track);
        }

        // Use first audio track as primary
        if (state.audioTracks.length > 0) {
            const primary = state.audioTracks[0];
            state.audioFormat = primary.format;
            state.audioChannels = primary.channels;
            state.audioBitrate = primary.bitrate;
            state.audioLanguage = primary.language;
        }
    }

    // ───────────────────────────────────────────────────────────
    // New: Subtitle Parsing
    // ───────────────────────────────────────────────────────────
    function parseSubtitles() {
        const subtitlesSection = getMediainfoSubtitles();
        if (!subtitlesSection) return;

        const items = subtitlesSection.querySelectorAll("li");
        state.subtitleCount = items.length;
        state.subtitleLanguages = [];

        for (const li of items) {
            const img = li.querySelector("img");
            if (img) {
                const title = img.getAttribute("title") || "";
                const lang = title.split("|")[0].trim();
                if (lang) state.subtitleLanguages.push(lang);
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // New: Bits Per Pixel
    // ───────────────────────────────────────────────────────────
    function calculateBitsPerPixel() {
        const w = parseFloat(state.videoWidth);
        const h = parseFloat(state.videoHeight);
        const fps = parseFloat(state.fps);
        const bitrate = parseFloat(state.videoBitrate);

        if (!w || !h || !fps || !bitrate || fps <= 0) {
            state.bitsPerPixel = null;
            return;
        }

        state.bitsPerPixel = bitrate / (w * h * fps);
    }

    // ───────────────────────────────────────────────────────────
    // Existing: DXVA Check
    // ───────────────────────────────────────────────────────────
    function is_dxva() {
        if (state.dxvaOpFailed.length > 0) return false;

        if (state.videoFormat != "AVC" || state.videoBits > 8) {
            state.dxvaOpFailed.push("Must be AVC 8bit");
            return false;
        }

        const pixels = state.videoHeight * state.videoWidth;
        const refLimits = [
            { maxPixels: 1920 * 1088, maxRef: 4 },
            { maxPixels: 1920 * 864, maxRef: 5 },
            { maxPixels: 1920 * 720, maxRef: 6 },
            { maxPixels: 1280 * 720, maxRef: 9 },
            { maxPixels: 1280 * 648, maxRef: 10 },
            { maxPixels: 1280 * 588, maxRef: 11 },
            { maxPixels: 1280 * 540, maxRef: 12 }
        ];

        for (const limit of refLimits) {
            if (pixels <= limit.maxPixels && state.videoSettings.ref > limit.maxRef) {
                state.dxvaOpFailed.push(`ref = ${state.videoSettings.ref} > ${limit.maxRef} max.`);
                break;
            }
        }

        if (state.videoSettings.analyse && state.videoSettings.analyse.trim() != "0x3:0x113" && state.videoSettings.analyse.trim() != "0x3:0x133") {
            state.dxvaOpFailed.push(`analyse = ${state.videoSettings.analyse.trim()} != (0x3:0x113 or 0x3:0x133)`);
        }
        if (state.videoSettings.vbv_maxrate > 62500) {
            state.dxvaOpFailed.push(`vbv_maxrate = ${state.videoSettings.vbv_maxrate}kbps > 62500kbps max.`);
        }
        return state.dxvaOpFailed.length == 0;
    }

    // ───────────────────────────────────────────────────────────
    // Existing: Stream Optimized Check
    // ───────────────────────────────────────────────────────────
    function is_stream_op() {
        set_hdr_type();
        if (state.streamOpFailed.length > 0) return false;

        if (state.container != "MPEG-4") {
            state.streamOpFailed.push("Must use mp4 container");
        }

        let aq_mode = 0;
        try {
            aq_mode = state.videoSettings.aq.substring(0, state.videoSettings.aq.indexOf(':'));
        } catch {
            aq_mode = state.videoSettings["aq-mode"];
        }

        switch (state.videoResolution) {
            case "1080p":
            case "720p":
                if (state.videoFormat != "AVC") {
                    state.streamOpFailed.push("Must use x264");
                }
                if (!(state.videoSettings.me == "umh" || state.videoSettings.me == "esa" || state.videoSettings.me == "tesa")) {
                    state.streamOpFailed.push(`me = ${state.videoSettings.me} < "umh"`);
                }
                if (state.videoSettings.ref > 3) {
                    state.streamOpFailed.push(`ref (${state.videoSettings.ref}) > 3 max`);
                }
                if (state.videoSettings.bframes > 6) {
                    state.streamOpFailed.push(`bframes (${state.videoSettings.bframes}) > 6 max`);
                }
                if (state.videoSettings.rc_lookahead < 80) {
                    state.streamOpFailed.push(`rc-lookahead (${state.videoSettings.rc_lookahead}) < 80 min`);
                }
                if (state.videoSettings.trellis != 2) {
                    state.streamOpFailed.push(`trellis (${state.videoSettings.trellis}) must be 2`);
                }
                if (aq_mode != 2) {
                    state.streamOpFailed.push(`aq-mode (${aq_mode}) must be 2`);
                }
                break;
            case "2160p":
                if (state.videoFormat != "HEVC") {
                    state.streamOpFailed.push("Must use x265");
                }
                if (!state.videoHdrFormat.includes("HDR10")) {
                    state.streamOpFailed.push('Must be HDR10 or HLG');
                }
                if (state.videoSettings.me < 2) {
                    state.streamOpFailed.push(`me = ${state.videoSettings.me} < "umh (2)"`);
                }
                if (state.videoSettings.ref > 4) {
                    state.streamOpFailed.push(`ref (${state.videoSettings.ref}) > 4 max`);
                }
                if (state.videoSettings.bframes > 8) {
                    state.streamOpFailed.push(`bframes (${state.videoSettings.bframes}) > 8 max`);
                }
                if (state.videoSettings["rc-lookahead"] < 80) {
                    state.streamOpFailed.push(`rc-lookahead (${state.videoSettings["rc-lookahead"]}) < 80 min`);
                }
                if ("b-intra" in state.videoSettings) {
                    state.streamOpFailed.push("Must use no-b-intra");
                }
                if (aq_mode < 2) {
                    state.streamOpFailed.push(`aq-mode (${aq_mode}) < 2 min`);
                }
                break;
        }
        return state.streamOpFailed.length == 0;
    }

    // ───────────────────────────────────────────────────────────
    // Existing: Encode Type Detection
    // ───────────────────────────────────────────────────────────
    function get_enc_type() {
        switch (state.videoSettings.rc) {
            case "crf":
                return `Constant Rate Factor (${state.videoSettings.crf})`;
            case "2pass":
                return `Multi-Pass (${state.videoSettings.bitrate} kbps)`;
        }

        try {
            if (state.videoSettings["stats-read"] > 0) {
                return `Multi-Pass (${state.videoSettings.bitrate} kbps)`;
            }
            return `Single-Pass (${state.videoSettings.bitrate} kbps)`;
        } catch {
            try {
                return `Single-Pass (${state.videoSettings.bitrate} kbps)`;
            } catch {
                return "Unknown";
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // NEW CHECKS: Bitrate Quality
    // ───────────────────────────────────────────────────────────
    function runBitrateChecks() {
        // Bits per pixel
        if (state.bitsPerPixel !== null) {
            const bpp = state.bitsPerPixel;
            if (bpp < 0.025) {
                addResult("Bitrate", "Bits/pixel", "fail", bpp.toFixed(4), "Critically low — encode may look blurry/blocky");
            } else if (bpp < 0.04) {
                addResult("Bitrate", "Bits/pixel", "warn", bpp.toFixed(4), "Low — may lose fine detail");
            } else if (bpp > 0.20) {
                addResult("Bitrate", "Bits/pixel", "warn", bpp.toFixed(4), "Unusually high — consider lower bitrate");
            } else {
                addResult("Bitrate", "Bits/pixel", "pass", bpp.toFixed(4), "Good");
            }
        }

        // Bitrate vs resolution sanity
        if (state.videoBitrate && state.videoResolution) {
            const br = state.videoBitrate;
            const ranges = {
                "4320p": { min: 40000, max: 200000 },
                "2160p": { min: 15000, max: 100000 },
                "1080p": { min: 4000, max: 40000 },
                "720p": { min: 2000, max: 15000 },
                "480p": { min: 1000, max: 8000 }
            };
            const range = ranges[state.videoResolution];
            if (range) {
                if (br < range.min) {
                    addResult("Bitrate", "Bitrate vs resolution", "warn", `${br} kbps`, `Below typical range (${range.min}-${range.max} kbps) for ${state.videoResolution}`);
                } else if (br > range.max) {
                    addResult("Bitrate", "Bitrate vs resolution", "warn", `${br} kbps`, `Above typical range (${range.min}-${range.max} kbps) for ${state.videoResolution}`);
                } else {
                    addResult("Bitrate", "Bitrate vs resolution", "pass", `${br} kbps`, `Within typical range for ${state.videoResolution}`);
                }
            }
        }

        // Bitrate cap
        if (state.videoBitrate) {
            const br = state.videoBitrate;
            const is4k = state.videoResolution === "2160p" || state.videoResolution === "4320p";
            const cap = is4k ? 100000 : 40000;
            if (br > cap) {
                addResult("Bitrate", "Bitrate cap", "warn", `${br} kbps`, `Exceeds ${cap / 1000} Mbps cap for ${is4k ? "4K" : "HD"}`);
            } else {
                addResult("Bitrate", "Bitrate cap", "pass", `${br} kbps`, `Under ${cap / 1000} Mbps cap`);
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // NEW CHECKS: Encode Settings
    // ───────────────────────────────────────────────────────────
    function runEncodeSettingsChecks() {
        const s = state.videoSettings;
        const isHEVC = state.videoFormat === "HEVC";

        // Preset
        if (s.preset) {
            const slowPresets = ["veryslow", "slower", "slow"];
            const medPresets = ["medium"];
            if (slowPresets.includes(s.preset)) {
                addResult("Encode", "Preset", "pass", s.preset, "Quality preset");
            } else if (medPresets.includes(s.preset)) {
                addResult("Encode", "Preset", "pass", s.preset, "Balanced preset");
            } else {
                addResult("Encode", "Preset", "warn", s.preset, "Fast preset — may sacrifice quality");
            }
        }

        // b-adapt
        if (s["b-adapt"] !== undefined) {
            if (s["b-adapt"] == 2) {
                addResult("Encode", "b-adapt", "pass", s["b-adapt"], "Optimal (2)");
            } else {
                addResult("Encode", "b-adapt", "warn", s["b-adapt"], "Expected 2 for quality");
            }
        }

        // direct
        if (s.direct !== undefined) {
            if (s.direct == 3 || s.direct == "auto") {
                addResult("Encode", "direct", "pass", s.direct, "Optimal");
            } else {
                addResult("Encode", "direct", "warn", s.direct, "Expected 3/auto for quality");
            }
        }

        // psy-rd
        if (s["psy-rd"] !== undefined) {
            addResult("Encode", "psy-rd", "info", s["psy-rd"], "Psycho-visual optimization enabled");
        }

        // rc-lookahead max
        if (s.rc_lookahead || s["rc-lookahead"]) {
            const lh = parseInt(s.rc_lookahead || s["rc-lookahead"], 10);
            const maxLH = isHEVC ? 200 : 250;
            if (lh > maxLH) {
                addResult("Encode", "rc-lookahead", "warn", lh, `Above max ${maxLH} for ${isHEVC ? "x265" : "x264"}`);
            }
        }

        // bframes max
        if (s.bframes) {
            const bf = parseInt(s.bframes, 10);
            if (bf > 16) {
                addResult("Encode", "bframes", "warn", bf, "Above typical max of 16");
            }
        }

        // Lossless detection
        if (s.crf == 0 || s.qp == 0) {
            addResult("Encode", "Lossless", "warn", `CRF=${s.crf || "N/A"} QP=${s.qp || "N/A"}`, "Lossless encode — very large file size");
        }
    }

    // ───────────────────────────────────────────────────────────
    // NEW CHECKS: Compatibility
    // ───────────────────────────────────────────────────────────
    function runCompatibilityChecks() {
        // HEVC hardware decode
        if (state.videoFormat === "HEVC") {
            const w = parseFloat(state.videoWidth);
            const h = parseFloat(state.videoHeight);
            const bits = state.videoBits;
            const ref = parseInt(state.videoSettings.ref, 10) || 0;
            const pixels = w * h;

            const issues = [];
            if (bits > 10) issues.push(`${bits}-bit HEVC not hardware decodable`);
            if (pixels > 3840 * 2160) issues.push("Resolution too high for HW decode");
            if (pixels <= 3840 * 2160 && pixels > 1920 * 1088 && ref > 1) issues.push(`ref ${ref} too high for 4K HW decode`);
            if (pixels <= 1920 * 1088 && pixels > 1280 * 720 && ref > 3) issues.push(`ref ${ref} too high for 1080p HW decode`);
            if (pixels <= 1280 * 720 && ref > 4) issues.push(`ref ${ref} too high for 720p HW decode`);

            if (issues.length === 0) {
                addResult("Compat", "HEVC HW decode", "pass", "Compatible", "Hardware decode supported");
            } else {
                addResult("Compat", "HEVC HW decode", "warn", "Issues", issues.join("; "));
            }
        }

        // Audio codec
        if (state.audioFormat) {
            const good = ["AAC", "AC-3", "E-AC-3", "FLAC", "Opus"];
            const ok = ["DTS", "DTS-ES", "DTS-HD Master Audio"];
            if (good.some(g => state.audioFormat.includes(g))) {
                addResult("Compat", "Audio codec", "pass", state.audioFormat, "Widely supported");
            } else if (ok.some(g => state.audioFormat.includes(g))) {
                addResult("Compat", "Audio codec", "info", state.audioFormat, "Supported but may need transcoding");
            } else {
                addResult("Compat", "Audio codec", "warn", state.audioFormat, "May not be universally supported");
            }
        }

        // Subtitle presence
        if (state.subtitleCount > 0) {
            addResult("Compat", "Subtitles", "pass", `${state.subtitleCount} track(s)`, state.subtitleLanguages.join(", "));
        } else {
            addResult("Compat", "Subtitles", "warn", "None", "No subtitle tracks found");
        }

        // Scan type
        if (state.scanType) {
            if (state.scanType.toLowerCase().includes("progressive")) {
                addResult("Compat", "Scan type", "pass", state.scanType, "Progressive — ideal");
            } else {
                addResult("Compat", "Scan type", "warn", state.scanType, "Interlaced — may cause artifacts on modern displays");
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // NEW CHECKS: Visual Quality
    // ───────────────────────────────────────────────────────────
    function runVisualQualityChecks() {
        // Color space
        if (state.colorSpace) {
            addResult("Visual", "Color space", "info", state.colorSpace, "");
        }

        // Chroma subsampling
        if (state.chromaSubsampling) {
            if (state.chromaSubsampling === "4:2:0") {
                addResult("Visual", "Chroma", "pass", state.chromaSubsampling, "Standard for video distribution");
            } else if (state.chromaSubsampling === "4:2:2") {
                addResult("Visual", "Chroma", "info", state.chromaSubsampling, "Higher chroma fidelity — broadcast/mastering");
            } else if (state.chromaSubsampling === "4:4:4") {
                addResult("Visual", "Chroma", "info", state.chromaSubsampling, "Full chroma — uncommon for distribution");
            } else {
                addResult("Visual", "Chroma", "info", state.chromaSubsampling, "");
            }
        }

        // Frame rate mode
        if (state.frameRateMode) {
            if (state.frameRateMode.toLowerCase().includes("constant")) {
                addResult("Visual", "FR mode", "pass", state.frameRateMode, "CFR — preferred");
            } else {
                addResult("Visual", "FR mode", "info", state.frameRateMode, "VFR — may cause sync issues in some players");
            }
        }

        // Film vs video
        if (state.fps && state.scanType) {
            const fps = state.fps;
            const isProgressive = state.scanType.toLowerCase().includes("progressive");
            const filmFps = [23.976, 24, 25, 29.97, 30];
            if (isProgressive && filmFps.some(f => Math.abs(fps - f) < 0.1)) {
                addResult("Visual", "Source", "info", "Likely film", `${fps} fps progressive`);
            } else if (!isProgressive) {
                addResult("Visual", "Source", "info", "Likely video", "Interlaced content");
            }
        }
    }

    // ───────────────────────────────────────────────────────────
    // NEW CHECKS: Encoding Type
    // ───────────────────────────────────────────────────────────
    function runEncodingTypeChecks() {
        // Encoder detection
        const lib = (state.writingLibrary || "").toLowerCase();
        if (lib.includes("x264")) {
            addResult("Info", "Encoder", "info", "x264", state.writingLibrary);
        } else if (lib.includes("x265") || lib.includes("hevc")) {
            addResult("Info", "Encoder", "info", "x265", state.writingLibrary);
        } else if (lib.includes("svt")) {
            addResult("Info", "Encoder", "info", "SVT-AV1", state.writingLibrary);
        } else if (lib.includes("aom") || lib.includes("libaom")) {
            addResult("Info", "Encoder", "info", "libaom", state.writingLibrary);
        } else if (lib.includes("rav1e")) {
            addResult("Info", "Encoder", "info", "rav1e", state.writingLibrary);
        } else if (lib.includes("vpx") || lib.includes("libvpx")) {
            addResult("Info", "Encoder", "info", "libvpx", state.writingLibrary);
        } else if (lib.includes("ffmpeg") || lib.includes("lavc")) {
            addResult("Info", "Encoder", "info", "FFmpeg", state.writingLibrary);
        } else if (lib.includes("encoder")) {
            addResult("Info", "Encoder", "info", state.writingLibrary, "");
        }

        // QPRF detection
        if (state.videoSettings["stats-read"] > 0 && state.videoSettings.bitrate) {
            addResult("Info", "Passes", "info", "Multi-pass", `stats-read=${state.videoSettings["stats-read"]}`);
        }

        // Encoding type summary
        addResult("Info", "Rate control", "info", get_enc_type(), "");
    }

    // ───────────────────────────────────────────────────────────
    // NEW: General Info
    // ───────────────────────────────────────────────────────────
    function buildGeneralInfo() {
        // Duration
        try {
            const gn = getMediainfoGeneral();
            if (gn) {
                const nodes = gn.childNodes;
                let i = 1;
                while (i < nodes.length) {
                    if (nodes.innerHTML.trim() == "Duration") {
                        const duration = nodes[i + 1] ? nodes[i + 1].textContent.trim() : "";
                        if (duration) addResult("Info", "Duration", "info", duration, "");
                        break;
                    }
                    i += 2;
                }
            }
        } catch {}

        // File size
        try {
            const gn = getMediainfoGeneral();
            if (gn) {
                const nodes = gn.childNodes;
                let i = 1;
                while (i < nodes.length) {
                    if (nodes.innerHTML.trim() == "Size") {
                        const size = nodes[i + 1] ? nodes[i + 1].textContent.trim() : "";
                        if (size) addResult("Info", "File size", "info", size, "");
                        break;
                    }
                    i += 2;
                }
            }
        } catch {}

        // Audio info summary
        if (state.audioFormat) {
            const parts = [state.audioFormat];
            if (state.audioChannels) parts.push(state.audioChannels);
            if (state.audioBitrate) parts.push(state.audioBitrate);
            addResult("Info", "Audio", "info", parts.join(" / "), state.audioLanguage || "");
        }

        // Subtitle summary
        if (state.subtitleCount > 0) {
            addResult("Info", "Subtitles", "info", `${state.subtitleCount} track(s)`, state.subtitleLanguages.join(", "));
        }
    }

    // ───────────────────────────────────────────────────────────
    // Display: Inject dt/dd into Mediainfo Section
    // ───────────────────────────────────────────────────────────
    function addMediainfoEntries() {
        const generalSection = getMediainfoGeneral();
        if (!generalSection) return;

        const dl = generalSection;
        const existingDDs = dl.getElementsByTagName("dd");
        if (existingDDs.length === 0) return;

        const lastDD = existingDDs[existingDDs.length - 1];

        const entries = [
            // Existing
            { label: "Stream Optimized", value: is_stream_op() ? "True" : `False (${state.streamOpFailed.length} issues)`, title: is_stream_op() ? "" : state.streamOpFailed.join("\n") },
            { label: "DXVA Compatible", value: is_dxva() ? "True" : `False (${state.dxvaOpFailed.length} issues)`, title: is_dxva() ? "" : state.dxvaOpFailed.join("\n") },

            // New computed
            state.bitsPerPixel !== null ? { label: "Bits/Pixel", value: state.bitsPerPixel.toFixed(4) } : null,
            state.writingLibrary ? { label: "Encoder", value: state.writingLibrary } : null,
            state.fps ? { label: "Frame Rate", value: `${state.fps} fps${state.frameRateMode ? ` (${state.frameRateMode})` : ""}` } : null,
            state.scanType ? { label: "Scan Type", value: state.scanType } : null,
            state.colorSpace ? { label: "Color Space", value: state.colorSpace } : null,
            state.chromaSubsampling ? { label: "Chroma", value: state.chromaSubsampling } : null,
            state.audioFormat ? { label: "Audio", value: `${state.audioFormat} ${state.audioChannels || ""} ${state.audioBitrate || ""}`.trim() } : null,
            state.subtitleCount > 0 ? { label: "Subtitles", value: `${state.subtitleCount} (${state.subtitleLanguages.join(", ")})` } : null
        ].filter(Boolean);

        // Insert after the last existing dd
        let prevElement = lastDD;
        for (const entry of entries) {
            const dt = document.createElement('dt');
            dt.innerHTML = entry.label;
            prevElement.after(dt);

            const dd = document.createElement('dd');
            dd.innerHTML = entry.value;
            if (entry.title) dd.title = entry.title;
            dt.after(dd);
            prevElement = dd;
        }
    }

    // ───────────────────────────────────────────────────────────
    // Display: Collapsible Analysis Panel
    // ───────────────────────────────────────────────────────────
    function injectAnalysisPanel() {
        if (state.analysisResults.length === 0) return;

        // Add CSS
        const style = document.createElement('style');
        style.textContent = `
            .encode-analysis-panel {
                margin-top: 10px;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 4px;
                background: rgba(0,0,0,0.15);
            }
            .encode-analysis-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                cursor: pointer;
                user-select: none;
                font-weight: 600;
                font-size: 13px;
                color: #ccc;
                transition: background 0.2s;
            }
            .encode-analysis-header:hover {
                background: rgba(255,255,255,0.05);
            }
            .encode-analysis-header .toggle-icon {
                transition: transform 0.2s;
                font-size: 11px;
            }
            .encode-analysis-header.collapsed .toggle-icon {
                transform: rotate(-90deg);
            }
            .encode-analysis-body {
                padding: 0 12px 10px;
                max-height: 400px;
                overflow-y: auto;
            }
            .encode-analysis-body.hidden {
                display: none;
            }
            .ea-category {
                margin-top: 8px;
                padding-top: 6px;
                border-top: 1px solid rgba(255,255,255,0.06);
            }
            .ea-category:first-child {
                margin-top: 0;
                padding-top: 0;
                border-top: none;
            }
            .ea-category-title {
                font-size: 11px;
                font-weight: 700;
                color: #999;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
            }
            .ea-row {
                display: flex;
                align-items: baseline;
                gap: 6px;
                padding: 2px 0;
                font-size: 12px;
                line-height: 1.4;
            }
            .ea-icon {
                flex-shrink: 0;
                width: 14px;
                text-align: center;
                font-weight: 700;
            }
            .ea-icon.pass { color: #66ff66; }
            .ea-icon.warn { color: #ffcc00; }
            .ea-icon.fail { color: #ff4d4d; }
            .ea-icon.info { color: #888; }
            .ea-name {
                color: #ccc;
                min-width: 100px;
            }
            .ea-value {
                color: #fff;
                font-weight: 600;
            }
            .ea-detail {
                color: #888;
                font-size: 11px;
            }
        `;
        document.head.appendChild(style);

        // Build panel
        const panel = document.createElement('div');
        panel.className = 'encode-analysis-panel';

        const header = document.createElement('div');
        header.className = 'encode-analysis-header';
        header.innerHTML = '<span>Encode Analysis</span><span class="toggle-icon">\u25BC</span>';

        const body = document.createElement('div');
        body.className = 'encode-analysis-body';

        header.onclick = () => {
            body.classList.toggle('hidden');
            header.classList.toggle('collapsed');
        };

        // Group results by category
        const categories = {};
        for (const r of state.analysisResults) {
            if (!categories[r.category]) categories[r.category] = [];
            categories[r.category].push(r);
        }

        const categoryOrder = ["Bitrate", "Encode", "Compat", "Visual", "Info"];
        for (const cat of categoryOrder) {
            const results = categories[cat];
            if (!results || results.length === 0) continue;

            const catDiv = document.createElement('div');
            catDiv.className = 'ea-category';
            catDiv.innerHTML = `<div class="ea-category-title">${cat}</div>`;

            for (const r of results) {
                const row = document.createElement('div');
                row.className = 'ea-row';

                const icon = r.status === "pass" ? "\u2713" : r.status === "warn" ? "\u26A0" : r.status === "fail" ? "\u2717" : "\u2022";
                row.innerHTML = `
                    <span class="ea-icon ${r.status}">${icon}</span>
                    <span class="ea-name">${r.name}</span>
                    <span class="ea-value">${r.value}</span>
                    ${r.detail ? `<span class="ea-detail">${r.detail}</span>` : ""}
                `;
                catDiv.appendChild(row);
            }

            body.appendChild(catDiv);
        }

        panel.appendChild(header);
        panel.appendChild(body);

        // Insert after mediainfo section
        const mediainfoSection = getMediainfoSection();
        if (mediainfoSection && mediainfoSection.parentNode) {
            mediainfoSection.parentNode.insertBefore(panel, mediainfoSection.nextSibling);
        }
    }

    // ───────────────────────────────────────────────────────────
    // Init
    // ───────────────────────────────────────────────────────────
    function init() {
        set_resolution();

        state.mediainfoSection = getMediainfoSection();
        if (!state.mediainfoSection) return;

        state.encodeSettings = getMediainfoEncodeSettings();
        if (!state.encodeSettings) return;

        state.audioSection = getMediainfoAudio();
        state.videoSection = getMediainfoVideo();
        state.generalSection = getMediainfoGeneral();

        // Parse all data
        set_video_enc_settings(state.encodeSettings.textContent);
        parseVideoDetails();
        parseAudioDetails();
        parseSubtitles();
        calculateBitsPerPixel();

        // Run all checks
        runBitrateChecks();
        runEncodeSettingsChecks();
        runCompatibilityChecks();
        runVisualQualityChecks();
        runEncodingTypeChecks();
        buildGeneralInfo();

        // Display
        insert_enc_type();
        set_container();
        addMediainfoEntries();
        injectAnalysisPanel();
    }

    // ───────────────────────────────────────────────────────────
    // Existing: Insert encode type into video format line
    // ───────────────────────────────────────────────────────────
    function insert_enc_type() {
        state.videoSection = getMediainfoVideo();
        if (!state.videoSection) return;

        const videoDD = state.videoSection.getElementsByTagName("dd");
        for (const dd of videoDD) {
            const text = dd.innerHTML.trim();
            if (text.startsWith("AVC") || text.startsWith("HEVC")) {
                state.videoFormat = text.startsWith("AVC") ? "AVC" : "HEVC";
                state.videoBits = dd.innerHTML.includes("8 bits", 0) ? 8 : 10;
                dd.innerHTML = `${dd.innerHTML} - ${get_enc_type()}`;
                return;
            }
        }
    }

    init();
})();
