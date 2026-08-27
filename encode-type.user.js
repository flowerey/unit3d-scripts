// ==UserScript==
// @name         Encode type
// @version      0.3
// @description  Adds information to the mediainfo parser.
// @author       MiM
// @license      MIT
// @match        https://*/torrents/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const state = {
        videoFormat: null,
        videoBits: NaN,
        videoSettings: {},
        videoResolution: null,
        videoHeight: NaN,
        videoWidth: NaN,
        container: null,
        videoHdrFormat: "",
        streamOpFailed: [],
        dxvaOpFailed: [],
        mediainfoSection: null,
        generalSection: null,
        encodeSettings: null,
        audioSection: null,
        videoSection: null
    };

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

    function is_dxva() {
        if (state.dxvaOpFailed.length > 0) {
            return false;
        }
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

        if (state.videoSettings.analyse.trim() != "0x3:0x113" && state.videoSettings.analyse.trim() != "0x3:0x133") {
            state.dxvaOpFailed.push(`analyse = ${state.videoSettings.analyse.trim()} != (0x3:0x113 or 0x3:0x133)`);
        }
        if (state.videoSettings.vbv_maxrate > 62500) {
            state.dxvaOpFailed.push(`vbv_maxrate = ${state.videoSettings.vbv_maxrate}kbps > 62500kbps max.`);
        }
        return state.dxvaOpFailed.length == 0;
    }

    function set_dxva_check() {
        const generalSection = getMediainfoGeneral();
        if (!generalSection) return;

        const generalSectionDD = generalSection.getElementsByTagName("dd");
        const lastGeneralSectionDD = generalSectionDD[generalSectionDD.length - 1];

        const dtSection = document.createElement('dt');
        dtSection.innerHTML = "DXVA Compatible";

        const ddSection = document.createElement('dd');
        if (is_dxva()) {
            ddSection.innerHTML = "True";
        } else {
            ddSection.innerHTML = `False</br>(${state.dxvaOpFailed.length} issues)`;
            ddSection.title = state.dxvaOpFailed.join("\n");
        }

        lastGeneralSectionDD.after(dtSection);

        const updatedGeneral = getMediainfoGeneral();
        if (!updatedGeneral) return;
        const generalSectionDT = updatedGeneral.getElementsByTagName("dt");
        const lastGeneralSectionDT = generalSectionDT[generalSectionDT.length - 1];
        lastGeneralSectionDT.after(ddSection);
    }

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

    function is_stream_op() {
        set_hdr_type();
        if (state.streamOpFailed.length > 0) {
            return false;
        }

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
                    state.streamOpFailed.push('Must be HDR10 or HLG"');
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

    function set_stream_op() {
        const generalSection = getMediainfoGeneral();
        if (!generalSection) return;

        const generalSectionDD = generalSection.getElementsByTagName("dd");
        const lastGeneralSectionDD = generalSectionDD[generalSectionDD.length - 1];

        const dtSection = document.createElement('dt');
        dtSection.innerHTML = "Stream Optimized";

        const ddSection = document.createElement('dd');
        if (is_stream_op()) {
            ddSection.innerHTML = "True";
        } else {
            ddSection.innerHTML = `False</br>(${state.streamOpFailed.length} issues)`;
            ddSection.title = state.streamOpFailed.join("\n");
        }

        lastGeneralSectionDD.after(dtSection);

        const updatedGeneral = getMediainfoGeneral();
        if (!updatedGeneral) return;
        const generalSectionDT = updatedGeneral.getElementsByTagName("dt");
        const lastGeneralSectionDT = generalSectionDT[generalSectionDT.length - 1];
        lastGeneralSectionDT.after(ddSection);
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

    function init() {
        set_resolution();

        state.mediainfoSection = getMediainfoSection();
        if (!state.mediainfoSection) return;

        state.encodeSettings = getMediainfoEncodeSettings();
        if (!state.encodeSettings) return;

        state.audioSection = getMediainfoAudio();
        state.videoSection = getMediainfoVideo();
        state.generalSection = getMediainfoGeneral();

        set_video_enc_settings(state.encodeSettings.textContent);
        insert_enc_type();
        set_container();
        set_stream_op();
        set_dxva_check();
    }

    init();
})();
