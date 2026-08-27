// ==UserScript==
// @name         Encode type
// @version      0.2.3
// @description  Adds information to the mediainfo parser.
// @author       MiM
// @license      MIT
// @match        https://*/torrents/*
// @grant        none
// ==/UserScript==

// Video settings
let video_format = null;
let video_bits = NaN;
let video_settings = {};

let video_resolution = null;
let video_height = NaN;
let video_width = NaN;

let container = null;
let video_hdr_format = "";

let stream_op_failed = [];
let dxva_op_failed = [];

let audio_format = null;

let sub_format = null;
let mediainfo_section = null;
let general_section = null;
let encode_settings = null;
let audio_section = null;
let video_section = null;

function is_dxva() {
    if (dxva_op_failed.length > 0) {
        return false;
    }
    if (video_format != "AVC" || video_bits > 8) {
        dxva_op_failed.push(`Must be AVC 8bit`);
        return false
    };
    if (video_height*video_width > 1920*1088) {
        dxva_op_failed.push(`Resolution > 1920x1088.`);
    }
    if (video_height*video_width <= 1920*1088 && video_height*video_width > 1920*864 && video_settings.ref > 4) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 4 max.`);
    }
    if (video_height*video_width <= 1920*864 && video_height*video_width > 1920*720 && video_settings.ref > 5) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 5 max.`);
    }
    if (video_height*video_width <= 1920*720 && video_height*video_width > 1280*720 && video_settings.ref > 6) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 6 max.`);
    }
    if (video_height*video_width <= 1280*720 && video_height*video_width > 1280*648 && video_settings.ref > 9) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 9 max.`);
    }
    if (video_height*video_width <= 1280*648 && video_height*video_width > 1280*588 && video_settings.ref > 10) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 10 max.`);
    }
    if (video_height*video_width <= 1280*588 && video_height*video_width > 1280*540 && video_settings.ref > 11) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 11 max.`);
    }
    if (video_height*video_width <= 1280*540 && video_height*video_width > 0 && video_settings.ref > 12) {
        dxva_op_failed.push(`ref = ${video_settings.ref} > 12 max.`);
    }
    if (video_settings.analyse.trim() != "0x3:0x113" && video_settings.analyse.trim() != "0x3:0x133") {
        dxva_op_failed.push(`analyse = ${video_settings.analyse.trim()} != (0x3:0x113 or 0x3:0x133)`);
    }
    if (video_settings.vbv_maxrate > 62500) {
        dxva_op_failed.push(`vbv_maxrate = ${video_settings.vbv_maxrate}kbps > 62500kbps max.`);
    }
    return dxva_op_failed.length == 0;
}

function set_dxva_check() {
  general_section = get_mediainfo_general();
  let general_section_dd = general_section.getElementsByTagName("dd");
  let last_general_section_dd = general_section_dd[general_section_dd.length - 1];
  const dt_section = document.createElement('dt');
  dt_section.innerHTML = "DXVA Compatible";
  const dd_section = document.createElement('dd');
  if (is_dxva ()) {
    dd_section.innerHTML = "True";
  }
  else {
    dd_section.innerHTML = `False</br>(${dxva_op_failed.length} issues)`;
    dd_section.title = dxva_op_failed.join(`\n`);
  }
  last_general_section_dd.after(dt_section);
  general_section = get_mediainfo_general();
  let general_section_dt = general_section.getElementsByTagName("dt");
  let last_general_section_dt = general_section_dt[general_section_dt.length - 1];
  last_general_section_dt.after(dd_section);
}

function set_resolution() {
  try {
    video_section = get_mediainfo_video();
    let video_nodes = video_section.childNodes;
    let i = 1;
    while (i < video_nodes.length) {
      if (video_nodes.innerHTML.trim() == "Resolution") {
        video_width = video_nodes[i + 2].innerHTML.split("×")[0].replace(' ', '').trim();
        video_height = video_nodes[i + 2].innerHTML.split("×")[1].replace(' ', '').trim();
        break;
      }
      i += 2;
    }
  }
  catch {
    video_width = NaN;
    video_height = NaN;
  }
  try {
    video_resolution = document.getElementsByClassName("torrent__resolution-link")[0].innerHTML.trim();
  }
  catch {
    video_resolution = "Unknown";
  }
}

function is_stream_op() {
  set_hdr_type();
  if (stream_op_failed.length > 0) {
    return false;
  }
  if (container != "MPEG-4") {
    stream_op_failed.push("Must use mp4 container");
  }
  let aq_mode = 0;
  try {
    aq_mode = video_settings.aq.substring(0, video_settings.aq.indexOf(':'));
  }
  catch {
    aq_mode = video_settings["aq-mode"];
  }
  switch (video_resolution) {
    case "1080p":
    case "720p":
      if (video_format != "AVC") {
        stream_op_failed.push(`Must use x264`);
      }
      if (!(video_settings.me == "umh" || video_settings.me == "esa" || video_settings.me == "tesa")) {
        stream_op_failed.push(`me = ${video_settings.me} < "umh"`);
      }
      if (video_settings.ref > 3) {
        stream_op_failed.push(`ref (${video_settings.ref}) > 3 max`);
      }
      if (video_settings.bframes > 6) {
        stream_op_failed.push(`bframes (${video_settings.bframes}) > 6 max`);
      }
      if (video_settings.rc_lookahead < 80) {
        stream_op_failed.push(`rc-lookahead (${video_settings.rc_lookahead}) < 80 min`);
      }
      if (video_settings.trellis != 2) {
        stream_op_failed.push(`trellis (${video_settings.trellis}) must be 2`);
      }
      if (aq_mode != 2) {
        stream_op_failed.push(`aq-mode (${aq_mode}) must be 2`);
      }
      //TODO: add bitrate check.
      break;
    case "2160p":
      if (video_format != "HEVC") {
        stream_op_failed.push(`Must use x265`);
      }
      // TODO: Add HLG check.
      if (!video_hdr_format.includes("HDR10")) {
        stream_op_failed.push(`Must be HDR10 or HLG"`);
      }
      if (video_settings.me < 2) {
        stream_op_failed.push(`me = ${video_settings.me} < "umh (2)"`);
      }
      if (video_settings.ref > 4) {
        stream_op_failed.push(`ref (${video_settings.ref}) > 4 max`);
      }
      if (video_settings.bframes > 8) {
        stream_op_failed.push(`bframes (${video_settings.bframes}) > 8 max`);
      }
      if (video_settings["rc-lookahead"] < 80) {
        stream_op_failed.push(`rc-lookahead (${video_settings["rc-lookahead"]}) < 80 min`);
      }
      if ("b-intra" in video_settings) {
        stream_op_failed.push(`Must use no-b-intra`);
      }
      if (aq_mode < 2) {
        stream_op_failed.push(`aq-mode (${aq_mode}) < 2 min`);
      }
      //TODO: add bitrate check.
      break;
    default:
      break;
  }
  return stream_op_failed.length == 0;
}

function set_stream_op() {
  general_section = get_mediainfo_general();
  let general_section_dd = general_section.getElementsByTagName("dd");
  let last_general_section_dd = general_section_dd[general_section_dd.length - 1];
  const dt_section = document.createElement('dt');
  dt_section.innerHTML = "Stream Optimized";
  const dd_section = document.createElement('dd');
  if (is_stream_op()) {
    dd_section.innerHTML = "True";
  }
  else {
    dd_section.innerHTML = `False</br>(${stream_op_failed.length} issues)`;
    dd_section.title = stream_op_failed.join(`\n`);
  }
  last_general_section_dd.after(dt_section);
  general_section = get_mediainfo_general();
  let general_section_dt = general_section.getElementsByTagName("dt");
  let last_general_section_dt = general_section_dt[general_section_dt.length - 1];
  last_general_section_dt.after(dd_section);
}

function set_hdr_type() {
  try {
    let mediainfo_video_section = get_mediainfo_video();
    let video_nodes = mediainfo_video_section.childNodes;
    let i = 1;
    while (i < video_nodes.length) {
      if (video_nodes.innerHTML.trim() == "HDR format") {
        video_hdr_format = video_nodes[i + 2].innerHTML.trim();
      }
      i += 2;
    }
  }
  catch {
    video_hdr_format = "SDR";
  }
}

function get_mediainfo_section() {
  try {
    return document.getElementsByClassName("mediainfo")[0];
  }
  catch {
    return null;
  }
}

function get_mediainfo_encode_settings() {
  try {
    return mediainfo_section.getElementsByClassName("mediainfo__encode-settings")[0].getElementsByTagName("code")[0];
  }
  catch {
    return null;
  }
}

function get_mediainfo_audio() {
  try {
    return mediainfo_section.getElementsByClassName("mediainfo__audio")[0].getElementsByTagName("dl")[0];
  }
  catch {
    return null;
  }
}

function get_mediainfo_video() {
  try {
    return mediainfo_section.getElementsByClassName("mediainfo__video")[0].getElementsByTagName("dl")[0];
  }
  catch {
    return null;
  }
}

function get_mediainfo_general() {
  try {
    return mediainfo_section.getElementsByClassName("mediainfo__general")[0].getElementsByTagName("dl")[0];
  }
  catch {
    return null;
  }
}

function set_video_enc_settings(encode_settings) {
  let setting_name = null;
  let setting_value = null;
  let mediainfo_split = encode_settings.split(" / ");
  for (const setting of mediainfo_split) {
    setting_name = setting.substring(0, setting.indexOf('='))
    setting_value = setting.substring(setting.indexOf('=') + 1)
    video_settings[setting_name] = setting_value;
  }
}

function get_enc_type() {
  switch (video_settings.rc) {
    case "crf":
      return `Constant Rate Factor (${video_settings.crf})`;
    case "2pass":
      return `Multi-Pass (${video_settings.bitrate} kbps)`;
  }
  // abr is rest
  try {
    if (video_settings["stats-read"] > 0) {
      return `Multi-Pass (${video_settings.bitrate} kbps)`;
    }
    else {
      return `Single-Pass (${video_settings.bitrate} kbps)`;
    }
  }
  catch {
    try {
      return `Single-Pass (${video_settings.bitrate} kbps)`;
    }
    catch {
      return "Unknown";
    }
  }
}

function set_container() {
  try {
    general_section = get_mediainfo_general();
    let general_nodes = general_section.childNodes;
    let i = 1;
    while (i < general_nodes.length) {
      if (general_nodes.innerHTML.trim() == "Format") {
        container = general_nodes[i + 2].innerHTML.trim();
        break;
      }
      i += 2;
    }
  }
  catch {
    container = "Unknown";
  }
}

function insert_enc_type() {
  video_section = get_mediainfo_video();
  let video_dd = video_section.getElementsByTagName("dd");
  for (const dd of video_dd) {
    if (dd.innerHTML.trim().startsWith("AVC") || dd.innerHTML.trim().startsWith("HEVC")) {
      video_format = dd.innerHTML.trim().startsWith("AVC") ? "AVC" : "HEVC";
      video_bits = dd.innerHTML.includes("8 bits", 0) ? 8 : 10;
      dd.innerHTML = `${dd.innerHTML} - ${get_enc_type()}`;
      return;
    }
  }
}

(function () {
  'use strict';

  set_resolution();
  mediainfo_section = get_mediainfo_section();
  if (!mediainfo_section) {
    return
  }
  encode_settings = get_mediainfo_encode_settings();
  if (!encode_settings) {
    return
  }
  audio_section = get_mediainfo_audio();
  video_section = get_mediainfo_video();
  general_section = get_mediainfo_general();
  set_video_enc_settings(encode_settings.textContent);
  insert_enc_type();
  set_container();
  set_stream_op();
  set_resolution ();
  set_dxva_check();
})();