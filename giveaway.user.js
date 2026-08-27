// ==UserScript==
// @name         Blutopia BON Giveaway
// @namespace    https://openuserjs.org/users/Nums
// @description  Enables the functionality to become poor
// @version      6.3.0
// @updateURL    https://openuserjs.org/meta/Nums/Blutopia_BON_Giveaway.meta.js
// @downloadURL  https://openuserjs.org/install/Nums/Blutopia_BON_Giveaway.user.js
// @connect      openuserjs.org
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @license      GPL-3.0-or-later
// @match        https://*/
// @run-at document-idle
// ==/UserScript==

// ==OpenUserJS==
// @author Nums
// ==/OpenUserJS==

//*****If the website is not listed as a match already. Please verify with tracker admins before using this script on their site.*****
//*****It is unlikely the bon gifting portion of the script will work on any site not in the default match list.*****

// Additional credits
// @TheEther - Integration with Aither + some additional features
// @Nums - added new commands, command spam detection, admin controls, multi-winners, refactored BON API polling + trying to keep the public version updated
// @ahoimate - got BON gifting API polling working + added new commands
// @ruckus612 - fixed BON gift bug
// @ZukoXZuko - added formatting to the giveaway menu

(function() {
    'use strict';

    // ───────────────────────────────────────────────────────────
    // SECTION 1: Global Constants and Configuration
    // ───────────────────────────────────────────────────────────
    const COMMAND_WINDOW_MS = 10000; // look back 10 seconds
    const MAX_COMMANDS_PER_WINDOW = 3; // allow 3 commands in that window
    const BASE_PENALTY_SECONDS = 30; // base lockout for exceeding (in seconds)

    // Spam filter tightening (keeps responses snappy but reduces chat spam):
    // - MIN_ACTION_GAP_MS blocks ultra-fast repeat triggers (usually bots/double-sends)
    // - REPEAT_COMMAND_COOLDOWNS_MS prevents the same command from being spammed for identical output
    // - strikes increase lockout length for repeat offenders (decays over time)
    const MIN_ACTION_GAP_MS = 900; // ignore triggers faster than this per user
    const ENTRY_FEEDBACK_COOLDOWN_MS = 8000; // throttle duplicate/out-of-range feedback per user
    const STRIKE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    const MAX_STRIKE_MULTIPLIER = 8; // caps exponential backoff

    const REPEAT_COMMAND_COOLDOWNS_MS = Object.freeze({
        entry: 2000,
        time: 3000,
        entries: 5000,
        free: 7000,
        lucky: 7000,
        luckye: 7000,
        random: 7000,
        range: 5000,
        sponsors: 8000,
        stats: 8000,
        top: 8000,
        most: 8000,
        largest: 8000,
        scale: 5000
    });const RIG_DENY_COOLDOWN_MS = 10000; // 10s per-user cooldown for funny !rig/!unrig denial messages
    const MAX_WINNERS = 50; // central location to update max allowable number of winners
    const MAX_REMINDERS = 6; //maximum number of reminders allowed

    // Persistent stats (saved in localStorage on this site)
    const STATS_KEY = `BON_GIVEAWAY_STATS::${location.hostname}`;
    const STATS_VERSION = 1;
    const STATS_DEFAULT_TOP_N = 3;
    const STATS_MAX_TOP_N = 10;

    // Default text to populate the custom giveaway message field
    const DEFAULT_CUSTOM_MESSAGE = "";
    const GIFT_HINT_COLOR = "#F3D34A";
    const SCALING_ACCENT_COLOR = "#7C4DFF";

    const ENTRY_IGNORE_WINDOW_MS = 2000;



    // Sponsor announcement controls (host chat spam reduction)
    // - mode: "immediate" (old behavior), "digest" (recommended), or "off" (silent; still counts sponsors)
    // - digest_ms: max frequency for sponsor announcements in chat
    // - immediate_single_min: big single gifts are announced right away (even in digest mode)
    // - flush_min_total: announce early if combined pending sponsorship reaches this BON
    // - show_top_n / show_min_per_user: keep the line short; omit tiny sponsors from the name list (still counted in totals)
    const SPONSOR_ANNOUNCE = {
        mode: "digest",
        digest_ms: 60_000,
        immediate_single_min: 500,
        flush_min_total: 250,
        max_pending_events: 50,
        show_top_n: Infinity,
        show_min_per_user: 0
    };

    const GENERAL_SETTINGS = {
        disable_random: false,
        disable_lucky: false,
        disable_free: false,
        suppress_entry_replies: false,
        silent_mode: false
    };

    const DEBUG_SETTINGS = {
        log_chat_messages: false,
        disable_chat_output: false,
        verify_extractor: false,
        verify_sendmessage: false,
        verify_cacheChatContext: false,
        suppressApiMessages: false, // new flag to suppress API message sending
        enable_self_checks: false
    };

    const PERF = false; // Debug-only perf counters (must stay false in normal use)
    const PERF_LOG_EVERY = 50;
    const perfCounters = PERF ? Object.create(null) : null;
    function perfMeasure(section, startMs) {
        if (!PERF) return;
        const elapsed = performance.now() - startMs;
        const rec = perfCounters[section] || (perfCounters[section] = { count: 0, total: 0, max: 0 });
        rec.count += 1;
        rec.total += elapsed;
        if (elapsed > rec.max) rec.max = elapsed;
        if ((rec.count % PERF_LOG_EVERY) === 0) {
            console.debug(
                `[BON Giveaway PERF] ${section}: count=${rec.count}, avg=${(rec.total / rec.count).toFixed(2)}ms, max=${rec.max.toFixed(2)}ms`
            );
        }
    }

    const SELF_CHECK_FLAG = "BON_GIVEAWAY_SELF_CHECKS";
    const SELF_CHECK_QUERY_RE = /(?:^|[?&])bg_self_checks=1(?:&|$)/i;
    const SELF_CHECKS_ENABLED = !!(
        DEBUG_SETTINGS.enable_self_checks ||
        localStorage.getItem(SELF_CHECK_FLAG) === "true" ||
        SELF_CHECK_QUERY_RE.test(String(window.location.search || ""))
    );

    function selfCheck(condition, message, details) {
        if (!SELF_CHECKS_ENABLED || condition) return;
        const err = new Error(`[BON Giveaway self-check] ${message}`);
        if (details && typeof details === "object") {
            try {
                console.error(err.message, details);
            } catch {
                console.error(err.message);
            }
        } else {
            console.error(err.message);
        }
        throw err;
    }

    const SCRIPT_ID = 'bon-giveaway-update';
    const CHECK_EVERY_HOURS = 48;

    const CHATROOM_IDS = {
        'upload.cx': '11',
        'oldtoons.world': '4',
        'aither.cc': '4',
        'reelflix.cc': '1',
        'homiehelpdesk.net': '3',
        'darkpeers.org': '2',
        'yu-scene.net': '5',
        'polishtorrent.top': '16',
        'luminarr.me': '4',
        'midnightscene.cc': '2',
        'znth.cx' : '2',
    };
    // Central host/site adapter: isolate per-site quirks in one place
    function createSiteAdapter(hostname, chatroomMap) {
        const host = String(hostname || '').trim().toLowerCase();
        const isUploadCx = host === 'upload.cx';
        const chatroomId = (chatroomMap && chatroomMap[host]) ? String(chatroomMap[host]) : '2';

        function getMessageContentElement(messageNode) {
            if (!messageNode || messageNode.nodeType !== 1) return null;
            return messageNode.querySelector('.chatbox-message__content');
        }

        function getGiftEndpointPath(slug) {
            const safeSlug = String(slug || '').trim();
            if (!safeSlug) return null;
            return `/users/${safeSlug}/gifts`;
        }

        return Object.freeze({
            host,
            chatroomId,
            isUploadCx,
            getMessageContentElement,
            getGiftEndpointPath
        });
    }




    const LS_SUPPRESS = "giveaway-suppressEntryReplies";
    const LS_SILENT = "giveaway-silentMode";
    const LS_SHOW_GIVEAWAY_LOG = "giveaway-showLog";
    const LS_HOST_PANEL_OPEN = "giveaway-hostPanelOpen";
    const LS_HOST_PANEL_POS = "bonGiveaway_hostPanelPos";
    const LS_MINIMIZED = "giveaway-minimized";
    const LS_PRESETS = "giveaway-presets";
    const LS_ACTIVE_GIVEAWAY = `giveaway-activeState::${location.hostname}`;
    const LS_TAB_LOCK = `giveaway-tabLock::${location.hostname}`;
    // Per-giveaway ledger of completed gift attempts. Survives reload + visible to other tabs,
    // so even if endGiveaway runs in two tabs the second one won't re-pay.
    const LS_PAID_GIFTS = `giveaway-paidGifts::${location.hostname}`;
    // Cap retained giveaway-id entries in the ledger so it can't grow unbounded over time.
    const PAID_GIFTS_MAX_GIVEAWAYS = 50;
    const TAB_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const TAB_LOCK_HEARTBEAT_MS = 5000;   // update lock every 5s
    const TAB_LOCK_STALE_MS = 15000;      // lock is stale if no heartbeat for 15s
    let tabLockHeartbeatTimer = null;

    function readStoredBooleanSetting(key, fallback = false, persistFallback = false) {
        const raw = localStorage.getItem(key);
        if (raw === "true") return true;
        if (raw === "false") return false;
        if (persistFallback) {
            localStorage.setItem(key, String(!!fallback));
        }
        return !!fallback;
    }

    // Initialize silent mode as early as possible (no page refresh needed).
    GENERAL_SETTINGS.silent_mode = readStoredBooleanSetting(LS_SILENT, false, true);
    GENERAL_SETTINGS.show_giveaway_log = readStoredBooleanSetting(LS_SHOW_GIVEAWAY_LOG, false, true);

    const currentHost = window.location.hostname;
    const Site = createSiteAdapter(currentHost, CHATROOM_IDS);
    const chatroomId = Site.chatroomId;
    const chatboxId = "chatbox__messages-create";

    const COMMAND_PANEL_SECTIONS = Object.freeze({
        giveaway: "General Commands",
        stats: "Stats Commands",
        entry: "Entry Commands",
        help: "Help",
        rigging: "Rigging Commands",
        pot: "BON Commands",
        fun: "Fun / Extras"
    });
    const HOST_PANEL_NAUGHTY_SECTION_TITLE = "Naughty List";
    const HOST_PANEL_END_COMMAND_DENYLIST = Object.freeze(["end", "endgiveaway", "giveawayend", "stop", "stopgiveaway"]);
    const HOST_PANEL_INTERNAL_COMMAND_DENYLIST = Object.freeze(["commands"]);
    const HOST_PANEL_SECTION_ORDER = Object.freeze(["giveaway", "stats", "pot", "entry", "rigging", "help", "fun"]);
    const HOST_PANEL_COMMAND_SECTION_BY_KEY = Object.freeze({
        reminder: "giveaway",
        entries: "giveaway",
        time: "giveaway",
        addtime: "giveaway",
        removetime: "giveaway",
        winners: "giveaway",
        maxwinners: "giveaway",
        scale: "giveaway",
        stats: "stats",
        top: "stats",
        most: "stats",
        largest: "stats",
        unlucky: "stats",
        sponsors: "stats",
        help: "help",
        gift: "help",
        bon: "pot",
        addbon: "pot",
        rig: "rigging",
        unrig: "rigging",
        naughty: "naughty"
    });
    const HOST_PANEL_COMMAND_ORDER_BY_SECTION = Object.freeze({
        giveaway: Object.freeze(["reminder", "entries", "time", "addtime", "removetime", "winners", "maxwinners", "scale"]),
        stats: Object.freeze(["stats", "top", "most", "largest", "unlucky", "sponsors"]),
        help: Object.freeze(["help", "gift"]),
        pot: Object.freeze(["bon", "addbon"]),
        rigging: Object.freeze(["rig", "unrig"])
    });

    // only run the cooldown/spam‑detection logic on available commands
    const baseCommands = ["time", "entries", "help", "commands", "bon", "range", "gift","random", "number", "free", "lucky", "luckye", "rig", "unrig", "stats", "top", "most", "sponsors", "unlucky", "largest", "scale"];
    const hostCommands = ["addtime", "removetime", "reminder", "addbon", "end", "winners", "maxwinners", "naughty"];
    const uploadCxExtras = ["ruckus", "ick", "corigins", "lejosh", "suckur", "bloom", "dawg", "greglechin"];
    const validCommands = new Set([
        ...baseCommands,
        ...hostCommands,
        ...(Site.isUploadCx ? uploadCxExtras : [])
    ]);
    const HOST_PANEL_COMMAND_METADATA = Object.freeze({
        time: { label: "Time", section: "giveaway", description: "Show remaining giveaway time.", usage: "!time", requiresGiveaway: true },
        entries: { label: "Entries", section: "info", description: "List current entries.", usage: "!entries", requiresGiveaway: true },
        help: { label: "Help", section: "info", description: "Show available commands in chat.", usage: "!help", requiresGiveaway: false },
        commands: { label: "Commands", section: "info", description: "Alias for !help.", usage: "!commands", requiresGiveaway: false },
        stats: { label: "Stats", section: "info", description: "Show saved stats for a user.", usage: "!stats [username]", requiresGiveaway: false,
                args: [{ name: "username", label: "User", type: "username", required: false, placeholder: "optional username" }] },
        top: { label: "Top", section: "info", description: "Top winners leaderboard.", usage: "!top [N]", requiresGiveaway: false,
              args: [{ name: "count", label: "N", type: "int", required: false, min: 1, max: STATS_MAX_TOP_N, placeholder: String(STATS_DEFAULT_TOP_N) }] },
        most: { label: "Most", section: "info", description: "Most BON won leaderboard.", usage: "!most [N]", requiresGiveaway: false,
               args: [{ name: "count", label: "N", type: "int", required: false, min: 1, max: STATS_MAX_TOP_N, placeholder: String(STATS_DEFAULT_TOP_N) }] },
        sponsors: { label: "Sponsors", section: "pot", description: "Show top sponsors.", usage: "!sponsors [N]", requiresGiveaway: false,
                   args: [{ name: "count", label: "N", type: "int", required: false, min: 1, max: STATS_MAX_TOP_N, placeholder: String(STATS_DEFAULT_TOP_N) }] },
        unlucky: { label: "Unlucky", section: "info", description: "Show most losses leaderboard.", usage: "!unlucky [N]", requiresGiveaway: false,
                  args: [{ name: "count", label: "N", type: "int", required: false, min: 1, max: STATS_MAX_TOP_N, placeholder: String(STATS_DEFAULT_TOP_N) }] },
        largest: { label: "Largest", section: "info", description: "Show largest giveaways.", usage: "!largest [N]", requiresGiveaway: false,
                  args: [{ name: "count", label: "N", type: "int", required: false, min: 1, max: STATS_MAX_TOP_N, placeholder: String(STATS_DEFAULT_TOP_N) }] },
        gift: { label: "Gift", section: "pot", description: "Show giveaway gift status.", usage: "!gift", requiresGiveaway: true },
        bon: { label: "BON", section: "pot", description: "Show current pot amount.", usage: "!bon", requiresGiveaway: true },
        range: { label: "Range", section: "entry", description: "Show valid entry range.", usage: "!range", requiresGiveaway: true },
        lucky: { label: "Lucky", section: "entry", description: "Show lucky number.", usage: "!lucky", requiresGiveaway: true },
        luckye: { label: "Lucky Enter", section: "entry", description: "Enter using lucky number.", usage: "!luckye", requiresGiveaway: true },
        rig: { label: "Rig", section: "entry", description: "Fun rig toggle command.", usage: "!rig", requiresGiveaway: true },
        unrig: { label: "Unrig", section: "entry", description: "Fun rig toggle command.", usage: "!unrig", requiresGiveaway: true },
        random: { label: "Random", section: "entry", description: "Enter with a random number.", usage: "!random", requiresGiveaway: true },
        number: { label: "Number", section: "entry", description: "Show your current entry.", usage: "!number", requiresGiveaway: true },
        free: { label: "Free", section: "entry", description: "Show available entry numbers.", usage: "!free", requiresGiveaway: true },
        addbon: { label: "Add BON", section: "pot", description: "Add BON to the pot.", usage: "!addbon <amount>", requiresGiveaway: true, hostOnly: true,
                 args: [{ name: "amount", label: "BON", type: "int", required: true, min: 1, placeholder: "amount" }] },
        reminder: { label: "Reminder", section: "giveaway", description: "Send reminder now.", usage: "!reminder", requiresGiveaway: true, hostOnly: true },
        winners: { label: "Winners", section: "giveaway", description: "Set winner count.", usage: `!winners 1-${MAX_WINNERS}`, requiresGiveaway: true, hostOnly: true,
                  args: [{ name: "count", label: "Count", type: "int", required: true, min: 1, max: MAX_WINNERS, placeholder: "winners" }] },
        maxwinners: { label: "Max Winners", section: "giveaway", description: "Set max scaled winners.", usage: `!maxwinners 1-${MAX_WINNERS}`, requiresGiveaway: true, hostOnly: true,
                     args: [{ name: "count", label: "Max", type: "int", required: true, min: 1, max: MAX_WINNERS, placeholder: "max" }] },
        scale: { label: "Scale", section: "info", description: "Show scaling progress.", usage: "!scale", requiresGiveaway: true },
        addtime: { label: "Add Time", section: "giveaway", description: "Add giveaway minutes.", usage: "!addtime <minutes>", requiresGiveaway: true, hostOnly: true,
                  args: [{ name: "minutes", label: "Min", type: "int", required: true, min: 1, placeholder: "minutes" }] },
        removetime: { label: "Remove Time", section: "giveaway", description: "Remove giveaway minutes.", usage: "!removetime <minutes>", requiresGiveaway: true, hostOnly: true,
                     args: [{ name: "minutes", label: "Min", type: "int", required: true, min: 1, placeholder: "minutes" }] },
        naughty: { label: "Naughty", section: "giveaway", description: "Manage naughty list.", usage: "!naughty (add|remove|list) [username]", requiresGiveaway: true, hostOnly: true,
                  args: [
                      { name: "action", label: "Action", type: "select", required: true, placeholder: "action", options: [{ label: "Add", value: "add" }, { label: "Remove", value: "remove" }, { label: "List", value: "list" }], validate: (v) => /^(add|remove|list)$/i.test(String(v || "").trim()), hint: "Use add, remove, or list." },
                      { name: "username", label: "User", type: "username", required: false, placeholder: "username", requiredWhen: (all) => /^(add|remove)$/i.test(String(all.action || "").trim()), hint: "Username is required for add/remove." }
                  ] },
        end: { label: "End", section: "giveaway", description: "End the active giveaway.", usage: "!end [host]", requiresGiveaway: true, hostOnly: true,
              args: [{ name: "host", label: "Host", type: "username", required: false, placeholder: "optional host" }] },
        suckur: { label: "Suckur", section: "fun", description: "Upload.cx fun command.", usage: "!suckur", requiresGiveaway: false },
        ruckus: { label: "Ruckus", section: "fun", description: "Upload.cx fun command.", usage: "!ruckus", requiresGiveaway: false },
        ick: { label: "Ick", section: "fun", description: "Upload.cx fun command.", usage: "!ick", requiresGiveaway: false },
        corigins: { label: "Corigins", section: "fun", description: "Upload.cx fun command.", usage: "!corigins", requiresGiveaway: false },
        lejosh: { label: "Lejosh", section: "fun", description: "Upload.cx fun command.", usage: "!lejosh", requiresGiveaway: false },
        bloom: { label: "Bloom", section: "fun", description: "Upload.cx fun command.", usage: "!bloom", requiresGiveaway: false },
        dawg: { label: "Dawg", section: "fun", description: "Upload.cx fun command.", usage: "!dawg", requiresGiveaway: false },
        greglechin: { label: "Greglechin", section: "fun", description: "Upload.cx fun command.", usage: "!greglechin", requiresGiveaway: false }
    });

    // Declared early so UI init paths can safely reference this object before command handlers are populated.
    const COMMAND_HANDLERS = Object.create(null);

    // ───────────────────────────────────────────────────────────
    // SECTION 2: Runtime State Variables
    // ───────────────────────────────────────────────────────────
    let giveawayStartTime;
    let sponsorsInterval;
    let observer;
    let giveawayData;
    let chatbox = null;
    let reminderRetryTimeout = null;
    let frameHeader;
    let OT_USER_ID = null;
    let OT_CHATROOM_ID = null;
    let OT_CSRF_TOKEN = null;
    let riggedMode = false; // fun cosmetic mode, does NOT affect fairness

    // Grouped mutable collections (keeps behavior while improving maintainability/discoverability).
    const state = {
        moderation: {
            userCooldown: new Map(), // authorKey(lower) → timestamp(ms) when lockout ends
            userCommandLog: new Map(), // authorKey(lower) → [timestamps of recent triggers]
            userLastActionAt: new Map(), // authorKey(lower) → last trigger timestamp(ms)
            userLastCommandAt: new Map(), // `${authorKey}::${command}` → last timestamp(ms)
            userSpamStrikes: new Map(), // authorKey(lower) → { count:number, lastAt:number }
            userFeedbackCooldown: new Map(), // `${authorKey}::${bucket}` → last feedback timestamp(ms)
            rigDenyCooldown: new Map() // author → timestamp(ms) when next rig/unrig deny message is allowed
        },
        entries: {
            numberEntries: new Map(),
            numberTakenBy: new Map(), // entryNumber -> author (fast duplicate checks)
            fancyNames: new Map(),
            naughtyWarned: new Set() // Users that have already been warned this giveaway
        },
        liveStats: {
            enteredThisGiveaway: new Set(), // userKey
            sponsorSeenThisGiveaway: new Set(), // sponsorKey (for sponsorCount once/giveaway)
            sponsorTotalThisGiveaway: new Map() // sponsorKey -> running total
        },
        winners: {
            winnerPayouts: new Map(), // lowercase author -> BON amount
            winnerGiftStatus: new Map() // lowercase author -> "pending" | "confirmed" | "failed"
        },
        audit: {
            giveawayLog: []
        }
    };

    const { userCooldown, userCommandLog, userLastActionAt, userLastCommandAt, userSpamStrikes, userFeedbackCooldown, rigDenyCooldown } = state.moderation;
    const { numberEntries, numberTakenBy, fancyNames, naughtyWarned } = state.entries;
    const { enteredThisGiveaway: liveEnteredThisGiveaway, sponsorSeenThisGiveaway: liveSponsorSeenThisGiveaway, sponsorTotalThisGiveaway: liveSponsorTotalThisGiveaway } = state.liveStats;
    const { winnerPayouts, winnerGiftStatus } = state.winners;
    const { giveawayLog } = state.audit;

    const normalizeLower = (value) => String(value || "").trim().toLowerCase();
    const CHAT_MESSAGE_SELECTOR = '.chatbox-message';
    const CHATROOM_MESSAGES_SELECTOR = '.chatroom__messages';
    const GIFT_AMOUNT_RE = /has gifted\s*([\d.]+)\s*BON/i;
    const giftDOMParser = new DOMParser();

    let entriesTableEl = null;
    let entriesTbodyEl = null;
    let chatMessagesListEl = null;
    const entryRowByKey = new Map();

    const regNum = /^-?\d+$/; // matches integers (including negative) for entry detection

    // Cross-page message deduplication: tracks API message IDs already processed
    // to prevent double-processing when both the DOM observer and API poller are active.
    const processedApiMessageIds = new Set();

    /* --- Naughty (exclusion) list ------------------------------------- */
    const NAUGHTY_KEY = "giveaway-naughty-list";
    const naughtySet = new Set(
        JSON.parse(localStorage.getItem(NAUGHTY_KEY) || "[]")
        .map(normalizeLower) // store lowercase for case-insensitive match
    );
    function saveNaughty() {
        localStorage.setItem(NAUGHTY_KEY, JSON.stringify([...naughtySet]));
    }

    const coinsIcon = document.createElement("i");
    coinsIcon.setAttribute("class", "fas fa-coins");

    const goldCoins = document.createElement("i");
    goldCoins.setAttribute("class", "fas fa-coins");
    goldCoins.style.color = "#ffc00a";
    goldCoins.style.padding = "5px";

    const giveawayBTN = document.createElement("a");
    giveawayBTN.setAttribute("class", "form__button form__button--text");
    giveawayBTN.textContent = "Giveaway";
    giveawayBTN.prepend(coinsIcon.cloneNode(false));
    giveawayBTN.onclick = toggleMenu;

    // ───────────────────────────────────────────────────────────
    // SECTION 3: Script Metadata Parsing
    // ───────────────────────────────────────────────────────────
    const META = (() => {
        /* 1. Tampermonkey / Violentmonkey / classic Greasemonkey */
        if (typeof GM_info !== "undefined" && GM_info.script) {
            return GM_info.script;
        }

        /* 2. Greasemonkey 4 (GM.info) */
        if (typeof GM !== "undefined" && GM.info && GM.info.script) {
            return GM.info.script;
        }

        /* 3. Fallback: read our own source and regex the @version etc. */
        try {
            /* GM-3 keeps the original userscript text in the <script> tag it
       injects.  document.currentScript points to that tag.            */
            const src = document.currentScript?.textContent || "";
            const fetch = key => {
                const m = src.match(new RegExp(`@${key}\\s+([^\\n]+)`));
                return m ? m[1].trim() : "";
            };

            return {
                name:        fetch("name") || "BON Giveaway",
                updateURL:   fetch("updateURL") || "https://openuserjs.org/meta/Nums/Blutopia_BON_Giveaway.meta.js",
                version:     fetch("version") || "0.0.0"
            };
        } catch (e) {
            /* Last-ditch – never crash the script */
            return { name:"BON Giveaway", version:"0.0.0" };
        }
    })();

    const {
        name:        SCRIPT_NAME,
        updateURL:   SCRIPT_UPDATE_URL,
        version:     SCRIPT_VERSION
    } = META;

    /* — persistent “out-of-date” flag — */
    const UPDATE_KEY = `${SCRIPT_ID}-latestRemote`;
    const latestRemote = localStorage.getItem(UPDATE_KEY) || "";

    /*  If we already know a newer version exists, draw the badge immediately  */
    if (latestRemote && isNewer(latestRemote, SCRIPT_VERSION)) {
        /* frame isn’t on the page yet → retry until it is */
        waitForBadge(latestRemote);
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 4: UI Template Definitions
    // ───────────────────────────────────────────────────────────
    const frameHTML = `
<section
  id="giveawayFrame"
  class="panelV2"
  style="width:450px;height:90%;position:fixed;z-index:9999;inset:50px 150px auto auto;overflow:auto;border:1px solid black;"
  hidden
>
  <!-- HEADER -->
  <header class="panel__heading">
    <div class="button-holder no-space giveaway-header-top-row">
      <div class="button-left">
        <h4 class="panel__heading">
          <i class="fa-solid fa-gifts" style="padding:5px;"></i>
          ${SCRIPT_NAME}
          <small style="color:#aaa;margin-left:8px;font-size:0.8em;">v${SCRIPT_VERSION}</small>
        </h4>
      </div>
      <div class="button-right giveaway-header-actions">
        <button id="minimizeButton" class="form__button form__button--text giveaway-btn" style="background-color:#4e595f;" title="Minimize panel">
          <i class="fa-solid fa-window-minimize"></i>
        </button>
        <button id="closeButton" class="form__button form__button--text giveaway-btn" style="background-color:#4e595f;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
    </div>
    <div class="giveaway-header-actions__menu-row no-drag" data-no-drag="1">
      <button id="resetButton" class="form__button form__button--text giveaway-btn no-drag" data-no-drag="1" style="background-color:#b32525;">
        <i class="fa-solid fa-rotate-right"></i> Reset
      </button>
      <button id="giveawaySettingsBtn" class="form__button form__button--text giveaway-btn no-drag" data-no-drag="1" style="background-color:#ff6400;">
        <i class="fa-solid fa-gear"></i> Settings
      </button>
      <button id="commandsButton" class="form__button form__button--text giveaway-btn no-drag" data-no-drag="1" style="background-color:#ff9600;">
        <i class="fa-solid fa-list"></i> Commands
      </button>
    </div>
  </header>

  <!-- MAIN BODY -->
  <div class="panel__body" id="giveaway_body" style="display:flex; flex-direction:column; gap:10px;">

    <!-- Presets -->
    <div class="giveaway-presets-row" style="display:flex; align-items:center; justify-content:center; gap:6px; flex-wrap:wrap; margin:0;">
      <select id="presetSelect" class="form__text" style="width:auto; min-width:120px; max-width:180px; padding:3px 6px; font-size:12px;">
        <option value="">— Presets —</option>
      </select>
      <button type="button" id="presetLoadBtn" class="form__button form__button--text giveaway-btn no-drag" style="background-color:#2a7acc; font-size:11px; padding:3px 8px;" title="Load selected preset">
        <i class="fa-solid fa-folder-open"></i> Load
      </button>
      <button type="button" id="presetSaveBtn" class="form__button form__button--text giveaway-btn no-drag" style="background-color:#02B008; font-size:11px; padding:3px 8px;" title="Save current form as a preset">
        <i class="fa-solid fa-floppy-disk"></i> Save
      </button>
      <button type="button" id="presetDeleteBtn" class="form__button form__button--text giveaway-btn no-drag" style="background-color:#b32525; font-size:11px; padding:3px 8px;" title="Delete selected preset">
        <i class="fa-solid fa-trash"></i>
      </button>
    </div>

    <h1 id="coinHeader" class="panel__heading--centered"></h1>

    <form class="form" id="giveawayForm" style="display:flex;flex-flow:column;align-items:center;">
      <p class="form__group" style="max-width:35%;">
<input
  class="form__text"
  required
  id="giveawayAmount"
  inputmode="numeric"
  type="text"
>

        <label class="form__label form__label--floating" for="giveawayAmount">
          Giveaway Amount
        </label>
      </p>

      <div class="panel__body flex-row" style="justify-content:center; gap:20px;">
        ${
    [
        ['startNum', '1'],
        ['endNum', '50']
    ]
    .map(
        ([id, val]) => `
              <p class="form__group" style="width:20%;">
                <input
                  class="form__text"
                  required
                  id="${id}"
                  pattern="-?\\d+"
                  value="${val}"
                  inputmode="numeric"
                  type="text"
                  maxlength="9"
                >
                <label class="form__label form__label--floating" for="${id}">
                  ${id === 'startNum' ? 'Start #' : 'End #'}
                </label>
              </p>`
    )
    .join('')
    }
      </div>

      <!-- Giveaway length / reminders / winners row -->
      <div class="panel__body flex-row" style="justify-content:center; flex-wrap:wrap; gap:20px;">
        <!-- giveaway length -->
        <p class="form__group" style="width:28%;">
          <input
            class="form__text"
            required
            id="timerNum"
            type="number"
            inputmode="numeric"
            min="1"
            step="1"
            value="5"
            autocomplete="off"
          >
          <label class="form__label form__label--floating" for="timerNum">Time&nbsp;(min)</label>
        </p>

        <!-- reminders -->
        <p class="form__group" style="width:28%;">
          <input class="form__text" id="reminderNum" type="number" min="0" step="1" value="0" autocomplete="off">
          <label class="form__label form__label--floating"># Reminders</label>
        </p>

        <!-- cadence label -->
        <p class="form__group" style="width:28%;">
          <input class="form__text" id="reminderEvery" readonly tabindex="-1" style="cursor:default;">
          <label class="form__label form__label--floating">Every (min)</label>
        </p>
      </div>

      <!-- winners + max winners row -->
      <div class="panel__body flex-row giveaway-number-row giveaway-winners-row">
        <p class="form__group giveaway-number-col">
          <input
            class="form__text"
            type="number"
            id="winnersNum"
            min="1"
            max="${MAX_WINNERS}"
            step="1"
            value="1"
          >
          <label class="form__label form__label--floating" for="winnersNum"># Winners</label>
        </p>
        <p class="form__group giveaway-number-col" id="maxScaledWinnersGroup" style="display:none;">
          <input
            class="form__text"
            type="number"
            id="maxScaledWinnersNum"
            title="Hard cap: ${MAX_WINNERS}. Scaling can’t exceed this."
            min="1"
            max="${MAX_WINNERS}"
            step="1"
            value="1"
            disabled
          >
          <label class="form__label form__label--floating" for="maxScaledWinnersNum" title="Hard cap: ${MAX_WINNERS}. Scaling can’t exceed this.">Max Winners</label>
          <small id="maxScaledWinnersError" class="giveaway-inline-error" aria-live="polite"></small>
        </p>
        <p class="form__group giveaway-number-col" id="scaleBonPerWinnerGroup" style="display:none;">
          <input
            class="form__text"
            type="number"
            id="scaleBonPerWinnerNum"
            title="BON sponsored per extra winner. Leave empty to auto-calculate from pot size."
            min="1"
            step="1"
            placeholder="auto"
            disabled
          >
          <label class="form__label form__label--floating" for="scaleBonPerWinnerNum" title="BON per additional winner via sponsorship.">BON/Winner</label>
        </p>
      </div>

      <div class="panel__body giveaway-custom-message-row" style="display:flex;justify-content:center;gap:20px;width:100%;">
        <p class="form__group" style="width:100%;">
          <input
            class="form__text"
            id="customMessage"
            type="text"
            maxlength="100"
            placeholder="Max 100 chars"
            value="${DEFAULT_CUSTOM_MESSAGE}"
          >
          <label class="form__label form__label--floating" for="customMessage">
            Custom Message
          </label>
        </p>
      </div>

      <p class="form__group" style="text-align:center;">
  <button
    type="button"
    id="startButton"
    class="form__button form__button--filled"
    style="background-color:#02B008;"
  >
    Start
  </button>
</p>
    </form>

    <!-- Countdown timer below the form, full width -->
    <h2 id="countdownHeader" class="panel__heading--centered" hidden
        style="display:block; width:100%; margin-top:10px; margin-bottom:10px; text-align:center;">
    </h2>

<!-- Entries table below the countdown -->
    <div id="entriesWrapper" class="data-table-wrapper" hidden
         style="width:100%; overflow-x:auto; margin-top:10px;">
      <table id="entriesTable" class="data-table" style="width:100%; border-collapse:collapse; table-layout:fixed;">
        <thead><tr><th>User</th><th>Entry #</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>

    <!-- Winners / payout status -->
    <div id="winnersWrapper" class="data-table-wrapper" hidden
         style="width:100%; overflow-x:auto; margin-top:6px;">
      <table id="winnersTable" class="data-table" style="width:100%; border-collapse:collapse; table-layout:fixed;">
        <thead>
          <tr>
            <th>Winner</th>
            <th>Prize BON</th>
            <th>Gift</th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>

    <div id="giveawayLogPanel" class="data-table-wrapper" style="width:100%; margin-top:10px; display:none;">
      <h3 style="margin:0 0 6px 0; color:#ddd; font-size:14px;">Giveaway Log</h3>
      <pre id="giveawayLogContent" style="margin:0; max-height:160px; overflow:auto; background:#1f1f1f; color:#cfcfcf; border:1px solid #444; border-radius:4px; padding:8px; white-space:pre-wrap; word-break:break-word;">No events yet.</pre>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button type="button" id="copyGiveawayLogButton" class="form__button form__button--filled">Copy log</button>
        <button type="button" id="clearGiveawayLogButton" class="form__button form__button--filled" style="background:#7d3333;">Clear log</button>
      </div>
    </div>
  </div>

  <!-- SETTINGS MENU -->
  <div id="giveaway_settings_menu" class="giveaway_settings_menu" style="display:none">
    <div class="settings-menu-content">
      <div class="settings-group" aria-label="Entry Modes" data-settings-group="entry-modes" data-toggle-ids="randomToggle,luckyToggle,freeToggle">
        <div class="settings-group__header">
          <p class="settings-group__title">Entry Modes</p>
          <button type="button" class="form__button form__button--filled settings-section-toggle" data-settings-toggle="entry-modes" title="Toggle all options in Entry Modes only.">Toggle all</button>
        </div>
        ${[
            { label: 'Random', id: 'randomToggle', tip: 'Enable !random (enter with a random free number).' },
            { label: 'Lucky', id: 'luckyToggle', tip: 'Enable !lucky (show lucky #) and !luckye (enter with lucky #).' },
            { label: 'Free', id: 'freeToggle', tip: 'Enable !free (show some available numbers).' }
        ].map(({ label, id, tip }) => `
          <label class="settings-row" title="${tip}" for="${id}">
            <span class="settings-row__label">${label}</span>
            <input
              type="checkbox"
              id="${id}"
              title="${tip}"
              class="settings-row__toggle"
              checked
            >
          </label>`).join('')}
      </div>

      <div class="settings-group" aria-label="Chat and Replies" data-settings-group="chat-replies" data-toggle-ids="entryrepliesToggle,silentmodeToggle">
        <div class="settings-group__header">
          <p class="settings-group__title">Chat & Replies</p>
          <button type="button" class="form__button form__button--filled settings-section-toggle" data-settings-toggle="chat-replies" title="Toggle all options in Chat & Replies only.">Toggle all</button>
        </div>
        ${[
            { label: 'Entry Replies', id: 'entryrepliesToggle', tip: 'When enabled, the bot replies when an entry is logged. Disable to reduce chat spam.' },
            { label: 'Silent Mode', id: 'silentmodeToggle', tip: 'When enabled, command replies are sent privately via /msg instead of public chat.' }
        ].map(({ label, id, tip }) => `
          <label class="settings-row" title="${tip}" for="${id}">
            <span class="settings-row__label">${label}</span>
            <input
              type="checkbox"
              id="${id}"
              title="${tip}"
              class="settings-row__toggle"
              checked
            >
          </label>`).join('')}
      </div>

      <div class="settings-group" aria-label="Scaling and Rules" data-settings-group="scaling-rules" data-toggle-ids="scaleWinnersToggle,rigModeToggle,showgiveawaylogToggle">
        <div class="settings-group__header">
          <p class="settings-group__title">Scaling & Rules</p>
          <button type="button" class="form__button form__button--filled settings-section-toggle" data-settings-toggle="scaling-rules" title="Toggle all options in Scaling & Rules only.">Toggle all</button>
        </div>
        ${[
            { label: 'Scale Winners', id: 'scaleWinnersToggle', tip: 'When enabled, winners may increase based on sponsorship BON (up to the max set in the giveaway form).' },
            { label: 'Rigged mode (visual only)', id: 'rigModeToggle', tip: 'Rigged mode is purely cosmetic… allegedly.' },
            { label: 'Show Giveaway Log', id: 'showgiveawaylogToggle', tip: 'Only controls Giveaway Log panel visibility. Logging still continues in the background.' }
        ].map(({ label, id, tip }) => `
          <label class="settings-row" title="${tip}" for="${id}">
            <span class="settings-row__label">${label}</span>
            <input
              type="checkbox"
              id="${id}"
              title="${tip}"
              class="settings-row__toggle"
              checked
            >
          </label>`).join('')}
      </div>
    </div>
  </div>

  <!-- COMMANDS MENU -->
  <div id="giveaway_commands_menu" class="commands-menu" style="display:none">
    <ul class="commands-list">
      <li class="section-label">General&nbsp;Commands</li>
      <li><code>!time&nbsp;</code>        <span class="desc">Show remaining time</span></li>
      <li><code>!entries&nbsp;</code>     <span class="desc">List all entries</span></li>
      <li><code>!free&nbsp;</code>        <span class="desc">Show free numbers</span></li>
      <li><code>!number&nbsp;</code>      <span class="desc">Show your entry</span></li>
      <li><code>!random&nbsp;</code>      <span class="desc">Enter with a random #</span></li>
      <li><code>!lucky&nbsp;</code>       <span class="desc">Show lucky number</span></li>
      <li><code>!luckye&nbsp;</code>      <span class="desc">Enter with lucky #</span></li>
      <li><code>!bon&nbsp;</code>         <span class="desc">Show pot amount</span></li>
      <li><code>!range&nbsp;</code>       <span class="desc">Show valid range</span></li>
      <li><code>!scale&nbsp;</code>      <span class="desc">Show scaling progress</span></li>
      <li><code>!rig/!unrig&nbsp;</code>  <span class="desc">Toggle rigging (fun)</span></li>
      <li><code>!help&nbsp;</code>        <span class="desc">Show this list in chat</span></li>
      <li><code>!stats&nbsp;[user]</code>   <span class="desc">Show saved stats</span></li>
      <li><code>!top&nbsp;[N]</code>       <span class="desc">Top winners (by wins)</span></li>
      <li><code>!most&nbsp;[N]</code>      <span class="desc">Most BON won (total)</span></li>
      <li><code>!sponsors&nbsp;[N]</code>  <span class="desc">Top sponsors</span></li>
      <li><code>!unlucky&nbsp;[N]</code>   <span class="desc">Most losses</span></li>

      <li class="section-label">Host-Only&nbsp;Commands</li>
      <li class="full-span">
          <code>!time add&nbsp;N&nbsp;/&nbsp;remove&nbsp;N&nbsp;</code>
          <span class="desc">Adjust remaining minutes</span>
      </li>
      <li><code>!reminder&nbsp;</code>    <span class="desc">Send reminder msg</span></li>
      <li><code>!addbon&nbsp;</code>      <span class="desc">Add BON to pot</span></li>
      <li><code>!winners&nbsp;N</code>    <span class="desc">Set number of winners</span></li>
      <li><code>!maxwinners&nbsp;N</code> <span class="desc">Set max scaled winners</span></li>
      <li><code>!end&nbsp;</code>         <span class="desc">End the giveaway</span></li>

      <li><code>!naughty&nbsp;</code>     <span class="desc">list/add/remove a user</span></li>
      <li class="naughty-alert">
        ⚠⚠ !naughty excludes users from the giveaway entirely ⚠⚠ ************************USE RESPONSIBLY************************
      </li>
    </ul>
  </div>


  <!-- RIGGED WATERMARK (only visible in rigged mode) -->
  <div class="rigged-watermark">RIGGED</div>
</section>
`;

    const hostPanelHTML = `
<aside id="hostCommandPanel" class="host-command-panel" aria-hidden="true">
  <div id="hostCommandPanelHandle" class="host-command-panel__handle" title="Drag to move Host Panel">
    <span class="host-command-panel__handle-title">Host Panel</span>
    <button id="hostPanelCloseBtn" type="button" class="form__button form__button--text host-command-panel__close" title="Close Host Panel" aria-label="Close Host Panel">×</button>
  </div>
  <div id="hostCommandPanelBody" class="host-command-panel__body"></div>
</aside>
`;

    const baseMenuStyle = `
  background-color: #2C2C2C;
  color: #CCC;
  border-radius: 5px;
  position: absolute;
  top: 100px;
  right: 10px;
  z-index: 10020;
  padding: 15px;
  overflow: auto;
  flex-direction: column;
  justify-content: center;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  pointer-events: auto;
`;

    // Settings menu CSS styles
    const settingsMenuStyle = `
.giveaway_settings_menu {
  ${baseMenuStyle}
  width: 280px;
  height: auto;
  max-height: 72vh;
}
.giveaway_settings_menu > div {
  margin: 0;
}
.giveaway_settings_menu .settings-menu-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.giveaway_settings_menu .settings-group {
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 7px;
}
.giveaway_settings_menu .settings-group:last-of-type {
  border-bottom: 0;
  padding-bottom: 0;
}
.giveaway_settings_menu .settings-group__title {
  margin: 0 0 4px;
  font-size: 12px;
  color: #ffa200;
  font-weight: 700;
}
.giveaway_settings_menu .settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 0;
  padding: 3px 0;
}
.giveaway_settings_menu .settings-row__label {
  color: #d7d7d7;
  font-size: 13px;
  line-height: 1.3;
}
.giveaway_settings_menu .settings-row__toggle {
  width: 15px;
  height: 15px;
  cursor: pointer;
  flex-shrink: 0;
}
.giveaway_settings_menu .settings-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.giveaway_settings_menu .settings-section-toggle {
  padding: 2px 8px;
  min-height: 24px;
  font-size: 11px;
  line-height: 1;
}`;

    // Commands menu CSS styles – shrink-wrap width, 2-column grid, section labels
    const commandsMenuStyle = `
.commands-menu{
  ${baseMenuStyle}
  width:max-content;
  max-width:425px;
  max-height:70vh;
}

/* ── compact two-column grid ───────────────────────────── */
.commands-menu .commands-list{
  list-style:none;
  padding:0;
  margin:0;
  display:grid;
  grid-template-columns:max-content 1fr;   /* code | description */
  column-gap:5px;
  row-gap:4px;
}

.commands-menu .full-span{
  grid-column: 1 / -1;      /* occupy the whole row */
 }

/* left column (command keyword) */
.commands-menu code{
  font-family:inherit;
  font-weight:600;
  color:#ffb84d;
  font-size:14px;
  white-space:nowrap;
}

/* right column (description) */
.commands-menu .desc{
  color:#d0d0d0;       /* dimmer grey */
  font-size:13px;
}

/* orange section headers that span both columns */
.commands-menu .section-label{
  grid-column:1 / -1;
  margin:6px 0 2px;
  font-size:14px;
  font-weight:700;
  color:#ffa200;
  border-bottom:1px solid #555;
}

/* full-width red banner for Naughty */
.commands-menu .naughty-alert{
  grid-column:1 / -1;    /* span both columns */
  background:#dc3d1d;
  color:#fff;
  font-size:13px;
  font-weight:600;
  padding:2px 6px;
  border-radius:4px;
  margin-top:2px;
}`;

    const hostPanelStyle = `
body.host-panel-dragging,
body.host-panel-dragging * {
  user-select: none !important;
}
.host-command-panel {
  box-sizing: border-box;
  position: fixed;
  top: 50px;
  right: auto;
  left: calc(100vw - clamp(320px, 26vw, 440px) - 16px);
  width: clamp(320px, 26vw, 440px);
  max-width: calc(100vw - 16px);
  height: calc(100vh - 66px);
  max-height: calc(100vh - 66px);
  border: 1px solid #000;
  border-radius: 6px;
  background-color: #2C2C2C;
  color: #CCC;
  z-index: 10030;
  overflow: hidden;
  display: none;
  pointer-events: auto;
}
.host-command-panel.open {
  display: block;
}
.host-command-panel,
.host-command-panel * {
  box-sizing: border-box;
}
.host-command-panel__handle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.18);
  background: rgba(0, 0, 0, 0.18);
  cursor: grab;
}
.host-command-panel.dragging .host-command-panel__handle {
  cursor: grabbing;
}
.host-command-panel__handle-title {
  font-size: 12px;
  color: #ffa200;
  font-weight: 700;
  letter-spacing: 0.2px;
}
.host-command-panel__close {
  margin: 0;
  padding: 0 8px;
  min-width: 28px;
  min-height: 24px;
  line-height: 1;
  font-size: 18px;
  color: #fff;
}
.host-command-panel__body {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  overflow-x: hidden;
  max-height: calc(100% - 40px);
  height: calc(100% - 40px);
  min-width: 0;
}
.host-command-panel__section {
  border-bottom: 1px solid rgba(255,255,255,0.09);
  padding-bottom: 8px;
  margin-bottom: 4px;
  min-width: 0;
}
.host-command-panel__section:last-child {
  border-bottom: 0;
  padding-bottom: 0;
}
.host-command-panel__section-title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #ffa200;
  font-weight: 700;
  white-space: normal;
  word-break: break-word;
}
.host-command-panel .host-command-panel__row {
  margin-bottom: 6px;
  min-width: 0;
}
.host-command-panel .hp-row {
  display:flex;
  flex-direction:column;
  min-width:0;
}
.host-command-panel .hp-row-main {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  column-gap:12px;
  row-gap:4px;
  min-width:0;
}
.host-command-panel .hp-row-right {
  display:flex;
  flex-direction:column;
  min-width:0;
  flex:1 1 auto;
}
.host-command-panel .hp-row-fields {
  display:flex;
  align-items:center;
  flex-wrap:wrap;
  gap:6px;
  min-width:0;
}
.host-command-panel .host-command-panel__button-wrap {
  flex: 0 0 auto;
  min-width: 120px;
  width: 120px;
}
.host-command-panel .host-command-panel__arg-wrap {
  min-width: 0;
  flex: 0 1 auto;
}
.host-command-panel .host-command-panel__arg-wrap .command-input {
  width: clamp(90px, 11vw, 140px);
  min-width: 80px;
  max-width: 100%;
  min-height: 28px;
  box-sizing: border-box;
}
.host-command-panel .host-command-panel__arg-wrap .command-input.command-input--long {
  width: clamp(140px, 16vw, 220px);
  min-width: 120px;
  max-width: 100%;
  box-sizing: border-box;
}
.host-command-panel .hp-row-error {
  font-size: 11px;
  color: #ff6f6f;
  line-height: 1.15;
  min-width: 0;
  min-height: 13px;
  visibility: hidden;
  margin-top: 3px;
}
.host-command-panel .hp-row-error.visible {
  visibility: visible;
}
.host-command-panel .host-command-panel__button-wrap .form__button {
  width: 100%;
  max-width: 100%;
  min-height: 28px;
  padding: 4px 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 0 0 auto;
}
.host-command-panel .disabled-wrap {
  display: inline-flex;
  min-width: 0;
}`;



    // ───────────────────────────────────────────────────────────
    // SECTION 5: Initialization and Bootstrapping
    // ───────────────────────────────────────────────────────────
    // Cache references for UI elements (populated in injectMenu)
    let giveawayFrame, coinHeader, countdownHeader,
        coinInput, startInput, endInput, timerInput, winnersInput, customMessageInput,
        scaleWinnersToggleInput, maxScaledWinnersInput, maxScaledWinnersGroup, maxScaledWinnersError,
        scaleBonPerWinnerInput, scaleBonPerWinnerGroup,
        entriesWrapper, giveawayForm,
        giveawayLogPanel, giveawayLogContent,
        resetButton, closeButton, minimizeButton, startButton, settingsBtn, commandsBtn, settingsMenu, commandsMenu,
        remNumInput, reminderEvery, rigBadge, rigToggleInput,
        hostPanelToggleBtn, hostCommandPanel, hostCommandPanelBody, hostPanelCloseBtn, hostPanelHandle,
        hostPanelInitialized = false;
    const hostPanelCommandState = new Map();
    let maxScaledWinnersRawValue = "";
    let maxScaledWinnersDebounceTimer = null;
    let bonPerWinnerManuallyEdited = false;
    let pendingEffectiveWinnersDisplay = null;
    let lastKnownGiveawayHostKey = "";
    let hostPanelResizeBound = false;
    // Inject the giveaway menu into the chat UI
    injectMenu();

    function injectMenu() {
        const chatboxHeader = document.querySelector(`#chatbox_header div`);
        if (!chatboxHeader) {
            setTimeout(injectMenu, 100);
            return;
        }

        addStyle(`
/* Keep vertical spacing tight */
#giveawayFrame .panel__body {
  gap: 2px !important;
  row-gap: 2px !important;
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* Specifically restore horizontal flex layout for the input rows */
#giveawayFrame .panel__body.flex-row {
  display: flex !important;
  flex-wrap: wrap !important;
  flex-direction: row !important;
  justify-content: center !important;
  gap: 20px !important; /* restore horizontal spacing */
}

#giveawayFrame .giveaway-number-row {
  width: 100%;
  justify-content: center !important;
  align-items: flex-end;
}

#giveawayFrame .giveaway-header-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

#giveawayFrame .giveaway-header-actions {
  display: flex;
  flex-direction: row;
  align-items: flex-end;
  justify-content: flex-end;
}

#giveawayFrame .giveaway-header-actions__menu-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0;
  margin-top: 6px;
  position: relative;
  z-index: 5;
}

#giveawayFrame .giveaway-btn {
  margin: 5px;
  position: relative;
  z-index: 6;
  pointer-events: auto;
}

#giveawayFrame .giveaway-number-col {
  width: 28%;
  min-width: 70px;
  max-width: 120px;
}

#giveawayFrame .giveaway-winners-row {
  margin-top: 12px;
  gap: 8px !important;
  flex-wrap: nowrap !important;
  align-self: stretch;
}

/* Custom message field should span full form width */
#giveawayFrame .giveaway-custom-message-row {
  align-self: stretch;
  width: 100% !important;
  padding: 0 10px;
  box-sizing: border-box;
}

/* Form groups still keep tight vertical margin */
#giveawayFrame .form__group {
  margin-top: 2px !important;
  margin-bottom: 2px !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

#giveawayFrame .form__text {
  padding-top: 3px !important;
  padding-bottom: 3px !important;
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}

#giveawayFrame .form__text.input-invalid {
  border-color: #dc3d1d !important;
  background-color: rgba(220, 61, 29, 0.16) !important;
}

#giveawayFrame .giveaway-inline-error {
  display: none;
  margin-top: 4px;
  color: #ff8f7d;
  font-size: 11px;
  line-height: 1.2;
}

#giveawayFrame .giveaway-inline-error.visible {
  display: block;
}

#giveawayFrame label.form__label {
  margin-top: 0 !important;
  margin-bottom: 2px !important;
  line-height: 1.1 !important;
}

/* Countdown timer fix: force block and full width below form */
#giveawayFrame #countdownHeader {
  display: block !important;
  width: 100% !important;
  margin-top: 10px;
  margin-bottom: 10px;
  text-align: center;
}

/* Entries wrapper full width with horizontal scroll if needed */
#giveawayFrame #entriesWrapper {
  width: 100% !important;
  overflow-x: auto;
  margin-top: 10px;
}

/* Entries table: flex to content, but never shrink below wrapper width
   and allow it to grow wider (triggering horizontal scroll). */
#giveawayFrame #entriesTable {
  border-collapse: collapse;
  table-layout: auto !important; /* override inline table-layout:fixed */
  min-width: 100%;               /* fill the frame at minimum */
  width: auto;                   /* but can grow past it if needed */
}

/* General cell padding */
#giveawayFrame #entriesTable th,
#giveawayFrame #entriesTable td {
  padding: 4px 6px;
}

/* User column: grow with username up to a cap, then ellipsis. */
#giveawayFrame #entriesTable th:nth-child(1),
#giveawayFrame #entriesTable td:nth-child(1) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 260px;   /* hard upper bound for username column */
}

/* Entry # column: flex to content, keep centered */
#giveawayFrame #entriesTable th:nth-child(2),
#giveawayFrame #entriesTable td:nth-child(2) {
  text-align: center;
  white-space: nowrap;
}

/* Prize BON column: flex to content, keep centered */
#giveawayFrame #entriesTable th:nth-child(3),
#giveawayFrame #entriesTable td:nth-child(3) {
  text-align: center;
  white-space: nowrap;
}

/* Gift status column: fixed-ish narrow width, centered */
#giveawayFrame #entriesTable th:nth-child(4),
#giveawayFrame #entriesTable td:nth-child(4) {
  width: 70px !important;
  text-align: center;
}

/* Gift verification row states (color only Entry # / Prize / Gift, not Username) */
#giveawayFrame #entriesTable tr.gift-pending > td:nth-child(2),
#giveawayFrame #entriesTable tr.gift-pending > td:nth-child(3),
#giveawayFrame #entriesTable tr.gift-pending > td:nth-child(4) {
  background-color: rgba(255, 235, 59, 0.20) !important; /* yellow-ish */
}

#giveawayFrame #entriesTable tr.gift-confirmed > td:nth-child(2),
#giveawayFrame #entriesTable tr.gift-confirmed > td:nth-child(3),
#giveawayFrame #entriesTable tr.gift-confirmed > td:nth-child(4) {
  background-color: rgba(76, 175, 80, 0.20) !important; /* green-ish */
}

#giveawayFrame #entriesTable tr.gift-self > td:nth-child(2),
#giveawayFrame #entriesTable tr.gift-self > td:nth-child(3),
#giveawayFrame #entriesTable tr.gift-self > td:nth-child(4) {
  background-color: rgba(158, 158, 158, 0.20) !important; /* grey-ish */
}

#giveawayFrame #entriesTable tr.gift-failed > td:nth-child(2),
#giveawayFrame #entriesTable tr.gift-failed > td:nth-child(3),
#giveawayFrame #entriesTable tr.gift-failed > td:nth-child(4) {
  background-color: rgba(244, 67, 54, 0.20) !important; /* red-ish */
}

/* Animated spinner for "checking" gift status */
#giveawayFrame .gift-spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #ffeb3b; /* yellow-ish accent */
  animation: giftSpinnerSpin 0.8s linear infinite;
  box-sizing: border-box;
}

@keyframes giftSpinnerSpin {
  to {
    transform: rotate(360deg);
  }
}

/* Parent container vertical stacking with spacing */
#giveawayFrame #giveaway_body {
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
}

/* --- Improved vertical centering and layout for coinHeader --- */
#giveawayFrame #coinHeader.panel__heading--centered {
  margin-top: 14px !important;
  margin-bottom: 0 !important;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5em;
  gap: 6px;
}

#giveawayFrame .bg-flash {
  animation: bgFlashPulse 1s ease-out;
}

@keyframes bgFlashPulse {
  0% {
    box-shadow: 0 0 0 0 rgba(255, 192, 10, 0.6);
    background-color: rgba(255, 192, 10, 0.26);
  }
  100% {
    box-shadow: 0 0 0 10px rgba(255, 192, 10, 0);
    background-color: rgba(255, 192, 10, 0);
  }
}

  ${settingsMenuStyle}
  ${commandsMenuStyle}
  ${hostPanelStyle}

/* Silence <h1> inside <section> console warning */
#giveawayFrame h1.panel__heading--centered {
  font-size: 1.5em;
  margin: 0;
}

/* ───────── Minimized state ───────── */

#giveawayFrame.minimized {
  height: auto !important;
  min-height: 0 !important;
  overflow: hidden !important;
}

#giveawayFrame.minimized #giveaway_body,
#giveawayFrame.minimized #giveaway_settings_menu,
#giveawayFrame.minimized #giveaway_commands_menu,
#giveawayFrame.minimized .giveaway-header-actions__menu-row,
#giveawayFrame.minimized .rigged-watermark {
  display: none !important;
}

/* ───────── Rigged mode theming ───────── */

#giveawayFrame.rigged {
  border-color: #dc3d1d !important;
  box-shadow: 0 0 14px rgba(220, 61, 29, 0.75);
}

#giveawayFrame.rigged header.panel__heading {
  background: linear-gradient(90deg, #dc3d1d, #4e0000);
  color: #fff;
}

/* Watermark sits behind the content */
#giveawayFrame .rigged-watermark {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: none;              /* default hidden */
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  font-weight: 900;
  opacity: 0.06;
  text-transform: uppercase;
  transform: rotate(-22deg);
  letter-spacing: 0.25em;
}

#giveawayFrame.rigged .rigged-watermark {
  display: flex;
  animation: rigWatermarkPulse 4s ease-in-out infinite;
}

/* Pulsing badge animation */
#riggedBadge.rigged-pulse {
  animation: rigPulse 1.2s ease-in-out infinite;
}

@keyframes rigPulse {
  0% {
    transform: scale(1);
    box-shadow: none;
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 8px rgba(220, 61, 29, 0.8);
  }
  100% {
    transform: scale(1);
    box-shadow: none;
  }
}

@keyframes rigWatermarkPulse {
  0% {
    opacity: 0.03;
    text-shadow: none;
    transform: rotate(-22deg) scale(1);
  }
  50% {
    opacity: 0.10;
    text-shadow: 0 0 10px rgba(220, 61, 29, 0.45);
    transform: rotate(-22deg) scale(1.03);
  }
  100% {
    opacity: 0.03;
    text-shadow: none;
    transform: rotate(-22deg) scale(1);
  }
}

#giveawayFrame.rigged #startButton {
  animation: rigStopPulse 1.5s ease-in-out infinite;
}

@keyframes rigStopPulse {
  0%   { transform: scale(1); }
  50%  { transform: scale(1.03); }
  100% { transform: scale(1); }
}
`, 'giveaway-styles');

        const existingGiveawayFrame = document.getElementById("giveawayFrame");
        if (existingGiveawayFrame) existingGiveawayFrame.remove();

        document.body.insertAdjacentHTML("beforeend", frameHTML);

        settingsMenu = document.getElementById('giveaway_settings_menu');
        commandsMenu = document.getElementById('giveaway_commands_menu');
        timerInput = document.getElementById("timerNum");
        remNumInput = document.getElementById("reminderNum");
        reminderEvery = document.getElementById("reminderEvery");

        // Enforce whole-number minutes in the Time field (no decimals / exponent notation)
        // (No page refresh required; prevents accidental fractional minutes.)
        (function enforceWholeMinutesOnTimerField() {
            if (!timerInput) return;

            let lastValid = String(timerInput.value || "5");
            const blockedKeys = new Set(['.', ',', 'e', 'E', '+', '-']);

            timerInput.addEventListener('keydown', (e) => {
                if (blockedKeys.has(e.key)) e.preventDefault();
            });

            timerInput.addEventListener('input', () => {
                const v = String(timerInput.value ?? "").trim();
                if (v === "") {
                    timerInput.setCustomValidity("");
                    return;
                }

                if (/^\d+$/.test(v)) {
                    const n = parseInt(v, 10);
                    if (Number.isFinite(n) && n >= 1) {
                        timerInput.setCustomValidity("");
                        lastValid = v;
                        return;
                    }
                }

                timerInput.setCustomValidity("Please enter a whole number of minutes (no decimals).");
                timerInput.value = lastValid;
            });
        })();

        giveawayFrame = document.getElementById('giveawayFrame');

        settingsBtn = giveawayFrame.querySelector('#giveawaySettingsBtn');
        commandsBtn = giveawayFrame.querySelector('#commandsButton');

        // Create / attach "RIGGED" badge next to the version
        const versionSmall = giveawayFrame.querySelector('header.panel__heading small');
        if (versionSmall) {
            rigBadge = document.createElement('span');
            rigBadge.id = 'riggedBadge';
            rigBadge.textContent = 'RIGGED';
            rigBadge.title = "Rigged mode is purely cosmetic… allegedly.";
            rigBadge.setAttribute("aria-label", "Rigged mode indicator");
            rigBadge.style.cssText = `

      margin-left: 8px;
      padding: 2px 6px;
      border-radius: 4px;
      background: #dc3d1d;
      color: #fff;
      font-size: 0.75em;
      font-weight: 700;
    `;
            rigBadge.hidden = true;
            versionSmall.insertAdjacentElement('afterend', rigBadge);
        }

        // Update both when either changes
        timerInput.addEventListener("input", syncReminderNumUI);
        remNumInput.addEventListener("input", syncReminderNumUI);

        // Call on init
        syncReminderNumUI();


        /* kick-start synchronisation so defaults line up on first render */
        remNumInput.dispatchEvent(new Event("input"));

        settingsBtn.addEventListener('click', e => {
            e.stopPropagation(); // don’t bubble to outside-click
            if (commandsMenu.classList.contains('open')) hardCloseCommands(); // close the other pane first

            const open = settingsMenu.classList.toggle('open');

            if (open) { // ---------- OPEN ----------
                syncSettingsFromStorage();
                settingsMenu.style.display = 'flex';
                renderGiveawayLogPanel();
                fitSettingsMenuHeight();
                document.addEventListener('click', handleOutsideClick);
            } else { // ---------- CLOSE ----------
                hardCloseSettings();
            }
        });

        chatboxHeader.prepend(giveawayBTN);
        giveawayBTN.parentNode.insertBefore(document.createTextNode(" "), giveawayBTN.nextSibling);

        resetButton = document.getElementById("resetButton");
        resetButton.onclick = function () {
            if (giveawayData && giveawayData.timeLeft > 0) {
                if (window.confirm("Are you sure you want to reset the giveaway? This will clear all entries and cannot be undone.")) {
                    resetGiveaway();
                }
            } else {
                resetGiveaway();
            }
        };

        closeButton = document.getElementById("closeButton");
        closeButton.onclick = function () {
            // Check if a giveaway is active
            if (giveawayData && giveawayData.timeLeft > 0) {
                if (window.confirm("A giveaway is currently running. Are you sure you want to close the menu? This will NOT end the giveaway, but you may lose track of its progress.")) {
                    toggleMenu();
                }
            } else {
                toggleMenu();
            }
        };

        minimizeButton = document.getElementById("minimizeButton");
        minimizeButton.onclick = function () {
            toggleMinimize();
        };
        // Restore minimized state from localStorage
        if (localStorage.getItem(LS_MINIMIZED) === "true") {
            setMinimized(true);
        }

        // Toggles
        const toggles = [
            // For these, localStorage stores "disabled/suppressed" (true), so checked means NOT stored.
            ["randomToggle", "giveaway-disableRandom", "disable_random", false],
            ["luckyToggle", "giveaway-disableLucky", "disable_lucky", false],
            ["freeToggle", "giveaway-disableFree", "disable_free", false],
            ["entryrepliesToggle", LS_SUPPRESS, "suppress_entry_replies", false],

            // For silent mode / giveaway log, localStorage stores "enabled" (true), so checked mirrors stored.
            ["silentmodeToggle", LS_SILENT, "silent_mode", true],
            ["showgiveawaylogToggle", LS_SHOW_GIVEAWAY_LOG, "show_giveaway_log", true]
        ];

        function syncSettingsFromStorage() {
            for (const [id, key, setting, checkedWhenTrue = false] of toggles) {
                const el = document.getElementById(id);
                if (!el) continue;

                const fallback = checkedWhenTrue ? false : GENERAL_SETTINGS[setting] === true;
                const stored = readStoredBooleanSetting(key, fallback, true);

                // If stored=true means "disabled", checkbox should be unchecked; otherwise mirror stored.
                el.checked = checkedWhenTrue ? stored : !stored;

                // Keep GENERAL_SETTINGS value as the stored meaning (disabled/suppressed/enabled-for-silent/show-log)
                GENERAL_SETTINGS[setting] = stored;
            }
        }

        syncSettingsFromStorage();

        for (const [id, key, setting, checkedWhenTrue = false] of toggles) {
            const el = document.getElementById(id);
            if (!el) continue;

            el.addEventListener("change", () => {
                const newVal = checkedWhenTrue ? el.checked : !el.checked;
                GENERAL_SETTINGS[setting] = newVal;
                localStorage.setItem(key, String(newVal));
                if (setting === "show_giveaway_log") {
                    renderGiveawayLogPanel();
                }
                updateHostPanelUI();
            });
        }


        bindSettingsSectionToggleButtons();

        updateHostPanelUI();

        rigToggleInput = document.getElementById("rigModeToggle");
        if (rigToggleInput) {
            rigToggleInput.addEventListener("change", () => {
                const nameNode = document.getElementsByClassName("top-nav__username")[0];
                const hostName = nameNode?.children[0]?.textContent.trim() || "";

                const ctx = {
                    author: hostName,
                    fancyName: "",
                    args: [],
                    giveawayData: giveawayData || { host: hostName },
                    safeAuthor: sanitizeNick(hostName),
                    safeHost: sanitizeNick(hostName)
                };

                if (rigToggleInput.checked && !riggedMode) {
                    COMMAND_HANDLERS.rig(ctx);
                } else if (!rigToggleInput.checked && riggedMode) {
                    COMMAND_HANDLERS.unrig(ctx);
                } else {
                    updateRigToggleUI();
                }
            });
            updateRigToggleUI();
        }

        coinHeader = document.getElementById("coinHeader");
        const hostBalance = readHostBalance();
        coinHeader.textContent = fmtBON(hostBalance);
        coinHeader.prepend(goldCoins.cloneNode(false));

        coinInput = document.getElementById("giveawayAmount");

        // remove formatting while editing
        coinInput.addEventListener('focus', () => {
            coinInput.value = coinInput.value.replace(/[^0-9]/g, '');
        });

        // add locale formatting on blur if it’s a valid integer
        coinInput.addEventListener('blur', () => {
            const raw = coinInput.value.replace(/[^0-9]/g, '');
            if (/^\d+$/.test(raw)) {
                coinInput.value = parseInt(raw, 10).toLocaleString();
            }
        });

        startInput = document.getElementById("startNum");
        endInput = document.getElementById("endNum");
        winnersInput = document.getElementById("winnersNum");
        if (pendingEffectiveWinnersDisplay != null) syncWinnersDisplayValue(pendingEffectiveWinnersDisplay);
        scaleWinnersToggleInput = document.getElementById("scaleWinnersToggle");
        maxScaledWinnersInput = document.getElementById("maxScaledWinnersNum");
        maxScaledWinnersGroup = document.getElementById("maxScaledWinnersGroup");
        maxScaledWinnersError = document.getElementById("maxScaledWinnersError");
        maxScaledWinnersRawValue = String(maxScaledWinnersInput?.value || "1");
        scaleBonPerWinnerInput = document.getElementById("scaleBonPerWinnerNum");
        scaleBonPerWinnerGroup = document.getElementById("scaleBonPerWinnerGroup");
        customMessageInput = document.getElementById("customMessage");
        giveawayForm = document.getElementById("giveawayForm");
        startButton = document.getElementById("startButton");

        startButton.onclick = startGiveaway;
        startButton.title = "Start the giveaway";

        // Presets
        bindPresetButtons();
        refreshPresetDropdown();

        countdownHeader = document.getElementById("countdownHeader");
        entriesWrapper = document.getElementById("entriesWrapper");
        giveawayLogPanel = document.getElementById("giveawayLogPanel");
        giveawayLogContent = document.getElementById("giveawayLogContent");
        document.getElementById("copyGiveawayLogButton")?.addEventListener("click", copyGiveawayLogToClipboard);
        document.getElementById("clearGiveawayLogButton")?.addEventListener("click", clearGiveawayLog);
        renderGiveawayLogPanel();
        document.body.appendChild(giveawayFrame);

        // Draggable panel (header title row only; menu/button row is excluded)
        bindHeaderInteractions();

        window.addEventListener('resize', () => {
            if (settingsMenu?.classList.contains('open')) fitSettingsMenuHeight();
        });

        timerInput.addEventListener("input", reminderAutoScaling);
        startInput.addEventListener("input", entryRangeValidation);
        endInput.addEventListener("input", entryRangeValidation);
        winnersInput.addEventListener("input", winnersValidation);
        coinInput.addEventListener("input", syncBonPerWinnerValue);
        winnersInput.addEventListener("input", syncBonPerWinnerValue);
        if (scaleBonPerWinnerInput) {
            scaleBonPerWinnerInput.addEventListener("input", () => { bonPerWinnerManuallyEdited = true; });
            // If user clears the field entirely, revert to auto mode
            scaleBonPerWinnerInput.addEventListener("blur", () => {
                if (!String(scaleBonPerWinnerInput.value || "").trim()) {
                    bonPerWinnerManuallyEdited = false;
                    syncBonPerWinnerValue();
                }
            });
        }
        scaleWinnersToggleInput.addEventListener("change", updateScaleWinnersControls);
        maxScaledWinnersInput.addEventListener("input", handleMaxScaledWinnersInput);
        maxScaledWinnersInput.addEventListener("blur", () => validateMaxScaledWinnersInput({ forceMessage: true }));

        updateScaleWinnersControls();
        reminderAutoScaling();
        updateHostPanelUI();

        // ── Attempt to restore a giveaway that survived a page reload ──
        const savedSnap = loadGiveawaySnapshot();
        if (savedSnap) {
            if (isLockedByAnotherTab()) {
                // Another tab is actively running this giveaway — don't duplicate it
                console.info("[BON Giveaway] Active giveaway detected in another tab, skipping restore.");
            } else {
                const restored = restoreGiveawayFromSnapshot(savedSnap);
                if (restored) {
                    // Show the panel automatically so the host sees the restored state
                    giveawayFrame.hidden = false;
                    setMinimized(false);
                    console.info("[BON Giveaway] Restored active giveaway from snapshot.");
                }
            }
        }
    }

    function ensureHostPanelToggleButton() {
        if (!giveawayFrame) return null;
        const actionsRow = giveawayFrame.querySelector('.giveaway-header-actions__menu-row');
        if (!actionsRow) return null;
        let toggle = actionsRow.querySelector('#hostPanelToggle');
        if (!toggle) {
            actionsRow.insertAdjacentHTML('beforeend', `
      <button id="hostPanelToggle" class="form__button form__button--text giveaway-btn no-drag" data-no-drag="1" style="background-color:#ff9600;" title="Open/close host command panel.">
        <i class="fa-solid fa-sliders"></i> Host Panel
      </button>`);
            toggle = actionsRow.querySelector('#hostPanelToggle');
        }
        return toggle;
    }

    function toggleMenu() {
        giveawayFrame.hidden = !giveawayFrame.hidden;
        if (!giveawayFrame.hidden) {
            ensureHostPanelToggleButton();
            updateHostPanelUI();
        }
    }

    function setMinimized(minimized) {
        if (!giveawayFrame) return;
        const icon = minimizeButton?.querySelector("i");
        if (minimized) {
            giveawayFrame.classList.add("minimized");
            if (icon) { icon.className = "fa-solid fa-window-maximize"; }
            if (minimizeButton) minimizeButton.title = "Restore panel";
        } else {
            giveawayFrame.classList.remove("minimized");
            if (icon) { icon.className = "fa-solid fa-window-minimize"; }
            if (minimizeButton) minimizeButton.title = "Minimize panel";
        }
        localStorage.setItem(LS_MINIMIZED, String(minimized));
    }

    function toggleMinimize() {
        setMinimized(!giveawayFrame.classList.contains("minimized"));
    }

    // ───────────────────────────────────────────────────────────
    // Presets — save / load / delete form configurations
    // ───────────────────────────────────────────────────────────
    function loadPresetList() {
        try {
            return JSON.parse(localStorage.getItem(LS_PRESETS) || "[]");
        } catch { return []; }
    }

    function savePresetList(presets) {
        try { localStorage.setItem(LS_PRESETS, JSON.stringify(presets)); } catch {}
    }

    function captureFormPreset() {
        return {
            amount: coinInput?.value || "",
            startNum: startInput?.value || "1",
            endNum: endInput?.value || "50",
            timer: timerInput?.value || "5",
            reminders: remNumInput?.value || "0",
            winners: winnersInput?.value || "1",
            scaleWinners: scaleWinnersToggleInput?.checked || false,
            maxScaledWinners: maxScaledWinnersInput?.value || "1",
            scaleBonPerWinner: scaleBonPerWinnerInput?.value || "",
            scaleBonPerWinnerCustom: bonPerWinnerManuallyEdited,
            customMessage: customMessageInput?.value || ""
        };
    }

    function applyFormPreset(preset) {
        if (!preset) return;
        if (coinInput && preset.amount) coinInput.value = preset.amount;
        if (startInput && preset.startNum) startInput.value = preset.startNum;
        if (endInput && preset.endNum) endInput.value = preset.endNum;
        if (timerInput && preset.timer) timerInput.value = preset.timer;
        if (remNumInput && preset.reminders != null) remNumInput.value = preset.reminders;
        if (winnersInput && preset.winners) winnersInput.value = preset.winners;
        if (scaleWinnersToggleInput) {
            scaleWinnersToggleInput.checked = !!preset.scaleWinners;
            scaleWinnersToggleInput.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (maxScaledWinnersInput && preset.maxScaledWinners) maxScaledWinnersInput.value = preset.maxScaledWinners;
        if (scaleBonPerWinnerInput) {
            const presetBonPerWinner = String(preset.scaleBonPerWinner || "").trim();
            if (preset.scaleBonPerWinnerCustom && presetBonPerWinner) {
                scaleBonPerWinnerInput.value = presetBonPerWinner;
                bonPerWinnerManuallyEdited = true;
            } else {
                bonPerWinnerManuallyEdited = false;
                syncBonPerWinnerValue();
            }
        }
        if (customMessageInput && preset.customMessage != null) customMessageInput.value = preset.customMessage;

        // Re-sync dependent UI
        syncReminderNumUI();
        if (typeof entryRangeValidation === "function") entryRangeValidation();
        if (typeof winnersValidation === "function") winnersValidation();
        if (typeof updateScaleWinnersControls === "function") updateScaleWinnersControls();
    }

    function refreshPresetDropdown() {
        const select = document.getElementById("presetSelect");
        if (!select) return;
        const presets = loadPresetList();

        // Preserve current selection if possible
        const prevVal = select.value;
        select.innerHTML = '<option value="">— Presets —</option>';
        presets.forEach((p, i) => {
            const opt = document.createElement("option");
            opt.value = String(i);
            opt.textContent = p.name || `Preset ${i + 1}`;
            select.appendChild(opt);
        });

        // Restore selection
        if (prevVal && select.querySelector(`option[value="${prevVal}"]`)) {
            select.value = prevVal;
        }
    }

    function bindPresetButtons() {
        const saveBtn = document.getElementById("presetSaveBtn");
        const loadBtn = document.getElementById("presetLoadBtn");
        const deleteBtn = document.getElementById("presetDeleteBtn");
        const select = document.getElementById("presetSelect");

        if (saveBtn) saveBtn.addEventListener("click", () => {
            const name = window.prompt("Name this preset:");
            if (!name || !name.trim()) return;
            const presets = loadPresetList();
            presets.push({ name: name.trim(), ...captureFormPreset() });
            savePresetList(presets);
            refreshPresetDropdown();
            if (select) select.value = String(presets.length - 1);
        });

        if (loadBtn) loadBtn.addEventListener("click", () => {
            if (!select || select.value === "") return;
            const presets = loadPresetList();
            const idx = parseInt(select.value, 10);
            if (presets[idx]) applyFormPreset(presets[idx]);
        });

        if (deleteBtn) deleteBtn.addEventListener("click", () => {
            if (!select || select.value === "") return;
            const presets = loadPresetList();
            const idx = parseInt(select.value, 10);
            const preset = presets[idx];
            if (!preset) return;
            if (!window.confirm(`Delete preset "${preset.name || "Preset " + (idx + 1)}"?`)) return;
            presets.splice(idx, 1);
            savePresetList(presets);
            refreshPresetDropdown();
        });
    }

    // ───────────────────────────────────────────────────────────
    // Giveaway persistence — survive page reloads mid-giveaway
    // ───────────────────────────────────────────────────────────

    /** Claim the tab lock — marks this tab as the active giveaway owner. */
    function acquireTabLock() {
        try {
            localStorage.setItem(LS_TAB_LOCK, JSON.stringify({ tabId: TAB_ID, ts: Date.now() }));
        } catch {}
        // Start heartbeat so other tabs know we're alive
        if (tabLockHeartbeatTimer) clearInterval(tabLockHeartbeatTimer);
        tabLockHeartbeatTimer = setInterval(() => {
            try {
                localStorage.setItem(LS_TAB_LOCK, JSON.stringify({ tabId: TAB_ID, ts: Date.now() }));
            } catch {}
        }, TAB_LOCK_HEARTBEAT_MS);
    }

    /** Release the tab lock and stop the heartbeat. */
    function releaseTabLock() {
        if (tabLockHeartbeatTimer) { clearInterval(tabLockHeartbeatTimer); tabLockHeartbeatTimer = null; }
        try {
            // Only remove if we still own it
            const raw = localStorage.getItem(LS_TAB_LOCK);
            if (raw) {
                const lock = JSON.parse(raw);
                if (lock.tabId === TAB_ID) localStorage.removeItem(LS_TAB_LOCK);
            }
        } catch {}
    }

    /** Check if another tab currently owns the giveaway (fresh heartbeat). */
    function isLockedByAnotherTab() {
        try {
            const raw = localStorage.getItem(LS_TAB_LOCK);
            if (!raw) return false;
            const lock = JSON.parse(raw);
            if (lock.tabId === TAB_ID) return false; // we own it
            return (Date.now() - lock.ts) < TAB_LOCK_STALE_MS; // fresh = another tab is alive
        } catch {
            return false;
        }
    }

    /**
     * Serialize the active giveaway state to localStorage.
     * Called at key mutation points (new entry, start, addbon, sponsor, time adjust).
     */
    function snapshotGiveaway() {
        if (!giveawayData) return;
        try {
            const snapshot = {
                giveawayData: {
                    host: giveawayData.host,
                    amount: giveawayData.amount,
                    startNum: giveawayData.startNum,
                    endNum: giveawayData.endNum,
                    totalEntries: giveawayData.totalEntries,
                    winningNumber: giveawayData.winningNumber,
                    totalSeconds: giveawayData.totalSeconds,
                    endTs: giveawayData.endTs,
                    winnersNum: giveawayData.winnersNum,
                    baseWinnersAtStart: giveawayData.baseWinnersAtStart,
                    effectiveWinnersNum: giveawayData.effectiveWinnersNum,
                    scaleWinnersWithSponsors: giveawayData.scaleWinnersWithSponsors,
                    hostMaxScaledWinners: giveawayData.hostMaxScaledWinners,
                    scaleBonPerWinner: giveawayData.scaleBonPerWinner,
                    customMessage: giveawayData.customMessage,
                    hostAdded: giveawayData.hostAdded,
                    initialPotVerifiedAtStart: giveawayData.initialPotVerifiedAtStart,
                    reminderSchedule: giveawayData.reminderSchedule,
                    reminderNum: giveawayData.reminderNum,
                    reminderFreqSec: giveawayData.reminderFreqSec,
                    nextReminderSec: giveawayData.nextReminderSec,
                    sponsorContribs: giveawayData.sponsorContribs,
                    sponsors: giveawayData.sponsors,
                    lastAnnouncedWinners: giveawayData.lastAnnouncedWinners
                },
                entries: Array.from(numberEntries.entries()),
                takenBy: Array.from(numberTakenBy.entries()),
                fancyNameEntries: Array.from(fancyNames.entries()),
                riggedMode: riggedMode,
                startTime: giveawayStartTime ? giveawayStartTime.getTime() : null,
                savedAt: Date.now()
            };
            localStorage.setItem(LS_ACTIVE_GIVEAWAY, JSON.stringify(snapshot));
        } catch (e) {
            console.warn("Giveaway snapshot failed:", e);
        }
    }

    /** Clear the persisted giveaway state. */
    function clearGiveawaySnapshot() {
        try { localStorage.removeItem(LS_ACTIVE_GIVEAWAY); } catch {}
    }

    /** Check for a saved giveaway that hasn't expired yet. Returns the parsed snapshot or null. */
    function loadGiveawaySnapshot() {
        try {
            const raw = localStorage.getItem(LS_ACTIVE_GIVEAWAY);
            if (!raw) return null;
            const snap = JSON.parse(raw);
            if (!snap || !snap.giveawayData) return null;

            // Expired?
            if (snap.giveawayData.endTs <= Date.now()) {
                clearGiveawaySnapshot();
                return null;
            }
            return snap;
        } catch {
            clearGiveawaySnapshot();
            return null;
        }
    }

    /**
     * Restore a giveaway from a snapshot. Re-establishes entries, timers, observer, and sponsor tracker.
     * Called during injectMenu() if a valid snapshot exists.
     */
    function restoreGiveawayFromSnapshot(snap) {
        if (!snap || !snap.giveawayData) return false;

        try {
            // 1) Restore giveaway data
            giveawayData = snap.giveawayData;

            // Recalculate timeLeft from the stored endTs
            giveawayData.timeLeft = Math.max(Math.ceil((giveawayData.endTs - Date.now()) / 1000), 0);
            if (giveawayData.timeLeft <= 0) {
                giveawayData = null;
                clearGiveawaySnapshot();
                return false;
            }

            // 2) Restore entries
            numberEntries.clear();
            numberTakenBy.clear();
            fancyNames.clear();
            if (Array.isArray(snap.entries)) {
                for (const [author, num] of snap.entries) {
                    numberEntries.set(author, num);
                }
            }
            if (Array.isArray(snap.takenBy)) {
                for (const [num, author] of snap.takenBy) {
                    numberTakenBy.set(num, author);
                }
            }
            if (Array.isArray(snap.fancyNameEntries)) {
                for (const [author, html] of snap.fancyNameEntries) {
                    fancyNames.set(author, html);
                }
            }

            // 3) Restore rigged mode
            riggedMode = !!snap.riggedMode;
            if (riggedMode) {
                if (rigBadge) { rigBadge.hidden = false; rigBadge.classList.add('rigged-pulse'); }
                if (giveawayFrame) giveawayFrame.classList.add('rigged');
            }
            updateRigToggleUI();

            // 4) Restore start time
            giveawayStartTime = snap.startTime ? new Date(snap.startTime) : new Date();

            lastKnownGiveawayHostKey = normUserKey(giveawayData.host) || lastKnownGiveawayHostKey;

            acquireTabLock();

            // 5) Lock form fields
            startButton.disabled = false;
            coinInput.disabled = true;
            startInput.disabled = true;
            endInput.disabled = true;
            timerInput.disabled = true;
            customMessageInput.disabled = true;
            winnersInput.disabled = true;
            if (scaleWinnersToggleInput) scaleWinnersToggleInput.disabled = true;
            if (maxScaledWinnersInput) maxScaledWinnersInput.disabled = true;
            if (scaleBonPerWinnerInput) scaleBonPerWinnerInput.disabled = true;
            remNumInput.disabled = true;
            reminderEvery.disabled = true;
            entriesWrapper.hidden = false;

            // 6) Update UI
            coinHeader.innerHTML = `${fmtBON(cleanPotString(giveawayData.amount))} BON`;
            coinHeader.prepend(goldCoins.cloneNode(false));
            updateEntries();

            // 7) Re-establish chatbox reference
            if (chatbox == null) {
                chatbox = document.querySelector(`#${chatboxId}`);
            }
            cacheChatContext();

            // 8) Re-start observer
            if (observer) { observer.disconnect(); observer = null; }
            addObserver(giveawayData);

            // 9) Re-start sponsor tracker
            if (sponsorsInterval) { clearInterval(sponsorsInterval); sponsorsInterval = null; }
            if (window.__activeTracker) window.__activeTracker = null;
            const tracker = new SponsorTracker({ chatroomId, giveawayStartTime, giveawayData });
            window.__activeTracker = tracker;
            tracker.poll().catch(console.error);
            sponsorsInterval = setInterval(() => tracker.poll(), 5_000);

            // 10) Re-start countdown timer
            giveawayData.countdownTimerID = countdownTimer(countdownHeader, giveawayData);

            // 11) Re-start pot updater
            giveawayData.potUpdater = setInterval(() => {
                coinHeader.innerHTML = `${fmtBON(cleanPotString(giveawayData.amount))} BON`;
                coinHeader.prepend(goldCoins.cloneNode(false));
            }, 5000);

            // 12) Set up beforeunload guard
            window.onbeforeunload = function (e) {
                try { flushStatsNow(); snapshotGiveaway(); } catch {}
                e.preventDefault();
                e.returnValue = "";
                return "";
            };

            // 13) Wire stop button
            startButton.textContent = "Stop";
            startButton.style.backgroundColor = "#b32525";
            startButton.title = "This will end the giveaway and send gifts to the winners";
            startButton.onclick = () => {
                logEvent("Giveaway stop requested", "Requested from UI Stop button.");
                endGiveaway();
            };

            logEvent("Giveaway restored", `Recovered ${numberEntries.size} entries after page reload. Time left: ${parseTime(giveawayData.timeLeft * 1000)}`);
            updateHostPanelUI();

            return true;
        } catch (e) {
            console.error("Giveaway restore failed:", e);
            clearGiveawaySnapshot();
            return false;
        }
    }

    // --- update check -------------------------------------------------
    (async () => {
        const last = +localStorage.getItem(`${SCRIPT_ID}-lastCheck`) || 0;
        const now = Date.now();
        if (now - last < CHECK_EVERY_HOURS * 3_600_000) return;

        GM_xmlhttpRequest({
            method: 'GET',
            url:    SCRIPT_UPDATE_URL,
            onload: res => {
                if (res.status !== 200) return console.warn('update-check HTTP', res.status);
                const m = res.responseText.match(/@version\s+([0-9.]+)/);
                if (!m) return console.warn('update-check: version tag not found');
                const remote = m[1].trim();

                if (isNewer(remote, SCRIPT_VERSION)) {
                    localStorage.setItem(UPDATE_KEY, remote); // 💾  persist
                    waitForBadge(remote); // 🎟  show badge
                } else {
                    localStorage.removeItem(UPDATE_KEY); // ✅ up-to-date
                }
            },
            onerror:  err => console.error('update-check failed', err),
            ontimeout:() => console.error('update-check timed out')
        });

        localStorage.setItem(`${SCRIPT_ID}-lastCheck`, String(now));
    })();



    // Utility function to compare semantic versions
    function isNewer(remote, local) {
        const r = remote.split('.').map(Number);
        const l = local .split('.').map(Number);
        const len = Math.max(r.length, l.length);
        for (let i = 0; i < len; i++) {
            const a = r[i] || 0;
            const b = l[i] || 0;
            if (a !== b) return a > b;
        }
        return false;
    }

    // Attempts to insert the "Update available" badge into the header
    function showBadge(remoteVer) {
        // the <small> that holds “v3.0.0”
        const versionTag = document.querySelector('#giveawayFrame header.panel__heading small');

        if (!versionTag) return false; // frame not rendered yet
        // prevent duplicates
        if (versionTag.parentElement.querySelector('.bon-gUpdateBadge')) return true;

        const badge = document.createElement('a');
        badge.className = 'bon-gUpdateBadge';
        badge.href = SCRIPT_UPDATE_URL.replace('.meta.js', '.user.js');
        badge.target = '_blank';
        badge.style.cssText = `
    background:#DC3D1D;color:#fff;border-radius:4px;padding:2px 6px;
    font-size:12px;margin-left:6px;text-decoration:none;cursor:pointer;
  `;
        badge.textContent = 'Update available';
        badge.title = `New version ${remoteVer} is available – click to install`;
        versionTag.appendChild(badge);
        return true;
    }

    // Tries to add the badge once per second until successful
    function waitForBadge(remote) {
        const id = setInterval(() => {
            if (showBadge(remote)) clearInterval(id);
        }, 1000);
    }

    function formatLogTimestamp(date = new Date()) {
        const pad = (n) => String(n).padStart(2, "0");
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }

    function renderGiveawayLogPanel() {
        if (!giveawayLogContent) return;
        if (giveawayLogPanel) {
            giveawayLogPanel.style.display = GENERAL_SETTINGS.show_giveaway_log ? "block" : "none";
        }
        giveawayLogContent.textContent = giveawayLog.length ? giveawayLog.join("\n") : "No events yet.";
        giveawayLogContent.scrollTop = giveawayLogContent.scrollHeight;
    }

    function clearGiveawayLog() {
        giveawayLog.length = 0;
        renderGiveawayLogPanel();
    }

    async function copyGiveawayLogToClipboard() {
        const text = giveawayLog.join("\n");
        if (!text) return;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return;
            }
        } catch {}

        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch {}
        ta.remove();
    }

    function logEvent(type, details = "") {
        const t = String(type || "Event").trim();
        const d = String(details || "").trim();
        const msg = d ? `${t}: ${d}` : t;
        giveawayLog.push(`[${formatLogTimestamp()}] ${msg}`);
        if (giveawayLog.length > 500) giveawayLog.splice(0, giveawayLog.length - 500);
        renderGiveawayLogPanel();
    }


    // ───────────────────────────────────────────────────────────
    // SECTION 6: Giveaway Lifecycle
    // ───────────────────────────────────────────────────────────
    // znth.cx policy gate: on znth.cx, running giveaways is restricted to staff (or users
    // who have been given special permission). Staff status can't be verified client-side,
    // so we surface a blocking confirmation before a giveaway can start — permitted users
    // acknowledge and proceed; everyone else is warned off and can cancel. Returns true if
    // the giveaway may proceed on the current site.
    function confirmGiveawayAllowedOnSite() {
        if (Site.host !== "znth.cx") return true;
        return window.confirm(
            "⚠️ znth.cx — giveaways are staff-only.\n\n" +
            "On znth.cx, only staff may run a giveaway unless you have been given special " +
            "permission.\n\n" +
            "If you're not staff and haven't been granted permission, click Cancel. " +
            "Otherwise, click OK to continue."
        );
    }

    async function startGiveaway() {
        if (!confirmGiveawayAllowedOnSite()) return;

        clearWinnersStatusUI();

        const maxScaledValid = validateMaxScaledWinnersInput({ forceMessage: true });
        if (scaleWinnersToggleInput && scaleWinnersToggleInput.checked && !maxScaledValid) {
            if (maxScaledWinnersInput) maxScaledWinnersInput.focus();
            return;
        }

        if (!giveawayForm.checkValidity()) {
            giveawayForm.reportValidity();
            return;
        }

        clearGiveawayLog();

        // Normalize and validate the giveaway amount separately so we tolerate
        // locale-specific separators like ' . , non-breaking spaces, etc.
        const rawAmount = coinInput.value;
        const cleanValue = rawAmount.replace(/[^0-9]/g, '');
        if (!cleanValue) {
            window.alert("Please enter a valid numeric giveaway amount.");
            return;
        }
        const amountInt = parseInt(cleanValue, 10);
        if (!Number.isFinite(amountInt) || amountInt <= 0) {
            window.alert("Please enter a giveaway amount greater than zero.");
            return;
        }

        if (sponsorsInterval) { clearInterval(sponsorsInterval); sponsorsInterval = null; }
        if (observer) { observer.disconnect(); observer = null; }

        if (chatbox == null) {
            chatbox = document.querySelector(`#${chatboxId}`);
        }

        cacheChatContext();

        startButton.disabled = true;
        coinInput.disabled = true;
        startInput.disabled = true;
        endInput.disabled = true;
        timerInput.disabled = true;
        customMessageInput.disabled = true;
        winnersInput.disabled = true;
        scaleWinnersToggleInput.disabled = true;
        maxScaledWinnersInput.disabled = true;
        if (scaleBonPerWinnerInput) scaleBonPerWinnerInput.disabled = true;
        remNumInput.disabled = true;
        reminderEvery.disabled = true;

        //startButton.parentElement.hidden = true;
        entriesWrapper.hidden = false;

        let totalTimeMin = totalMinutes();
        let totalTimeMs = totalTimeMin * 60000;
        let reminderNum = Math.min(Number(remNumInput.value), getReminderLimits(totalTimeMin)[0]);
        if (isNaN(reminderNum) || reminderNum < 0) reminderNum = 0;
        const schedule = getReminderSchedule(totalTimeMin, reminderNum);
        const cadenceSec = (reminderNum > 0) ? totalTimeMin * 60 / (reminderNum + 1) : 0;
        let winnersNum = parseInt(winnersInput.value, 10);
        const scaleWinnersWithSponsors = !!(scaleWinnersToggleInput && scaleWinnersToggleInput.checked);
        const hostMaxScaledWinners = scaleWinnersWithSponsors
        ? Math.floor(Number(maxScaledWinnersRawValue || maxScaledWinnersInput.value) || winnersNum)
        : getClampedMaxScaledWinnersValue(winnersNum);

        // Custom scaling threshold (null = auto-calculate from pot / base winners)
        const customBonPerWinner = scaleBonPerWinnerInput ? parseInt(scaleBonPerWinnerInput.value, 10) : NaN;
        const scaleBonPerWinner = (scaleWinnersWithSponsors && Number.isFinite(customBonPerWinner) && customBonPerWinner > 0)
            ? customBonPerWinner
            : null;

        giveawayData = {
            host: document.getElementsByClassName("top-nav__username")[0].children[0].textContent.trim(),
            amount: amountInt,
            startNum: parseInt(startInput.value, 10),
            endNum: parseInt(endInput.value, 10),
            totalEntries: parseInt(endInput.value, 10) - parseInt(startInput.value, 10) + 1,
            winningNumber: null,
            totalSeconds: totalTimeMs / 1000,
            timeLeft: totalTimeMs / 1000,
            endTs: Date.now() + (totalTimeMs),
            winnersNum,
            baseWinnersAtStart: winnersNum,
            effectiveWinnersNum: winnersNum,
            scaleWinnersWithSponsors,
            hostMaxScaledWinners,
            scaleBonPerWinner,
            customMessage: customMessageInput.value,
            hostAdded: amountInt,
            initialPotVerifiedAtStart: amountInt,
            reminderSchedule : schedule,
            reminderNum      : schedule.length,
            reminderFreqSec  : cadenceSec, // <- kept for legacy helpers
            nextReminderSec  : cadenceSec, // <- ditto (first reminder ETA)
            sponsorContribs: {},
            sponsors: [],
        };
        lastKnownGiveawayHostKey = normUserKey(giveawayData.host) || lastKnownGiveawayHostKey;

        acquireTabLock();
        updateRigToggleUI();
        const currentBon = await getVerifiedHostBalance({ requireServer: true, maxAgeMs: 0 });

        if (currentBon == null) {
            const startErr = "Unable to verify current BON balance.";
            logEvent("Start aborted", startErr);
            window.alert(
                "GIVEAWAY ERROR: Unable to verify your current BON balance right now. Please try again shortly."
            );
            resetGiveaway();
            return;
        }

        if (currentBon < giveawayData.amount) {
            const startErr = `Entered amount ${fmtBON(giveawayData.amount)} exceeds current BON ${fmtBON(currentBon)}.`;
            logEvent("Start aborted", startErr);
            window.alert(
                `GIVEAWAY ERROR: The amount entered (${giveawayData.amount}), is above your current BON (${currentBon}).`
            );
            resetGiveaway();
            return;
        }
        else {
            giveawayData.initialPotVerifiedAtStart = giveawayData.amount;
            recomputeEffectiveWinners(giveawayData);
            initializeScaledWinnersAnnouncementState(giveawayData);
            logEvent(
                "Giveaway started",
                `Host=${sanitizeNick(giveawayData.host)} | Host-funded=${fmtBON(giveawayData.initialPotVerifiedAtStart)} BON | Base winners=${fmtBON(giveawayData.baseWinnersAtStart)} | Time=${fmtBON(totalTimeMin)} min | Flags: silent=${GENERAL_SETTINGS.silent_mode ? "on" : "off"}, rigged=${riggedMode ? "on" : "off"}, scale=${giveawayData.scaleWinnersWithSponsors ? "on" : "off"}${giveawayData.scaleWinnersWithSponsors ? `, max winners=${fmtBON(giveawayData.hostMaxScaledWinners)}` : ""}`
            );
            giveawayData.winningNumber = getRandomInt(giveawayData.startNum, giveawayData.endNum);

            window.onbeforeunload = function (e) {
                try { flushStatsNow(); snapshotGiveaway(); } catch {}
                e.preventDefault();
                e.returnValue = "";
                return "";
            };

            let introMessage = `🎁 I am hosting a giveaway for [b][color=#ffc00a]${fmtBON(giveawayData.amount)} BON[/color][/b] | ` +
                `${buildWinnersAnnouncementLine(giveawayData)} | ` +
                `Open for [b][color=#1DDC5D]${parseTime(totalTimeMs)}[/color][/b]. ` +
                `Pick a number [b]between [color=#DC3D1D]${giveawayData.startNum} and ${giveawayData.endNum}[/color][/b]. ` +
                `[b][color=#5DE2E7]${giveawayData.customMessage}[/color][/b]\n` +
                `✨[b][color=#FB4F4F]Gift the host to add to the pot! [color=${GIFT_HINT_COLOR}](/gift ${getGiftSyntaxHostName()} AMOUNT MESSAGE)[/color][/color][/b]✨`;

            if (riggedMode) {
                introMessage += `\n[color=#FF4F9A][b]RIGGED MODE ENGAGED![/b][/color] ` +
                    `[i][color=#FF9AE6]Visual flair only — the math is still fair... probably.[/color][/i] 😈`;
            }

            if (GENERAL_SETTINGS.silent_mode) {
                introMessage += `\n[color=#ff3333][b]SILENT MODE ENABLED![/b][/color] ` +
                    `[i][color=#B0B0B0]Command replies will be sent privately via /msg.[/color][/i] 🤫`;
            }

            sendMessage(introMessage);

            // Start the ignore window *and* sponsor tracking right after the intro
            giveawayStartTime = new Date();

            if (window.__activeTracker) window.__activeTracker = null;
            let tracker = new SponsorTracker({ chatroomId, giveawayStartTime, giveawayData });
            window.__activeTracker = tracker;
            tracker.poll().catch(console.error);
            sponsorsInterval = setInterval(() => tracker.poll(), 5_000);

            if (observer) {
                startObserver();
            } else {
                addObserver(giveawayData);
            }

            giveawayData.countdownTimerID = countdownTimer(countdownHeader, giveawayData);

            giveawayData.potUpdater = setInterval(() => {
                coinHeader.innerHTML = `${fmtBON(cleanPotString(giveawayData.amount))} BON`;
                coinHeader.prepend(goldCoins.cloneNode(false));
            }, 5000);

            // Start button → Stop button wiring stays the same...
        }

        // ** TOGGLE BUTTON TO STOP **
        startButton.textContent = "Stop";
        startButton.style.backgroundColor = "#b32525"; // red to indicate Stop
        startButton.title = "This will end the giveaway and send gifts to the winners";
        startButton.disabled = false;
        startButton.onclick = () => {
            logEvent("Giveaway stop requested", "Requested from UI Stop button.");
            endGiveaway();
        };

        // Persist giveaway state so it can survive a page reload
        snapshotGiveaway();

        updateHostPanelUI();
    }

    function resetGiveaway() {
        entriesWrapper.hidden = true;
        clearWinnersStatusUI();

        countdownHeader.textContent = "";
        countdownHeader.hidden = true;
        startButton.parentElement.hidden = false;

        coinInput.disabled = false;
        startInput.disabled = false;
        endInput.disabled = false;
        timerInput.disabled = false;
        customMessageInput.disabled = false;
        winnersInput.disabled = false;
        scaleWinnersToggleInput.disabled = false;
        remNumInput.disabled = false;
        reminderEvery.disabled = false;

        giveawayForm.reset()
        updateScaleWinnersControls();
        if (maxScaledWinnersDebounceTimer) {
            clearTimeout(maxScaledWinnersDebounceTimer);
            maxScaledWinnersDebounceTimer = null;
        }
        maxScaledWinnersRawValue = String(maxScaledWinnersInput?.value || winnersInput?.value || "1");
        setMaxScaledWinnersError("");
        updateStartButtonState();

        stopGiveaway();

        updateEntries();

        // ——— restore host’s balance display ———
        const hostBalance = readHostBalance();

        // update the header
        coinHeader.textContent = fmtBON(hostBalance);
        coinHeader.prepend(goldCoins.cloneNode(false));


        // ** RESET BUTTON TO START **
        startButton.textContent = "Start";
        startButton.style.backgroundColor = "#02B008"; // green for Start
        startButton.title = "Start the giveaway";
        startButton.onclick = startGiveaway;
        startButton.disabled = false;

        updateHostPanelUI();
    }

    function stopGiveaway() {
        startButton.disabled = true; //prevents stop button from being clicked once giveaway has ended
        // Flush any pending stats writes before tearing down
        try { flushStatsNow(); } catch {}

        // Clear persisted giveaway state (giveaway is ending normally)
        clearGiveawaySnapshot();
        releaseTabLock();

        // ── timers ──
        if (giveawayData?.countdownTimerID) clearInterval(giveawayData.countdownTimerID);
        if (giveawayData?.potUpdater) clearInterval(giveawayData.potUpdater);
        if (sponsorsInterval) {
            clearInterval(sponsorsInterval);
            sponsorsInterval = null;
        }
        if (window.__activeTracker) window.__activeTracker = null;

        if (observer) { observer.disconnect(); observer = null; }

        if (reminderRetryTimeout) { clearTimeout(reminderRetryTimeout); reminderRetryTimeout = null; }

        // ── growing maps / sets ──
        numberEntries.clear();
        numberTakenBy.clear();
        fancyNames.clear();
        userCooldown.clear();
        userCommandLog.clear();
        userLastActionAt.clear();
        userLastCommandAt.clear();
        userSpamStrikes.clear();
        userFeedbackCooldown.clear();
        naughtyWarned.clear();
        liveEnteredThisGiveaway.clear();
        liveSponsorSeenThisGiveaway.clear();
        liveSponsorTotalThisGiveaway.clear();
        _adminCache.clear();


        // reset rigged visuals for next giveaway
        riggedMode = false;
        if (rigBadge) {
            rigBadge.hidden = true;
            rigBadge.classList.remove('rigged-pulse');
        }
        if (giveawayFrame) {
            giveawayFrame.classList.remove('rigged');
        }

        // ── global event listeners ──
        document.removeEventListener("click", handleOutsideClick);

        giveawayData = null;
        window.onbeforeunload = null;

        updateRigToggleUI();
        updateHostPanelUI();
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 7: Chat Observation + Parsing
    // ───────────────────────────────────────────────────────────

    // Micro-batch parsing: coalesce all added nodes within a single MutationObserver callback
    // and parse messages immediately (no frame delay), preserving perceived responsiveness while
    // reducing redundant DOM traversals during chat bursts.
    function parseAddedNodesMicroBatch(mutations) {
        const messages = [];
        const seen = new WeakSet();

        function collect(node) {
            if (!node) return;

            // DocumentFragment
            if (node.nodeType === 11 && node.childNodes) {
                for (const child of node.childNodes) collect(child);
                return;
            }

            // Element only
            if (node.nodeType !== 1) return;

            // Direct message
            if (node.matches && node.matches(CHAT_MESSAGE_SELECTOR)) {
                if (!seen.has(node)) {
                    seen.add(node);
                    messages.push(node);
                }
                return;
            }

            // Container: collect any message descendants
            if (node.querySelectorAll) {
                const descendants = node.querySelectorAll(CHAT_MESSAGE_SELECTOR);
                if (descendants && descendants.length) {
                    for (const msg of descendants) {
                        if (!seen.has(msg)) {
                            seen.add(msg);
                            messages.push(msg);
                        }
                    }
                }
            }
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                collect(node);
            }
        }

        for (const msg of messages) {
            parseMessage(msg);
        }
    }

    function addObserver(giveawayData) {
        observer = new MutationObserver(mutations => {
            const perfStart = PERF ? performance.now() : 0;
            // Micro-batch within the same callback: no rAF delay, still immediate.
            parseAddedNodesMicroBatch(mutations);
            if (PERF) perfMeasure('observer_callback', perfStart);
        });
        startObserver();
    }

    function startObserver() {
        if (!chatMessagesListEl || !chatMessagesListEl.isConnected) {
            chatMessagesListEl = document.querySelector(CHATROOM_MESSAGES_SELECTOR);
        }
        const messageList = chatMessagesListEl;
        if (messageList) {
            observer.observe(messageList, { childList: true });
        }
    }


    // Capture a stable user-tag HTML for the entries table.
    // Some sites render the username via Alpine (x-text/x-show) after the node is inserted,
    // so grabbing userTag.outerHTML too early can produce icon-only markup.
    function escapeHTML(str) {
        try {
            return String(str)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
        } catch {
            return "";
        }
    }

    // Build a user-tag that renders correctly outside of the chatbox CSS context.
    // Using raw userTag.outerHTML can produce "icon-only" output in the entries table
    // because some UNIT3D themes hide username text unless inside .chatbox-message.
    // This function inlines the important styles and always injects the username text.
    function captureFancyNameTag(messageNode, author) {
        try {
            const userTag = messageNode?.querySelector?.("address.user-tag, .user-tag");
            if (!userTag) return "";

            const userLink = userTag.querySelector("a.user-tag__link, a");
            if (!userLink) return "";

            const nameText = sanitizeNick(author || userLink.textContent || "").trim();
            if (!nameText) return "";

            // Preserve group icon / tag background
            const tagStyles = getComputedStyle(userTag);
            const bgImage = tagStyles.backgroundImage;
            const bgRepeat = tagStyles.backgroundRepeat;
            const bgPosition = tagStyles.backgroundPosition;
            const bgSize = tagStyles.backgroundSize;

            let backgroundStyle = "";
            if (bgImage && bgImage !== "none") {
                // bgImage looks like: url("...") — pull out the URL safely
                const m = /url\(["']?(.*?)["']?\)/.exec(bgImage);
                const url = m ? m[1] : "";
                if (url) {
                    backgroundStyle =
                        `background-image: url('${url}'); ` +
                        `background-repeat: ${bgRepeat}; ` +
                        `background-position: ${bgPosition}; ` +
                        `background-size: ${bgSize}; `;
                }
            }

            // Inline link color so it renders in the entries table
            const linkStyles = getComputedStyle(userLink);
            const color = linkStyles.color || "";

            const wrapperStyle = `${backgroundStyle} padding-left: 20px; display: inline-block;`;
            const linkStyle = `${color ? `color: ${color}; ` : ""}font-size: inherit;`;

            // Preserve classes & title for staff detection (isAdmin uses title)
            const extraClasses = Array.from(userLink.classList || []).filter(c => c && c !== "user-tag__link");
            const href = userLink.getAttribute("href") || userLink.href || "#";
            const title = userLink.getAttribute("title") || "";

            const safeTitle = title ? ` title="${escapeHTML(title)}"` : "";
            const safeName = escapeHTML(nameText);

            return `<address class="user-tag" style="${wrapperStyle}">` +
                `<a href="${escapeHTML(href)}"${safeTitle} class="user-tag__link ${extraClasses.join(" ")}" style="${linkStyle}">${safeName}</a>` +
                `</address>`;
        } catch (e) {
            return "";
        }
    }

    function parseMessage(messageNode) {
        const perfStart = PERF ? performance.now() : 0;
        const messageContentElement = Site.getMessageContentElement(messageNode);
        if (!messageContentElement) return; // system/bot messages — skip

        let messageContent = "";
        try {
            messageContent = messageContentElement.textContent?.trim() || "";
        } catch (e) {
            messageContent = "";
        }

        if (!messageContent) return;

        // Fast ignore: we only care about entries (numbers) and commands (!...)
        const isEntry = regNum.test(messageContent);
        const isCommand = messageContent.startsWith("!");
        if (!isEntry && !isCommand) return;

        const author = getAuthor(messageNode);
        if (!author) return; // could not resolve username from DOM — skip silently

        // Pull fancyName only for relevant messages (entries/commands). We capture a stable tag that
        // always includes the username text (some sites hydrate it after insertion).
        const fancyName = captureFancyNameTag(messageNode, author);


        if (isEntry) {
            handleEntryMessage(parseInt(messageContent, 10), author, fancyName, giveawayData);
        } else {
            handleGiveawayCommands(author, messageContent, fancyName, giveawayData);
        }
        if (PERF) perfMeasure('message_parse', perfStart);
    }

    /**
     * Process a chat message received from the API (cross-page support).
     * This allows entries and commands to work even when the chatbox DOM is not visible.
     * @param {Object} apiMsg - The API message object with { id, message, user: { username }, created_at }
     */
    function processApiMessage(apiMsg) {
        if (!apiMsg || !giveawayData) return;

        const msgText = (apiMsg.message || "").trim();
        if (!msgText) return;

        const isEntry = regNum.test(msgText);
        const isCommand = msgText.startsWith("!");
        if (!isEntry && !isCommand) return;

        const author = apiMsg.user?.username || "";
        if (!author) return;

        // API messages don't have styled user-tag HTML, so use plain sanitized name
        const fancyName = "";

        if (isEntry) {
            handleEntryMessage(parseInt(msgText, 10), author, fancyName, giveawayData);
        } else {
            handleGiveawayCommands(author, msgText, fancyName, giveawayData);
        }
    }

    function getAuthor(msgNode) {
        if (!msgNode || msgNode.nodeType !== 1) return "";

        // Most reliable on UNIT3D/Alpine: parse username from the /users/<name> link in the header user tag.
        // (Some sites report offsetParent as null even when spans are visible, so avoid visibility heuristics.)
        const userLink = msgNode.querySelector('address.user-tag a.user-tag__link[href*="/users/"]');
        if (userLink) {
            const href = userLink.getAttribute("href") || "";
            const m = href.match(/\/users\/([^/?#]+)/i);
            if (m && m[1] && m[1].trim() && m[1].trim().toLowerCase() !== "unknown") {
                try { return decodeURIComponent(m[1].trim()); } catch (e) { return m[1].trim(); }
            }
        }

        // Fallback: Alpine text spans (don't rely on offsetParent for visibility).
        const alpineSpan = msgNode.querySelector('.user-tag__link span[x-text], .user-tag__link span[x-show]');
        if (alpineSpan) {
            const t = (alpineSpan.textContent || "").trim();
            if (t && t !== "Unknown") return t;
        }

        // Final fallback: any non-empty span inside the user tag.
        const spans = msgNode.querySelectorAll('.user-tag__link span');
        for (let i = 0; i < spans.length; i++) {
            const t = (spans[i].textContent || "").trim();
            if (t && t !== "Unknown") return t;
        }

        return "";
    }
    // ───────────────────────────────────────────────────────────
    // SECTION 8: Entry Management
    // ───────────────────────────────────────────────────────────
    /**
     * Shared naughty-list gate for entries and commands.
     * Returns true (and warns once per giveaway) if the user is blocked.
     * Host and staff are always allowed through.
     */
    function isNaughtyBlocked(author, fancyName, giveawayData) {
        if (!naughtySet.has(author.toLowerCase())) return false;
        const isHost = giveawayData && author === giveawayData.host;
        if (isHost || isAdmin(fancyName)) return false;

        if (!naughtyWarned.has(author)) {
            sendCommandResponse(author,
                                `[color=#d85e27]${sanitizeNick(author)}[/color], ` +
                                `you are on the [b]naughty list[/b] and may not ` +
                                `enter the giveaway or use its commands.`
                               );
            naughtyWarned.add(author);
        }
        return true;
    }

    function handleEntryMessage(number, author, fancyName, giveawayData) {
        // Safety: no active giveaway
        if (!giveawayData) return;

        // Silently ignore ultra-fast entries right after the giveaway starts.
        // This filters out auto-join scripts without punishing or warning anyone.
        if (isWithinEntryIgnoreWindow()) {
            return;
        }

        if (isNaughtyBlocked(author, fancyName, giveawayData)) return;

        // ── Spam detection: treat number entries like commands ──
        // (shares the same window + cooldown as !time / !free / etc.)
        if (applyCooldown(author, { command: "entry" })) {
            // User is in cooldown or just got locked out; ignore this entry
            return;
        }

        // sanitize the raw author names to avoid IRC pings
        const safeAuthor = sanitizeNick(author);

        // Precompute suggestion text for any duplicate cases
        const suggestion = formatFreeNumberSuggestion(giveawayData);


        // Fast duplicate checks (O(1)) using Maps instead of scanning all entries
        const existing = numberEntries.get(author);
        if (existing !== undefined) {
            const repeatMessage =
                  `Sorry [color=#d85e27]${safeAuthor}[/color], but [color=#32cd53]you[/color] already entered with number [color=#DC3D1D][b]${existing}[/b][/color]!`;
            if (canSendUserFeedback(author, "entry-repeat")) sendCommandResponse(author, repeatMessage);
            return;
        }

        const otherAuthor = numberTakenBy.get(number);
        if (otherAuthor && otherAuthor !== author) {
            const safeOther = sanitizeNick(otherAuthor);
            const repeatMessage =
                  `🚫 Sorry [color=#d85e27]${safeAuthor}[/color], but [color=#32cd53]${safeOther}[/color] already entered with number [color=#DC3D1D][b]${number}[/b][/color]!` +
                  suggestion;
            if (canSendUserFeedback(author, "entry-repeat")) sendCommandResponse(author, repeatMessage);
            return;
        }

        if (number < giveawayData.startNum || number > giveawayData.endNum) {
            const outOfBoundsMessage =
                  `🚫 Sorry [color=#d85e27]${safeAuthor}[/color], but the number [color=#DC3D1D][b]${number}[/b][/color] is outside of the given range! Enter a number between [color=#DC3D1D][b]${giveawayData.startNum}[/b] and [b]${giveawayData.endNum}[/b][/color]!`;
            if (canSendUserFeedback(author, "entry-range")) sendCommandResponse(author, outOfBoundsMessage);
            return;
        }

        if (!numberEntries.has(author)) {
            // when you actually add them, you still store the real author internally
            addNewEntry(author, fancyName, number);
        }

        if (!GENERAL_SETTINGS.suppress_entry_replies) {
            const timeLeftStr = parseTime(giveawayData.timeLeft * 1000);
            const rigHint = rigNote("(entry logged under [b]highly suspicious[/b] conditions) 😈");

            const msg =
                  `[color=#d85e27]${safeAuthor}[/color] has entered with ` +
                  `the number [color=#DC3D1D][b]${number}[/b][/color]! ` +
                  `Time remaining: [b][color=#1DDC5D]${timeLeftStr}[/color][/b].` +
                  rigHint;
            sendCommandResponse(author, msg);
        }
    }


    function addNewEntry(author, fancyName, number) {
        const existingForNumber = numberTakenBy.get(number);
        selfCheck(
            existingForNumber === undefined || existingForNumber === author,
            "entry index conflict before insert",
            { author, number, existingForNumber }
        );

        numberEntries.set(author, number);
        numberTakenBy.set(number, author);

        // Store the fancy tag captured from the triggering message (entry or command).
        // If missing (e.g., IRC bridge), we fall back to a plain sanitized name in the table.
        fancyNames.set(author, fancyName || "");

        recordLiveEntry(author); // ✅ live stats update

        selfCheck(numberEntries.get(author) === number, "author->number map mismatch after insert", {
            author,
            expectedNumber: number,
            storedNumber: numberEntries.get(author)
        });
        selfCheck(numberTakenBy.get(number) === author, "number->author map mismatch after insert", {
            author,
            number,
            mappedAuthor: numberTakenBy.get(number)
        });

        // Fast-path: update just this user's row (no full rebuild, no chat re-scan)
        upsertEntryRow(author);
        snapshotGiveaway();
    }

    function getEntryRowKey(author) {
        return encodeURIComponent(String(author || "").toLowerCase());
    }

    function getFancyNameHTML(author) {
        let html = fancyNames.get(author) || "";
        if (!html) return sanitizeNick(author);

        // Guard: if the markup is icon-only / empty text, show a safe plain name.
        const plain = String(html).replace(/<[^>]*>/g, "").trim();
        if (!plain) return sanitizeNick(author);

        return html;
    }

    function isEntriesTableBasicMode(table) {
        const row = table.querySelector("thead tr");
        return !!(row && row.children && row.children.length === 2);
    }

    function getEntriesTable() {
        if (!entriesTableEl || !entriesTableEl.isConnected) {
            entriesTableEl = document.getElementById('entriesTable');
        }
        return entriesTableEl;
    }

    function clearEntryRowCache() {
        entriesTbodyEl = null;
        entryRowByKey.clear();
    }

    function getEntriesTbody(table) {
        if (!table) return null;
        if (!entriesTbodyEl || !entriesTbodyEl.isConnected || entriesTbodyEl.parentElement !== table) {
            entriesTbodyEl = table.querySelector('tbody');
            if (!entriesTbodyEl) {
                entriesTbodyEl = document.createElement('tbody');
                table.appendChild(entriesTbodyEl);
            }
            entryRowByKey.clear();
        }
        return entriesTbodyEl;
    }

    function upsertEntryRow(author) {
        const perfStart = PERF ? performance.now() : 0;
        const table = getEntriesTable();
        if (!table) return;

        // Don't touch the table while it's in winners/status mode (4 columns)
        if (!isEntriesTableBasicMode(table)) return;

        const tbody = getEntriesTbody(table);
        if (!tbody) return;

        const key = getEntryRowKey(author);
        const esc = (window.CSS && CSS.escape) ? CSS.escape(key) : key;

        let row = entryRowByKey.get(key);
        if (!row || !row.isConnected) {
            row = tbody.querySelector(`tr[data-entry-key="${esc}"]`);
        }
        if (!row) {
            row = document.createElement("tr");
            row.setAttribute("data-entry-key", key);

            const tdUser = document.createElement("td");
            const tdEntry = document.createElement("td");
            row.appendChild(tdUser);
            row.appendChild(tdEntry);

            tbody.appendChild(row);
        }
        entryRowByKey.set(key, row);

        const cells = row.children;
        if (cells && cells.length >= 2) {
            cells[0].innerHTML = getFancyNameHTML(author);

            const entry = numberEntries.get(author);
            cells[1].textContent = (entry === undefined || entry === null) ? "" : String(entry);
        }
        updateHostPanelUI();
        if (PERF) perfMeasure('ui_render_upsert_entry', perfStart);
    }

    function updateEntries() {
        const perfStart = PERF ? performance.now() : 0;
        const table = getEntriesTable();
        if (!table) return;

        // Only rebuild in 2-column mode; winners UI manages its own rows/cells.
        if (!isEntriesTableBasicMode(table)) return;

        const tbody = getEntriesTbody(table);
        if (!tbody) return;

        clearEntryRowCache();
        entriesTbodyEl = tbody;

        // Clear body efficiently
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        const frag = document.createDocumentFragment();
        numberEntries.forEach((entry, author) => {
            const row = document.createElement("tr");
            row.setAttribute("data-entry-key", getEntryRowKey(author));

            const tdUser = document.createElement("td");
            tdUser.innerHTML = getFancyNameHTML(author);

            const tdEntry = document.createElement("td");
            tdEntry.textContent = String(entry);

            row.appendChild(tdUser);
            row.appendChild(tdEntry);
            frag.appendChild(row);
            entryRowByKey.set(getEntryRowKey(author), row);
        });

        tbody.appendChild(frag);
        updateHostPanelUI();
        if (PERF) perfMeasure('ui_render_update_entries', perfStart);
    }


    // ───────────────────────────────────────────────────────────
    // SECTION 9: Sponsorhip Polling and Parsing
    // ───────────────────────────────────────────────────────────

    // Parse a BON gift chat message into { gifter, recipient, amount }
    function parseGiftMessage(html) {
        if (!html || !html.includes('has gifted')) return {};
        const perfStart = PERF ? performance.now() : 0;
        const doc = giftDOMParser.parseFromString(html, "text/html");
        const links = doc.querySelectorAll('a');
        const firstLink = links[0] || null;
        const secondLink = links[1] || null;
        const text = doc.body.textContent || "";
        const m = text.match(GIFT_AMOUNT_RE);

        const parsed = m && firstLink && secondLink
        ? {
            gifter: firstLink.textContent.trim(),
            recipient: secondLink.textContent.trim(),
            amount: parseFloat(m[1])
        }
        : {};

        if (PERF) perfMeasure('message_parse_gift_html', perfStart);
        return parsed;
    }

    class SponsorTracker {
        /** @param {{chatroomId:string, giveawayStartTime:Date, giveawayData:Object}} opts */
        constructor({ chatroomId, giveawayStartTime, giveawayData }) {
            this.chatroomId = chatroomId;
            this.giveawayStartTs = giveawayStartTime.getTime();
            this.data = giveawayData;

            this.lastMsgId = 0; // API cursor
            this.processedIds = new Set(); // de-dupe
            this.buffer = []; // gifts waiting to be announced
            this.sponsorWindowStartAt = 0; // digest window start (ms)
            this.sponsorSet = new Set(Array.isArray(giveawayData.sponsors) ? giveawayData.sponsors : []);
        }

        /* ---- poll for any chat messages since last cursor ---- */
        async fetchNew() {
            const url = new URL(`/api/chat/messages/${this.chatroomId}`, location.origin);
            if (this.lastMsgId) url.searchParams.set("after_id", this.lastMsgId);

            const res = await fetchWithTimeout(url, { credentials: "include" }, 7000);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            return (await res.json()).data;
        }

        /* ---- called by the timer ---- */
        async poll() {
            const perfStart = PERF ? performance.now() : 0;
            let messages;
            try {
                messages = await this.fetchNew();
            } catch (e) {
                if (DEBUG_SETTINGS.log_chat_messages) console.error("Sponsor API error:", e);
                return;
            }

            const gifts = [];
            const chatEntries = [];

            for (const m of messages) {
                if (this.processedIds.has(m.id)) continue;
                if (processedApiMessageIds.has(m.id)) continue;
                if (Date.parse(m.created_at) <= this.giveawayStartTs) continue;

                this.processedIds.add(m.id);
                processedApiMessageIds.add(m.id);

                const msgText = m.message || "";
                const isSystemBot = !!m.bot?.is_systembot;

                // Gift messages from system bot
                if (isSystemBot && msgText.includes("has gifted")) {
                    gifts.push(m);
                    continue;
                }

                // Regular user messages — process as entries/commands
                if (!isSystemBot && m.user && msgText) {
                    chatEntries.push(m);
                }
            }

            // advance cursor for all messages
            for (const m of messages) {
                if (m.id > this.lastMsgId) this.lastMsgId = m.id;
            }

            // Process gift sponsorships
            for (const msg of gifts) {
                const { gifter, recipient, amount } = this.parseGiftMsg(msg.message);
                if (!gifter || recipient !== this.data.host) continue;
                this.buffer.push({ gifter, amount });
                this.applyGift(gifter, amount);
            }

            // Process entries and commands from API (cross-page support)
            for (const msg of chatEntries) {
                processApiMessage(msg);
            }

            if (this.buffer.length) this.maybeFlush();
            if (PERF) perfMeasure('sponsor_poll', perfStart);
        }

        /* ---- pull gifter / recipient / amount from the HTML blob ---- */
        parseGiftMsg(html) {
            return parseGiftMessage(html);
        }

        /* ---- update pot + per-sponsor running totals ---- */
        applyGift(gifter, amount) {
            this.data.amount += amount;
            this.data.sponsorContribs[gifter] =
                (this.data.sponsorContribs[gifter] || 0) + amount;
            recomputeEffectiveWinners(this.data);
            flashPotTotalUI();

            const totalSponsoredNow = sumSponsorContribs(this.data.sponsorContribs, this.data.host);
            logEvent("Sponsorship recorded", `${sanitizeNick(gifter)} added ${fmtBON(amount)} BON | Total sponsored=${fmtBON(totalSponsoredNow)} BON`);

            if (!this.sponsorSet.has(gifter)) {
                this.sponsorSet.add(gifter);
                this.data.sponsors.push(gifter);
            }

            recordLiveSponsorGift(gifter, amount); // ✅ live sponsor stats update
            snapshotGiveaway();
        }

        announceWinnerScalingIfNeeded() {
            const data = this.data;
            if (!data || data !== giveawayData || !data.scaleWinnersWithSponsors) return;
            if (!(Number(data.timeLeft) > 0)) return;

            const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(data.baseWinnersAtStart || data.winnersNum) || 1)));
            const newWinners = recomputeEffectiveWinners(data);
            const oldWinners = Math.max(1, Math.floor(Number(data.lastAnnouncedWinners ?? baseWinners) || baseWinners));

            if (newWinners <= oldWinners) return;

            const delta = newWinners - oldWinners;
            const cap = Math.min(
                Math.max(baseWinners, Math.min(Math.floor(Number(data.hostMaxScaledWinners) || baseWinners), MAX_WINNERS)),
                MAX_WINNERS
            );
            const totalContribForScaling = getTotalContribForScaling(data);
            const threshold = getScalingBonPerWinner(data);

            let message =
                `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]Winners increased[/b]: ${oldWinners} → ${newWinners} (+${delta}). ` +
                `Total scaling contributions: ${fmtBON(totalContribForScaling)} BON. ` +
                `Threshold: ${fmtBON(threshold)} BON/winner.`;

            const reachedCap = newWinners >= cap;
            if (reachedCap) {
                message += ` [b]Max winners reached[/b] (${cap}).`;
            }

            logEvent("Scaled winners increased", `${oldWinners} -> ${newWinners} (+${delta})${reachedCap ? ` | cap reached=${fmtBON(cap)}` : ""}`);
            sendMessage(message);
            flashWinnersUI();
            data.lastAnnouncedWinners = newWinners;
        }


        /* ---- decide when to announce buffered sponsor gifts ---- */
        maybeFlush(force = false) {
            if (!this.buffer.length) return;

            // In off mode, don't clutter chat at all (still counts + updates pot)
            if (SPONSOR_ANNOUNCE.mode === "off") {
                this.announceWinnerScalingIfNeeded();
                this.buffer.length = 0;
                this.sponsorWindowStartAt = 0;
                return;
            }

            const now = Date.now();

            // Start (or restart) the digest window when the first pending gift arrives
            if (!this.sponsorWindowStartAt) this.sponsorWindowStartAt = now;

            // Old behavior: announce immediately whenever new gifts arrive
            if (SPONSOR_ANNOUNCE.mode === "immediate") {
                this.flushBuffer(now);
                return;
            }

            const deltaTotalNum = this.buffer.reduce((s, g) => s + (Number(g.amount) || 0), 0);
            const hasBigSingle = this.buffer.some(g => (Number(g.amount) || 0) >= SPONSOR_ANNOUNCE.immediate_single_min);
            const tooManyEvents = this.buffer.length >= SPONSOR_ANNOUNCE.max_pending_events;
            const hitMinTotal = deltaTotalNum >= SPONSOR_ANNOUNCE.flush_min_total;
            const hitTime = (now - this.sponsorWindowStartAt) >= SPONSOR_ANNOUNCE.digest_ms;

            if (force || hasBigSingle || tooManyEvents || hitMinTotal || hitTime) {
                this.flushBuffer(now);
            }
        }

        /* ---- build a single chat line & clear buffer ---- */
        flushBuffer(nowTs = Date.now(), options = {}) {
            const announce = !(options && options.announce === false);
            if (!this.buffer.length) return;

            const grouped = this.buffer.reduce((acc, { gifter, amount }) => {
                acc[gifter] = (acc[gifter] || 0) + (Number(amount) || 0);
                return acc;
            }, {});

            const entries = Object.entries(grouped)
            .map(([name, amt]) => ({ name, amt: Number(amt) || 0 }))
            .filter(e => e.name && e.amt > 0)
            .sort((a, b) => b.amt - a.amt);

            const sponsorCount = entries.length;
            const deltaTotalNum = entries.reduce((s, e) => s + e.amt, 0);

            if (!sponsorCount || !deltaTotalNum) {
                this.buffer.length = 0;
                this.sponsorWindowStartAt = 0;
                return;
            }

            const deltaTotal = fmtBON(deltaTotalNum);
            const potTotal = fmtBON(cleanPotString(this.data.amount));

            // Keep the line short: show only the biggest contributors in this digest
            const topN = Math.max(0, Number(SPONSOR_ANNOUNCE.show_top_n) || 0);
            const minPerUser = Math.max(0, Number(SPONSOR_ANNOUNCE.show_min_per_user) || 0);

            const shown = [];
            let shownSum = 0;

            for (const e of entries) {
                if (shown.length >= topN) break;

                // In multi-sponsor bursts, omit tiny sponsors from the name list (still included in totals)
                if (sponsorCount > 1 && e.amt < minPerUser) continue;

                shown.push(e);
                shownSum += e.amt;
            }

            const parts = shown.map(e =>
                                    `[color=#1DDC5D][b]${e.name}[/b][/color] ` +
                                    `([color=#DC3D1D][b]${fmtBON(e.amt)}[/b][/color])`
                                   );

            const othersCount = Math.max(0, sponsorCount - shown.length);

            let msg =
                `✨ Sponsors just added [color=#DC3D1D][b]${deltaTotal} BON[/b][/color] ` +
                `from [b]${sponsorCount} sponsor${sponsorCount === 1 ? "" : "s"}[/b]! `;

            if (parts.length) {
                msg += parts.join(", ");
                if (othersCount > 0) msg += `, [i]+${othersCount} more[/i]`;
                msg += " ";
            }

            msg += `Total pot is now [b][color=#ffc00a]${potTotal} BON[/color][/b]`;

            const nextWinnerLine = getSponsorshipNextWinnerLine(this.data);
            if (nextWinnerLine) msg += ` ${nextWinnerLine}`;

            if (announce) {
                sendMessage(msg);
                flashPotTotalUI();
                this.announceWinnerScalingIfNeeded();
            }
            this.buffer.length = 0; // clear the batch/digest
            this.sponsorWindowStartAt = 0; // reset digest window
        }
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 10: Command Handling
    // ───────────────────────────────────────────────────────────
    function handleGiveawayCommands(author, messageContent, fancyName, giveawayData) {
        // Fast-exit when it’s not a command
        if (!messageContent.startsWith("!")) return;

        // Parse command + args first
        const args = messageContent.slice(1).trim().split(/\s+/);
        const command = (args.shift() || "").toLowerCase();

        // Early-ignore window for *entry* commands right after giveaway starts.
        // This ensures auto-join scripts are dropped before naughty/cooldown logic.
        const isEntryCommand =
              command === "random" || command === "luckye"; // add more here later if you introduce other entry commands

        if (isEntryCommand && isWithinEntryIgnoreWindow()) {
            return;
        }

        if (isNaughtyBlocked(author, fancyName, giveawayData)) return;

        if (!validCommands.has(command)) return; // Unsupported

        if (applyCooldown(author, { command })) return; // Spammer – ignored

        executeCommand({
            name: command,
            args,
            author,
            fancyName,
            giveawayData,
            source: "chat",
            reply: (msg) => sendCommandResponse(author, msg)
        });
    }

    function executeCommand({ name, args = [], author = "", fancyName = "", giveawayData: dataOverride, reply, source = "chat" } = {}) {
        const data = dataOverride || giveawayData || null;
        const resolvedAuthor = author || getLoggedInUsername() || (data ? data.host : "") || "";
        const resolvedFancyName = fancyName || "";
        const replyFn = typeof reply === "function"
        ? reply
        : (msg) => sendCommandResponse(resolvedAuthor, msg);

        const handler = COMMAND_HANDLERS[name];
        if (!handler) return;

        const maybePromise = handler({
            author: resolvedAuthor,
            fancyName: resolvedFancyName,
            args,
            giveawayData: data,
            reply: replyFn,
            say: (msg) => sendMessage(msg),
            pm: (to, msg) => sendPrivateMessage(to, msg),
            source,
            safeAuthor: sanitizeNick(resolvedAuthor),
            safeHost: sanitizeNick(data ? data.host : "")
        });

        if (maybePromise && typeof maybePromise.then === "function") {
            maybePromise.catch(err => console.error("Giveaway command handler error:", err));
        }
    }



    /**
     * Throttle per-user feedback messages (duplicate entry / out-of-range / spam lockout notices)
     * to avoid the script spamming chat with repeated error responses.
     *
     * @param {string} author
     * @param {string} bucket - feedback category key, e.g. "entry-repeat", "entry-range", "spam-lockout"
     * @param {number} cooldownMs - override cooldown in ms (default ENTRY_FEEDBACK_COOLDOWN_MS)
     * @returns {boolean} true if feedback may be sent now
     */
    function canSendUserFeedback(author, bucket, cooldownMs = ENTRY_FEEDBACK_COOLDOWN_MS) {
        const now = Date.now();
        const authorKey = String(author || "").toLowerCase();
        if (!authorKey) return true;

        const b = String(bucket || "default");
        const key = `${authorKey}::${b}`;
        const last = userFeedbackCooldown.get(key) || 0;

        if (now - last < cooldownMs) return false;

        userFeedbackCooldown.set(key, now);
        return true;
    }

    /** Rate‑limit users – returns `true` when the caller must be ignored. */
    function applyCooldown(author, opts = {}) {
        const now = Date.now();
        const rawAuthor = String(author || "");
        const authorKey = rawAuthor.toLowerCase();
        if (!authorKey) return false;

        const lockoutExpires = userCooldown.get(authorKey) || 0;
        if (now < lockoutExpires) return true;

        // Track this trigger in the rolling window (we count triggers even if we suppress output)
        const log = (userCommandLog.get(authorKey) || []).filter(ts => now - ts < COMMAND_WINDOW_MS);
        log.push(now);
        userCommandLog.set(authorKey, log);
        selfCheck(log.length >= 1, "command log should contain at least the current trigger", {
            author: rawAuthor,
            logLength: log.length
        });

        // Block ultra-fast repeats (bots / accidental double-send)
        const lastAny = userLastActionAt.get(authorKey) || 0;
        const tooFast = (now - lastAny) < MIN_ACTION_GAP_MS;
        userLastActionAt.set(authorKey, now);

        // Per-command cooldown (prevents identical output spam)
        let repeatBlocked = false;
        const cmd = (opts && typeof opts === "object" && opts.command != null)
        ? String(opts.command).trim().toLowerCase()
        : "";

        if (cmd) {
            const cd = Number(REPEAT_COMMAND_COOLDOWNS_MS[cmd]) || 0;
            if (cd > 0) {
                const k = `${authorKey}::${cmd}`;
                const lastCmd = userLastCommandAt.get(k) || 0;
                repeatBlocked = (now - lastCmd) < cd;
                userLastCommandAt.set(k, now);
            }
        }

        // Hard limit in the rolling window → lockout (with escalating penalties for repeat offenders)
        if (log.length > MAX_COMMANDS_PER_WINDOW) {
            const excess = log.length - MAX_COMMANDS_PER_WINDOW;

            const prev = userSpamStrikes.get(authorKey) || { count: 0, lastAt: 0 };
            if (now - (prev.lastAt || 0) < STRIKE_WINDOW_MS) {
                prev.count = (prev.count || 0) + 1;
            } else {
                prev.count = 1;
            }
            prev.lastAt = now;
            userSpamStrikes.set(authorKey, prev);

            const multiplier = Math.min(MAX_STRIKE_MULTIPLIER, Math.pow(2, Math.max(0, (prev.count || 1) - 1)));
            const penaltySec = Math.max(1, Math.round(BASE_PENALTY_SECONDS * excess * multiplier));

            userCooldown.set(authorKey, now + penaltySec * 1000);
            userCommandLog.delete(authorKey);

            if (canSendUserFeedback(rawAuthor, "spam-lockout", 60_000)) {
                sendCommandResponse(rawAuthor, `[color=red][b]Spamming detected! ${sanitizeNick(rawAuthor)} locked out for ${penaltySec} seconds.[/b][/color]`);
            }
            return true;
        }

        // If we didn't lock them out, we may still suppress output for too-fast / repeat cases
        return tooFast || repeatBlocked;
    }

    const _adminCache = new Map(); // fancyName HTML → boolean (cleared per giveaway in stopGiveaway)

    function isAdmin(fancyName) {
        if (!fancyName) return false;
        const cached = _adminCache.get(fancyName);
        if (cached !== undefined) return cached;

        let result = false;
        try {
            const div = document.createElement('div');
            div.innerHTML = fancyName;
            const a = div.querySelector('a.user-tag__link');
            if (a) {
                const title = a.getAttribute('title')?.toLowerCase() || '';
                result = title.includes('leader') || title.includes('onlyguardians') || title.includes('administrator') || title.includes('admin') || title.includes('moderator') || title.includes('mod') || title.includes('developer') || title.includes('operator');
            }
        } catch {
            result = false;
        }
        _adminCache.set(fancyName, result);
        return result;
    }

    /** Factory for leaderboard commands — eliminates boilerplate across top/most/sponsors/unlucky. */
    function makeLeaderboardCommand({ emoji, label, emptyMsg, sort, filter, format }) {
        return function leaderboardHandler(ctx) {
            const { reply } = ctx;
            const n = Math.min(STATS_MAX_TOP_N, Math.max(1, parseInt(ctx.args[0] || STATS_DEFAULT_TOP_N, 10) || STATS_DEFAULT_TOP_N));
            const rows = getLeaderboardRows(sort, n, filter);
            if (!rows.length) {
                reply(emptyMsg);
                return;
            }
            const out = rows.map((u, i) => format(u, i, ctx));
            reply(`[b]${emoji} ${label}: ${out.join(" | ")}[/b]`);
        };
    }

    Object.assign(COMMAND_HANDLERS, {
        /* Public commands */
        time(ctx) {
            const { args, author, fancyName, giveawayData, reply } = ctx;

            const addMinutes = hostAdjustTime(+1);
            const removeMinutes = hostAdjustTime(-1);

            // no args  → show countdown
            if (args.length === 0) {
                reply(
                    `Time left: [b][color=#1DDC5D]${parseTime(
                        giveawayData.timeLeft * 1000
                    )}[/color][/b] ⏳`
                );
                return;
            }

            const action = (args[0] || "").toLowerCase(); // "add" / "remove"
            const minutes = parseFloat(args[1]);
            const isPriv = author === giveawayData.host || isAdmin(fancyName);

            if (!isPriv) return; // silently ignore non-host/non-admin

            if (action !== "add" && action !== "remove") {
                reply("[color=red]Usage:[/color] !time add|remove <minutes>");
                return;
            }

            if (isNaN(minutes) || minutes <= 0) {
                reply("[color=red]Usage:[/color] !time add|remove <minutes>");
                return;
            }

            // Pass only the minutes to the shared adjuster
            const ctxWithArg = { ...ctx, args: [String(minutes)] };

            if (action === "add") {
                addMinutes(ctxWithArg);
            } else {
                removeMinutes(ctxWithArg);
            }
        },

        entries({ giveawayData , reply}) {
            const taken = numberEntries.size;
            const total = giveawayData.totalEntries;
            const free = total - taken;

            if (taken === 0) {
                reply(`[b]No entries yet! ${total} numbers available.[/b]`);
                return;
            }

            // Sort by entry number (ascending)
            const list = Array.from(numberEntries.entries())
            .sort(([, numA], [, numB]) => numA - numB)
            .map(([user, num]) =>
                 `[color=#d85e27][b]${sanitizeNick(user)}[/b][/color]: [b]${num}[/b]`
                );

            reply(
                `📋 Entries – ${taken}/${total} ` +
                `[b]([color=#1DDC5D]${free} free[/color][/b]): ${list.join(", ")}`
            );
        },

        help: showHelp,
        commands: showHelp,

        stats(ctx) {
            const { reply } = ctx;
            const target = (ctx.args[0] || ctx.author || "").trim();
            const stats = getStatsCached();
            const key = normUserKey(target);
            const rec = key && stats.users ? stats.users[key] : null;

            if (!rec) {
                reply(`[b]No saved stats yet for ${safeNameForChat(target)}.[/b]`);
                return;
            }

            const enteredAll = rec.entered || 0;
            const wins = rec.wins || 0;
            const losses = rec.losses || 0;

            // Winrate should be based on completed giveaways only.
            let enteredForWr = enteredAll;
            if (ctx.giveawayData && liveEnteredThisGiveaway.has(key)) {
                enteredForWr = Math.max(0, enteredAll - 1);
            }
            const wr = enteredForWr ? ((wins / enteredForWr) * 100).toFixed(1) : "0.0";

            // If the giveaway host calls !stats (for themselves), also show how much they've given away (host pot only; excludes sponsors).
            const isHostCaller = !!(ctx.giveawayData && normUserKey(ctx.author) === normUserKey(ctx.giveawayData.host));
            const isSelfQuery = !ctx.args[0] || normUserKey(target) === normUserKey(ctx.author);

            const parts = [
                `Entered [color=#ffc00a]${fmtBON(enteredAll)}[/color]`,
                `Wins [color=#1DDC5D]${fmtBON(wins)}[/color]`,
                `Losses [color=#CE2E30]${fmtBON(losses)}[/color]`,
                `WR [color=#1DDC5D]${wr}%[/color]`
            ];

            if (rec.totalWon) parts.push(`Won [color=#ffc00a]${fmtBON(rec.totalWon)} BON[/color]`);
            if (rec.biggestWin) parts.push(`Best [color=#ffc00a]${fmtBON(rec.biggestWin)} BON[/color]`);
            if (rec.sponsoredTotal) parts.push(`Sponsored [color=#00abff]${fmtBON(rec.sponsoredTotal)} BON[/color]`);
            if (rec.hosted) parts.push(`Hosted ${fmtBON(rec.hosted)}`);

            if (isHostCaller && isSelfQuery) {
                parts.push(`Given [color=#ffc00a]${fmtBON(rec.hostedTotal || 0)} BON[/color]`);
                parts.push(`Sponsors received [color=#00abff]${fmtBON(rec.sponsorReceivedTotal || 0)} BON[/color]`);
                const thisSponsor = sumSponsorContribs(ctx.giveawayData?.sponsorContribs, ctx.giveawayData?.host);
                if (thisSponsor > 0) {
                    parts.push(`Current sponsors [color=#00abff]${fmtBON(thisSponsor)} BON[/color]`);
                }
            }

            reply(`[b]📊 Stats: [color=#d85e27]${safeNameForChat(rec.name || target)}[/color] - ${parts.join(" • ")}[/b]`);
        },

        // Leaderboards — table-driven to reduce repetition
        top:      makeLeaderboardCommand({
            emoji: "🏆", label: "Top winners", emptyMsg: "[b]No winner stats saved yet.[/b]",
            sort:   (a, b) => (b.wins - a.wins) || (b.totalWon - a.totalWon) || (b.entered - a.entered),
            filter: u => (u.wins || 0) > 0,
            format: (u, i) =>
                `${i + 1}) [color=#d85e27]${safeNameForChat(u.name)}[/color] - ` +
                `[color=#1DDC5D]${fmtBON(u.wins)}W[/color] • ` +
                `[color=#ffc00a]${fmtBON(u.totalWon)} BON[/color]`
        }),

        most:     makeLeaderboardCommand({
            emoji: "💰", label: "Most BON won", emptyMsg: "[b]No winner stats saved yet.[/b]",
            sort:   (a, b) => (b.totalWon - a.totalWon) || (b.wins - a.wins) || (b.entered - a.entered),
            filter: u => (u.totalWon || 0) > 0,
            format: (u, i) =>
                `${i + 1}) [color=#d85e27]${safeNameForChat(u.name)}[/color] - ` +
                `[color=#ffc00a]${fmtBON(u.totalWon)} BON[/color] • ` +
                `[color=#1DDC5D]${fmtBON(u.wins)}W[/color]`
        }),

        sponsors: makeLeaderboardCommand({
            emoji: "💸", label: "Top all-time sponsors", emptyMsg: "[b]No sponsor stats saved yet.[/b]",
            sort:   (a, b) => (b.sponsoredTotal - a.sponsoredTotal) || (b.sponsorCount - a.sponsorCount),
            filter: u => (u.sponsoredTotal || 0) > 0,
            format: (u, i) =>
                `${i + 1}) [color=#d85e27]${safeNameForChat(u.name)}[/color] - ` +
                `[color=#ffc00a]${fmtBON(u.sponsoredTotal)} BON[/color] • ` +
                `[color=#1DDC5D]${fmtBON(u.sponsorCount)}x[/color]`
        }),

        unlucky:  makeLeaderboardCommand({
            emoji: "😵", label: "Unlucky", emptyMsg: "[b]No unlucky stats saved yet.[/b]",
            sort:   (a, b) => (b.losses - a.losses) || (b.entered - a.entered) || (a.wins - b.wins),
            filter: u => (u.losses || 0) > 0,
            format: (u, i, ctx) => {
                const key = normUserKey(u.name);
                let entered = u.entered || 0;
                const wins = u.wins || 0;
                const losses = u.losses || 0;

                // Winrate should be based on completed giveaways only.
                if (ctx.giveawayData && key && liveEnteredThisGiveaway.has(key)) {
                    entered = Math.max(0, entered - 1);
                }

                const wr = entered ? ((wins / entered) * 100).toFixed(1) : "0.0";

                return `${i + 1}) [color=#d85e27]${safeNameForChat(u.name)}[/color] - ` +
                    `[color=#CE2E30]${fmtBON(losses)} L[/color] ` +
                    `/ [color=#ffc00a]${fmtBON(entered)} entered[/color] ` +
                    `• [color=#1DDC5D]WR ${wr}%[/color]`;
            }
        }),


        largest(ctx) {
            const { reply } = ctx;
            const n = Math.min(STATS_MAX_TOP_N, Math.max(1, parseInt(ctx.args[0] || STATS_DEFAULT_TOP_N, 10) || STATS_DEFAULT_TOP_N));
            const stats = getStatsForRead();
            const all = Array.isArray(stats.giveaways) ? stats.giveaways.slice() : [];

            if (!all.length) {
                reply("[b]No giveaway history saved yet.[/b]");
                return;
            }

            const getAmt = (g) => (typeof g === "number" ? g : (g && typeof g === "object" ? Number(g.amount) : 0)) || 0;
            const getEndedAt = (g) => (g && typeof g === "object" ? Number(g.endedAt) : 0) || 0;
            const getEndedDate = (g) => (g && typeof g === "object" && g.endedDate) ? String(g.endedDate) : "";
            const fmtEndedDate = (g) => {
                const d = getEndedDate(g);
                if (d) return d;
                const t = getEndedAt(g);
                if (t) {
                    try { return new Date(t).toLocaleDateString("en-CA"); } catch (e) { /* ignore */ }
                }
                return "unknown date";
            };


            const top = all
            .filter(g => getAmt(g) > 0)
            .sort((a, b) => (getAmt(b) - getAmt(a)) || (getEndedAt(b) - getEndedAt(a)))
            .slice(0, n);

            if (!top.length) {
                reply("[b]No giveaway history saved yet.[/b]");
                return;
            }

            const out = top.map((g, i) => {
                const amt = fmtBON(getAmt(g));
                const d = fmtEndedDate(g);
                return `${i + 1}) [color=#ffc00a]${amt} BON[/color] [color=#9aa0a6](${d})[/color]`;
            });

            reply(`[b]📈 Largest giveaways: ${out.join(" | ")}[/b]`);

        },

        gift({ giveawayData, reply }) {
            const giftHost = getGiftSyntaxHostName();
            reply(`To send a gift type: /gift ${giftHost} amount message`);
        },

        bon({ giveawayData , reply}) {
            const rigTag = rigNote("(pot size [b]carefully curated[/b] by our rigging department)");
            reply(
                `Giveaway Amount: [b][color=#FFB700]${fmtBON(giveawayData.amount)}[/color][/b]` +
                rigTag
            );
        },

        range({ giveawayData , reply}) {
            const rigTag = rigNote("(this range has been [b]pre-approved[/b] for maximum riggability)");
            reply(
                `Numbers between [color=#DC3D1D]${giveawayData.startNum} and ${giveawayData.endNum}[/color] inclusive are valid.` +
                rigTag
            );
        },

        lucky({ safeAuthor, giveawayData , reply}) {
            // Safety: no active giveaway
            if (!giveawayData) {
                reply("There is no active giveaway right now.");
                return;
            }

            if (GENERAL_SETTINGS.disable_lucky) {
                reply(
                    `🚫 Sorry [color=#d85e27]${safeAuthor}[/color], ` +
                    `[color=#999999]!lucky[/color] has been disabled for this giveaway.`
                );
                return;
            }

            const luckyNum = getLuckyNumber(giveawayData);
            if (luckyNum === null || luckyNum === undefined) {
                reply("All numbers are taken — no free numbers left!");
                return;
            }
            const rigHint = rigNote("(approved by the Official Rigging Committee™) ✅");

            reply(
                `The current giveaway lucky number is: ` +
                `[b][color=#1DDC5D]${luckyNum}[/color][/b].` +
                rigHint
            );
        },

        luckye(ctx) {
            const { author, safeAuthor, fancyName, giveawayData, reply } = ctx;

            // Safety: no active giveaway
            if (!giveawayData) {
                reply("There is no active giveaway right now.");
                return;
            }

            if (GENERAL_SETTINGS.disable_lucky) {
                reply(
                    `🚫 Sorry [color=#d85e27]${safeAuthor}[/color], ` +
                    `[color=#999999]!lucky[/color] has been disabled for this giveaway.`
                );
                return;
            }

            const userNumber = numberEntries.get(author);
            if (userNumber !== undefined) {
                reply(
                    `🚫 Sorry [color=#d85e27]${safeAuthor}[/color], but [color=#32cd53]you[/color] already entered with number ` +
                    `[color=#DC3D1D][b]${userNumber}[/b][/color]!`
                );
                return;
            }

            const luckyNum = getLuckyNumber(giveawayData);
            if (luckyNum === null || luckyNum === undefined) {
                reply("All numbers are taken — no free numbers left!");
                return;
            }

            addNewEntry(author, fancyName, luckyNum);

            const timeLeftStr = parseTime(giveawayData.timeLeft * 1000);
            const rigHint = rigNote("(approved by the Official Rigging Committee™) ✅");

            reply(
                `[color=#d85e27]${safeAuthor}[/color] used [color=#999999]!luckye[/color] and entered with ` +
                `lucky number [color=#1DDC5D][b]${luckyNum}[/b][/color]! ` +
                `Time remaining: [b][color=#1DDC5D]${timeLeftStr}[/color][/b].` +
                rigHint
            );
        },


        rig(ctx) {
            const { author, safeAuthor, fancyName, giveawayData: ctxGiveawayData, reply } = ctx;
            if (!ctxGiveawayData) return;
            if (!isHostOrAdmin(author, fancyName, ctxGiveawayData.host)) {
                maybeSendRigDeny(author, safeAuthor, "rig");
                return;
            }

            // Only treat as "active giveaway" if the real global giveawayData is set
            const hasActiveGiveaway = !!giveawayData;

            if (!riggedMode) {
                riggedMode = true;
                if (rigBadge) {
                    rigBadge.hidden = false;
                    rigBadge.classList.add('rigged-pulse');
                }
                if (giveawayFrame) {
                    giveawayFrame.classList.add('rigged');
                }

                updateRigToggleUI();

                // Only announce in chat if a giveaway is actually running
                if (hasActiveGiveaway) {
                    reply(
                        `[color=#FF4F9A][b]RIGGED MODE ENGAGED![/b][/color] ` +
                        `[i][color=#FF9AE6]Visual flair only — the math is still fair... probably.[/color][/i] 😈`
                    );
                }
            } else {
                if (hasActiveGiveaway) {
                    reply(
                        `[color=#FF4F9A][b]RIGGED MODE is already active![/b][/color]`
                    );
                }
            }
        },

        unrig(ctx) {
            const { author, safeAuthor, fancyName, giveawayData: ctxGiveawayData, reply } = ctx;
            if (!ctxGiveawayData) return;
            if (!isHostOrAdmin(author, fancyName, ctxGiveawayData.host)) {
                maybeSendRigDeny(author, safeAuthor, "unrig");
                return;
            }

            const hasActiveGiveaway = !!giveawayData;

            if (riggedMode) {
                riggedMode = false;
                if (rigBadge) {
                    rigBadge.hidden = true;
                    rigBadge.classList.remove('rigged-pulse');
                }
                if (giveawayFrame) {
                    giveawayFrame.classList.remove('rigged');
                }

                updateRigToggleUI();

                if (hasActiveGiveaway) {
                    reply(
                        `[color=#32cd53][b]Rigged mode disabled.[/b][/color] ` +
                        `[i][color=#A0E7AF]Back to boring, fully transparent fairness.[/color][/i] 😒`
                    );
                }
            } else {
                if (hasActiveGiveaway) {
                    reply(
                        `[color=#32cd53][b]Rigged mode isn&#39;t enabled.[/b][/color]`
                    );
                }
            }
        },

        random(ctx) {
            const { author, safeAuthor, fancyName, giveawayData, reply } = ctx;

            if (GENERAL_SETTINGS.disable_random) {
                reply(`🚫 Sorry [color=#d85e27]${safeAuthor}[/color], but [color=#999999]!random[/color] has been disabled for this giveaway.`);
                return;
            }
            const userNumber = numberEntries.get(author);
            if (userNumber !== undefined) {
                reply(`🚫 Sorry [color=#d85e27]${safeAuthor}[/color], but [color=#32cd53]you[/color] already entered with number [color=#DC3D1D][b]${userNumber}[/b][/color]!`);
                return;
            }

            const takenNumbers = new Set(numberEntries.values());
            const availableNumbers = [];
            for (let n = giveawayData.startNum; n <= giveawayData.endNum; ++n) {
                if (!takenNumbers.has(n)) availableNumbers.push(n);
            }
            if (availableNumbers.length === 0) {
                reply("All numbers are taken — no free numbers left!");
                return;
            }
            const randomNum = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];

            addNewEntry(author, fancyName, randomNum);
            const timeLeftStr = parseTime(giveawayData.timeLeft * 1000);
            const rigHint = rigNote("(chosen by our [b]totally unbiased[/b] chaos engine)");
            reply(
                `[color=#d85e27]${safeAuthor}[/color] has entered with the number ` +
                `[color=#DC3D1D][b]${randomNum}[/b][/color]! Time remaining: ` +
                `[b][color=#1DDC5D]${timeLeftStr}[/color][/b].` +
                rigHint
            );
        },

        number({ author, safeAuthor , reply}) {
            const userNumber = numberEntries.get(author);
            if (userNumber !== undefined) {
                reply(`[color=#d85e27]${safeAuthor}[/color] your number is [color=#DC3D1D][b]${userNumber}[/b][/color]`);
            } else {
                reply(`[color=#d85e27]${safeAuthor}[/color] you are not currently in the giveaway.`);
            }
        },

        free({ safeAuthor, giveawayData , reply}) {
            if (GENERAL_SETTINGS.disable_free) {
                reply(`🚫 Sorry [color=#d85e27]${safeAuthor}[/color], !free disabled`);
                return;
            }

            const sample = getFreeNumberSample(giveawayData, 5);

            if (!sample.length) {
                reply("There are no free numbers left!");
                return;
            }

            const rigHint = rigNote("(these are some [b]suspiciously good[/b] numbers, trust me...) 😏");
            reply(`Free numbers: ${sample.join(", ")}.` + rigHint);
        },

        /* Fun commands for upload.cx */
        suckur: funUpload("Placeholder™"),
        ruckus: funUpload("Suckur!"),
        ick: funUpload(`WillWa loves the [b][color=BLUE]B[/color][color=#FFFFFF]R[/color][color=#C8102E]I[/color][color=#FFFFFF]T[/color][color=#C8102E]I[/color][color=BLUE]S[/color][color=#FFFFFF]H[/color]`),
        corigins: funUpload("🦅 🇺🇸 🦅 🇺🇸 🦅 🇺🇸"),
        lejosh: funUpload("🥖 🇫🇷 🥖 🇫🇷 🥖 🇫🇷"),
        bloom: funUpload("🫎 🇨🇦 🫎 🇨🇦 🫎 🇨🇦"),
        dawg: funUpload("🐑 🏴 🐑 🏴 🐑 🏴"),
        greglechin: funUpload("🦘 🇦🇺 🦘 🇦🇺 🦘 🇦🇺"),

        /* Host + Admin commands */
        addbon: hostAddBon,

        reminder(ctx) {
            if (ctx.author === ctx.giveawayData.host) sendReminder();
        },

        winners(ctx) {
            const { author, fancyName, args, giveawayData, reply } = ctx;
            if (!isHostOrAdmin(author, fancyName, giveawayData.host)) return;
            const newCount = parseInt(ctx.args[0], 10);
            if (isNaN(newCount) || newCount < 1 || newCount > MAX_WINNERS) {
                reply(`[color=red]Usage:[/color] !winners 1‑${MAX_WINNERS}`);
                return;
            }

            // Snapshot previous effective so we can announce the change in chat
            // (host-driven adjustment, symmetric to the scaling-increase announcement).
            const prevEffective = Math.max(
                1,
                Math.floor(Number(giveawayData.effectiveWinnersNum || giveawayData.baseWinnersAtStart || giveawayData.winnersNum) || 1)
            );

            giveawayData.winnersNum = newCount;
            giveawayData.baseWinnersAtStart = newCount;
            giveawayData.effectiveWinnersNum = newCount;
            winnersInput.value = newCount;

            // Host's explicit !winners overrides scaling: drop the cap to N as well,
            // so effective resets to exactly N. Scaling can resume from this new base
            // if more sponsor BON arrives, up to N until the host raises the cap via !maxwinners.
            let capWasReset = false;
            if (giveawayData.scaleWinnersWithSponsors) {
                const prevCap = Math.floor(Number(giveawayData.hostMaxScaledWinners) || newCount);
                giveawayData.hostMaxScaledWinners = newCount;
                capWasReset = prevCap !== newCount;
                if (maxScaledWinnersInput) {
                    maxScaledWinnersInput.min = String(newCount);
                    maxScaledWinnersInput.value = String(newCount);
                }
                // Recompute is a no-op for effective (base === cap === N) but keeps
                // derived state consistent (e.g. syncs the winners display).
                recomputeEffectiveWinners(giveawayData);
            }

            // Update the announcement baseline so future scaling-increase messages
            // count from N, not from the pre-override effective value.
            giveawayData.lastAnnouncedWinners = newCount;
            initializeScaledWinnersAnnouncementState(giveawayData);

            // Public chat announcement when the effective winner count actually changed.
            // Symmetric to the "Winners increased" message scaling sends on its own.
            if (newCount !== prevEffective) {
                const direction = newCount > prevEffective ? "increased" : "decreased";
                const delta = Math.abs(newCount - prevEffective);
                const sign = newCount > prevEffective ? "+" : "−";
                const announcement =
                    `[b][color=${SCALING_ACCENT_COLOR}]Host adjustment:[/color][/b] ` +
                    `[b]Winners ${direction}[/b]: [b][color=#5DE2E7]${prevEffective} → ${newCount} (${sign}${delta})[/color][/b].`;
                sendMessage(announcement);
                flashWinnersUI();
                logEvent("Host adjusted winners", `${prevEffective} -> ${newCount} (${sign}${delta})`);
            }

            const capNote = capWasReset
                ? ` [i][color=#9aa0a6]Scaling cap also reset to ${newCount} — use !maxwinners to raise.[/color][/i]`
                : "";
            reply(`Number of winners set to [color=#1DDC5D][b]${newCount}[/b][/color].${capNote}`);
            snapshotGiveaway();
        },

        maxwinners(ctx) {
            const { author, fancyName, args, giveawayData, reply } = ctx;
            if (!isHostOrAdmin(author, fancyName, giveawayData.host)) return;
            if (!giveawayData.scaleWinnersWithSponsors) {
                reply(`[color=red]Scaling is not enabled for this giveaway.[/color]`);
                return;
            }
            const newMax = parseInt(args[0], 10);
            const baseWinners = Math.max(1, Math.floor(Number(giveawayData.baseWinnersAtStart || giveawayData.winnersNum) || 1));
            if (isNaN(newMax) || newMax < baseWinners || newMax > MAX_WINNERS) {
                reply(`[color=red]Usage:[/color] !maxwinners ${baseWinners}‑${MAX_WINNERS}`);
                return;
            }
            giveawayData.hostMaxScaledWinners = newMax;
            if (maxScaledWinnersInput) maxScaledWinnersInput.value = String(newMax);
            const effective = recomputeEffectiveWinners(giveawayData);
            initializeScaledWinnersAnnouncementState(giveawayData);
            reply(
                `Max scaled winners set to [color=#1DDC5D][b]${newMax}[/b][/color]. ` +
                `Current effective winners: [b][color=#5DE2E7]${effective}[/color][/b].`
            );
            snapshotGiveaway();
        },

        scale(ctx) {
            const { giveawayData, reply } = ctx;
            if (!giveawayData) {
                reply("There is no active giveaway right now.");
                return;
            }
            if (!giveawayData.scaleWinnersWithSponsors) {
                reply("Winner scaling is not enabled for this giveaway.");
                return;
            }

            const baseWinners = Math.max(1, Math.floor(Number(giveawayData.baseWinnersAtStart || giveawayData.winnersNum) || 1));
            const effective = Math.max(1, Math.floor(Number(giveawayData.effectiveWinnersNum) || baseWinners));
            const cap = Math.max(baseWinners, Math.min(Math.floor(Number(giveawayData.hostMaxScaledWinners) || baseWinners), MAX_WINNERS));
            const threshold = getScalingBonPerWinner(giveawayData);
            const totalContrib = Math.max(0, Math.floor(getTotalContribForScaling(giveawayData)));
            const progress = totalContrib % threshold;
            const remaining = progress === 0 ? threshold : threshold - progress;
            const extraWinners = effective - baseWinners;
            const isCustomThreshold = !!(giveawayData.scaleBonPerWinner && giveawayData.scaleBonPerWinner > 0);

            let msg = `[b][color=${SCALING_ACCENT_COLOR}]Scaling Status:[/color][/b] ` +
                `Winners: [b][color=#5DE2E7]${effective}[/color][/b] (base ${baseWinners}` +
                (extraWinners > 0 ? ` + ${extraWinners} from sponsorships` : ``) + `). ` +
                `Threshold: [b]${fmtBON(threshold)} BON[/b]/winner` +
                (isCustomThreshold ? ` (custom)` : ``) + `. ` +
                `Total contributions: [b][color=#ffc00a]${fmtBON(totalContrib)} BON[/color][/b]. `;

            if (effective >= cap) {
                msg += `[b]Max winners reached[/b] (${cap}).`;
            } else if (progress === 0 && totalContrib > 0) {
                msg += `Next threshold: [b]reached[/b] — waiting for recompute.`;
            } else {
                msg += `[b]${fmtBON(remaining)} BON[/b] needed for next winner (${fmtBON(progress)}/${fmtBON(threshold)}). Max: [b]${cap}[/b].`;
            }

            reply(msg);
        },

        addtime: hostAdjustTime(+1),
        removetime: hostAdjustTime(-1),

        naughty(ctx) {
            const { author, fancyName, args, giveawayData, reply } = ctx;
            if (!isHostOrAdmin(author, fancyName, giveawayData.host)) return;

            const sub = (args.shift() || "").toLowerCase();
            const target = (args.shift() || "");

            const key = target.toLowerCase(); // key we store/match on

            switch (sub) {
                case "add": {
                    if (!key) { reply("[color=red]Usage:[/color] !naughty add username"); return; }

                    if (key === giveawayData.host.toLowerCase()) {
                        reply(
                            `[color=red][b]The host can't be added to the naughty list![/b][/color]`
                        );
                        return;
                    }
                    naughtySet.add(key); // save in LS
                    saveNaughty();

                    // remove any existing entry (try exact, then case-insensitive fallback)
                    let removed = false;
                    let removedUser = null;

                    // exact-case fast path (if the host typed the exact casing)
                    if (target && numberEntries.has(target)) {
                        removedUser = target;
                    } else {
                        for (const user of numberEntries.keys()) {
                            if (user.toLowerCase() === key) {
                                removedUser = user;
                                break;
                            }
                        }
                    }

                    if (removedUser) {
                        const prevNum = numberEntries.get(removedUser);
                        numberEntries.delete(removedUser);
                        fancyNames.delete(removedUser);
                        if (prevNum !== undefined) numberTakenBy.delete(prevNum);
                        removed = true;
                    }

                    if (removed) { updateEntries(); snapshotGiveaway(); }

                    reply(`👮 [color=#FFDE59]${fmtUserList([target])} added to the naughty list and removed from the giveaway.[/color]`);
                    break;
                }


                case "remove":
                    if (!key) { reply("[color=red]Usage:[/color] !naughty remove username"); return; }
                    naughtySet.delete(key); saveNaughty();
                    reply(`🥳 [color=#7DDA58]${fmtUserList([target])} removed from the naughty list![/color]`);
                    break;

                case "list":
                    reply(naughtySet.size
                          ? `[color=#FFDE59]Naughty list: [b]${fmtUserList([...naughtySet])}[/b][/color]`
                          : "Naughty list is empty.");
                    break;

                default:
                    reply("[color=red]Usage:[/color] !naughty (add|remove|list) username");
            }
        },


        end(ctx) {
            const { author, fancyName, args, giveawayData, reply } = ctx;
            // If host, always allow
            if (author === giveawayData.host) {
                logEvent("Giveaway stop requested", `Requested by host ${sanitizeNick(author)} via !end.`);
                endGiveaway();
                return;
            }
            // If admin (not host), must specify whose to end
            if (isAdmin(fancyName)) {
                if (!args.length || args[0] !== giveawayData.host) {
                    reply(`[color=red]Admins must specify whose giveaway to end. Example: !end ${sanitizeNick(giveawayData.host)}[/color]`);
                    return;
                }
                logEvent("Giveaway stop requested", `Requested by admin ${sanitizeNick(author)} via !end ${sanitizeNick(giveawayData.host)}.`);
                endGiveaway();
            }
        }
    });

    function isHostOrAdmin(author, fancyName, host) {
        return author === host || isAdmin(fancyName);
    }

    function showHelp(ctx) {
        const reply = (ctx && typeof ctx.reply === "function") ? ctx.reply : sendMessage;

        const COMMANDS = [
            // Toggleable commands (reflect Settings toggles)
            { name: "random", setting: "disable_random" },
            { name: "lucky", setting: "disable_lucky" },
            { name: "luckye", setting: "disable_lucky" },
            { name: "free", setting: "disable_free" },

            // Always-available commands
            { name: "time", setting: null },
            { name: "entries", setting: null },
            { name: "number", setting: null },
            { name: "bon", setting: null },
            { name: "range", setting: null },
            { name: "scale", setting: null },
            { name: "stats", setting: null },
            { name: "top", setting: null },
            { name: "most", setting: null },
            { name: "sponsors", setting: null },
            { name: "unlucky", setting: null },
            { name: "largest", setting: null },
            { name: "help", setting: null },
            { name: "commands", setting: null },
        ];

        function fmt(cmd, isDisabled) {
            if (isDisabled) {
                // Use strikethrough and gray
                return `![color=#888888][s][b]${cmd}[/b][/s][/color]`;
            }
            // Enabled formatting
            return `![color=#E50E68][b]${cmd}[/b][/color]`;
        }

        const helpText = "Commands are " + COMMANDS.map(({ name, setting }) =>
                                                        fmt(name, setting && GENERAL_SETTINGS[setting])
                                                       ).join(" - ") + ".";
        reply(helpText);
    }


    function funUpload(text) {
        return (ctx) => {
            if (!Site.isUploadCx) return;
            const reply = (ctx && typeof ctx.reply === "function") ? ctx.reply : sendMessage;
            reply(text);
        };
    }
    async function hostAddBon(ctx) {
        const { author, args, giveawayData, reply } = ctx;
        if (author !== giveawayData.host) return;

        const raw = args[0];
        const clean = String(raw ?? "").replace(/[^0-9]/g, "");
        const amount = parseInt(clean, 10);

        if (!Number.isFinite(amount) || amount <= 0) {
            reply("[b][color=red]Invalid usage.[/color] Example: !addbon 100[/b]");
            return;
        }

        // Prevent the host from increasing the pot beyond their current BON balance.
        // We fetch a fresh balance snapshot (no page reload) so stale UI can't be abused.
        const newTotal = giveawayData.amount + amount;

        const currentBon = await getVerifiedHostBalance({ requireServer: true, maxAgeMs: 0 });

        if (!Number.isFinite(currentBon) || currentBon == null || currentBon < 0) {
            reply(
                `[b][color=red]Unable to verify your current BON balance right now. ` +
                `Please try !addbon again shortly.[/color][/b]`
            );
            return;
        }

        if (currentBon < newTotal) {
            reply(
                `[b][color=red]You only have ${fmtBON(currentBon)} BON right now, so you can't increase the pot to ${fmtBON(newTotal)}. ` +
                `Wait for more BON (or sponsor gifts) and try again.[/color][/b]`
            );
            return;
        }

        const prevEffectiveWinners = Math.max(
            1,
            Math.floor(Number(giveawayData.effectiveWinnersNum || giveawayData.baseWinnersAtStart || giveawayData.winnersNum) || 1)
        );

        giveawayData.amount += amount;

        // ✅ host-only tracking (excludes sponsors)
        giveawayData.hostAdded = (giveawayData.hostAdded || 0) + amount;

        const newEffectiveWinners = recomputeEffectiveWinners(giveawayData);
        const winnersDelta = Math.max(0, newEffectiveWinners - prevEffectiveWinners);
        if (winnersDelta > 0) {
            giveawayData.lastAnnouncedWinners = Math.max(
                newEffectiveWinners,
                Math.floor(Number(giveawayData.lastAnnouncedWinners || giveawayData.baseWinnersAtStart || 1) || 1)
            );
            flashWinnersUI();
        }

        const addedPart = `Host added [color=#DC3D1D][b]${fmtBON(amount)} BON[/b][/color].`;
        const totalPart = `Total pot: [b][color=#ffc00a]${fmtBON(Number(cleanPotString(giveawayData.amount)))} BON[/color][/b].`;

        let scalingPart = "";
        if (giveawayData.scaleWinnersWithSponsors) {
            if (winnersDelta > 0) {
                scalingPart = `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]Winners increased[/b]: [b][color=#5DE2E7]${prevEffectiveWinners} → ${newEffectiveWinners} (+${winnersDelta})[/color][/b].`;
            } else {
                scalingPart = getSponsorshipNextWinnerLine(giveawayData, { plain: true });
            }
        }

        sendMessage([addedPart, totalPart, scalingPart].filter(Boolean).join(" "));
        snapshotGiveaway();
    }

    function rebuildSchedule() {
        const totalMin = (giveawayData.endTs - Date.now()) / 60000;
        // Use the UI value for number of reminders (clamp if needed)
        let reminderNum = Math.min(Number(remNumInput.value), getReminderLimits(totalMin)[0]);
        if (isNaN(reminderNum) || reminderNum < 0) reminderNum = 0;
        giveawayData.reminderSchedule = getReminderSchedule(totalMin, reminderNum);
        giveawayData.reminderNum = reminderNum;
        // Frequency fields (legacy helpers)
        giveawayData.reminderFreqSec = (reminderNum > 0) ? totalMin * 60 / (reminderNum + 1) : 0;
        giveawayData.nextReminderSec = giveawayData.reminderFreqSec;
        remNumInput.value = reminderNum;
    }

    function hostAdjustTime(sign) {
        // sign = +1 for !addtime / !time add, -1 for !removetime / !time remove
        return ({ author, fancyName, args, giveawayData, reply }) => {
            if (!isHostOrAdmin(author, fancyName, giveawayData.host)) return;

            const mins = parseFloat(args[0]);
            if (isNaN(mins) || mins <= 0) {
                reply(
                    "[color=red]Usage:[/color] !time add|remove <minutes> or !addtime|!removetime <minutes>"
                );
                return;
            }

            const deltaMs = sign * mins * 60_000;
            giveawayData.endTs += deltaMs; // move the deadline

            rebuildSchedule(); // rebuild reminder schedule

            giveawayData.timeLeft = Math.max(
                Math.ceil((giveawayData.endTs - Date.now()) / 1000),
                0
            );
            countdownHeader.textContent = parseTime(giveawayData.endTs - Date.now());

            const verb = sign > 0 ? "Added" : "Removed";
            const prep = sign > 0 ? "to" : "from";

            reply(
                `${verb} [color=#DC3D1D][b]${mins}[/b][/color] minute${mins === 1 ? "" : "s"} ${prep} the giveaway. ` +
                `New time left: [b][color=#1DDC5D]${parseTime(
                    giveawayData.endTs - Date.now()
                )}[/color][/b].`
            );
            snapshotGiveaway();
        };
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 11: Winner Selection and Payouts
    // ───────────────────────────────────────────────────────────
    function endGiveaway() {
        // ---- re-entry guard (prevents double gifting) ----
        if (!giveawayData) return;
        if (giveawayData.__ending) return;
        giveawayData.__ending = true;

        // ---- cross-tab guard ----
        // If another tab currently owns the giveaway (fresh heartbeat in the last
        // TAB_LOCK_STALE_MS), do NOT proceed with payout. Without this, a tab that
        // restored from snapshot while the original tab was alive could end up
        // paying every winner twice.
        if (isLockedByAnotherTab()) {
            logEvent(
                "End aborted (another tab owns this giveaway)",
                "Refusing to send gifts to avoid double-payout. The owning tab will handle payout."
            );
            // Don't tear down state here — the owning tab is the source of truth.
            // Just back off and let it run.
            giveawayData.__ending = false;
            return;
        }

        // ---- crash-safety: clear the active-giveaway snapshot up front ----
        // The snapshot is meant to recover an *in-progress* giveaway. Once we've
        // committed to ending and paying out, recovering this state would re-trigger
        // payout. Clearing first means: a crash anywhere from here onwards leaves
        // nothing to restore, which is the safe outcome (under-pay + verifier warns
        // > over-pay silently). Per-recipient idempotency in giftBon catches anything
        // that slips through.
        try { clearGiveawaySnapshot(); } catch {}

        // Stop additional triggers ASAP (but don't clear entries/state yet)
        try {
            startButton.disabled = true;
            startButton.onclick = null; // prevent double-click / queued clicks from re-ending
        } catch {}

        if (giveawayData.countdownTimerID) {
            clearInterval(giveawayData.countdownTimerID);
            giveawayData.countdownTimerID = null;
        }
        if (giveawayData.potUpdater) {
            clearInterval(giveawayData.potUpdater);
            giveawayData.potUpdater = null;
        }
        if (sponsorsInterval) {
            clearInterval(sponsorsInterval);
            sponsorsInterval = null;
        }

        // no entries → no winners
        if (numberEntries.size === 0) {
            const emptyMessage = `Unfortunately, no one has entered the giveaway, so no one wins!`
            sendMessage(emptyMessage)
            logEvent("Giveaway ended", `Entrants=0 | Winners=0 | Host-funded=${fmtBON(giveawayData.amount)} BON | Sponsored=0 BON | Total=${fmtBON(giveawayData.amount)} BON`)
        } else {
            // 1) sponsors shout-out
            if (giveawayData.sponsors.length > 0) {
                const sponsorsMessage = buildSponsorsSummaryMessage(giveawayData);
                if (sponsorsMessage) sendMessage(sponsorsMessage);
            }

            // 2) build and sort entries by closeness to winningNumber
            const entries = Array.from(numberEntries.entries())
            .map(([author, guess], idx) => ({
                author,
                guess,
                gap:   Math.abs(guess - giveawayData.winningNumber),
                order: idx
            }))
            .sort((a, b) => a.gap - b.gap || a.order - b.order);

            // Detect and announce ties
            const ties = entries.filter(e => e.gap === entries[0].gap);
            if (ties.length > 1) {
                const tieMessage = ties.map(e => `[b][color=#DC3D1D]${e.author}[/color][/b]`).join(", ");
                sendMessage(`⚠️ We have a tie between ${tieMessage}! [b][color=#DC3D1D]${entries[0].author}[/color][/b] wins the tie-breaker as their entry was submitted first!`);
            }

            // 3) pick top N winners
            const effectiveWinners = recomputeEffectiveWinners(giveawayData);
            const N = Math.min(effectiveWinners, entries.length);
            const winners = entries.slice(0, N);

            // 4) compute weight-based payouts
            //    weight for rank i (0-based) is (N - i)
            const weights = winners.map((_, i) => N - i);
            const totalWeight = weights.reduce((sum, w) => sum + w, 0);

            // raw amounts, floored to integers
            let allocated = winners.map((_, i) =>
                                        Math.floor(giveawayData.amount * weights[i] / totalWeight)
                                       );
            // fix any rounding‐leftover by giving it to 1st place
            const sumAllocated = allocated.reduce((s, x) => s + x, 0);
            const leftover = giveawayData.amount - sumAllocated;
            if (leftover > 0) {
                allocated[0] += leftover;
            }

            // Save giveaway outcome stats to localStorage (per-site)
            try {
                recordGiveawayStats(giveawayData, winners, allocated, numberEntries);
            } catch (e) { /* ignore stats errors */ }

            // Initialize winners / payout status UI so we can tick boxes as gifts are confirmed
            initWinnersStatusUI(winners, allocated, giveawayData.host);

            // 5) announce winners summary
            const winNum = giveawayData.winningNumber;
            const potTotal = Math.max(0, Math.floor(Number(giveawayData.amount) || 0));
            const sponsoredTotal = Math.max(0, Math.floor(sumSponsorContribs(giveawayData.sponsorContribs, giveawayData.host) || 0));
            const hostFundedTotal = Math.max(0, potTotal - sponsoredTotal);
            const entrantsTotal = numberEntries.size;
            const scaleIncrease = Math.max(0, N - Math.max(1, Math.floor(Number(giveawayData.baseWinnersAtStart || giveawayData.winnersNum) || 1)));

            //hard-coded emoji “podium”
            const podium = ["🥇", "🥈", "🥉", "🏅", "🎖️"];

            //build the tail: 6th, 7th, … up to the larger of N or MAX_WINNERS
            const need = Math.max(N, MAX_WINNERS) - podium.length;
            const tail = Array.from({ length: need }, (_, i) => {
                const n = i + podium.length + 1;
                const s = (n % 10 === 1 && n % 100 !== 11) ? "st" :
                (n % 10 === 2 && n % 100 !== 12) ? "nd" :
                (n % 10 === 3 && n % 100 !== 13) ? "rd" : "th";
                return `${n}${s}`; // "6th" … "15th"
            });

            //final list
            const medals = podium.concat(tail);

            // Rig note (rigNote() already checks riggedMode)
            const rigTag = rigNote(" (Rigged mode was active, but winners were still chosen [b]fairly[/b]… allegedly.) 👀");

            const summaryLine =
                  `🏆 Winning number: [b][color=#1DDC5D]${fmtBON(winNum)}[/color][/b]. ` +
                  `Winners drawn: [b][color=#5DE2E7]${fmtBON(N)}[/color][/b]. ` +
                  `Total entrants: [b][color=#5DE2E7]${fmtBON(entrantsTotal)}[/color][/b].`;
            const fundingLine =
                  `Funding — Host-funded: [b][color=#ffc00a]${fmtBON(hostFundedTotal)} BON[/color][/b] | ` +
                  `Sponsored: [b][color=#00abff]${fmtBON(sponsoredTotal)} BON[/color][/b] | ` +
                  `Total pot: [b][color=#FFC00A]${fmtBON(potTotal)} BON[/color][/b].`;
            const scalingLine = (giveawayData.scaleWinnersWithSponsors && scaleIncrease > 0)
            ? `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]Winners increased[/b] by [b][color=#5DE2E7]+${fmtBON(scaleIncrease)}[/color][/b] due to sponsorships.`
            : "";

            if (winners.length === 1) {
                // single‐winner public message
                const w = winners[0];
                const diff = Math.abs(w.guess - winNum);
                const prize = fmtBON(allocated[0]);

                const winnerLine =
                      `Congrats [b][color=#DC3D1D]${w.author}[/color][/b]! ` +
                      `Guess [color=#1DDC5D][b]${fmtBON(w.guess)}[/b][/color] ` +
                      `[color=#FB4F4F](off by ${fmtBON(diff)})[/color] ` +
                      `wins [b][color=#FFC00A]${prize} BON[/color][/b].`;

                sendMessage([summaryLine, fundingLine, scalingLine, winnerLine].filter(Boolean).join("\n") + rigTag);
            } else {
                // multi‐winner public message
                const lines = winners.map((w, i) => {
                    const diff = Math.abs(w.guess - winNum);
                    const prize = fmtBON(allocated[i]);
                    const medal = medals[i] || `${i + 1}.`;
                    return `${medal} [b][color=#DC3D1D]${w.author}[/color][/b]: ` +
                        `[color=#1DDC5D][b]${fmtBON(w.guess)}[/b][/color] ([color=#FB4F4F]${fmtBON(diff)}[/color]) ` +
                        `[color=#FFC00A][b]${prize} BON[/b][/color]`;
                });

                sendMessage([summaryLine, fundingLine, scalingLine, lines.join(', ')].filter(Boolean).join("\n") + rigTag);
            }

            const winnerNames = winners.map(w => sanitizeNick(w.author)).join(", ") || "none";
            const payoutPerWinner = allocated.map((amt, i) => `${sanitizeNick(winners[i]?.author || "unknown")}: ${fmtBON(amt)} BON`).join(", ");
            logEvent(
                "Giveaway ended",
                `Entrants=${fmtBON(entrantsTotal)} | Winners=${fmtBON(N)} | Host-funded=${fmtBON(hostFundedTotal)} BON | Sponsored=${fmtBON(sponsoredTotal)} BON | Total=${fmtBON(potTotal)} BON | Winners list=${winnerNames}${payoutPerWinner ? ` | Payouts=${payoutPerWinner}` : ""}`
            );

            // 6) send the gifts
            const selfKeys = resolveSelfKeys(giveawayData.host);

            if (winners.length === 1) {
                // single‐winner gift message
                const w = winners[0];
                const amt = allocated[0];

                if (selfKeys.size && selfKeys.has(normalizeUserKey(w.author))) {
                    // Host winner — cannot gift to self
                    markWinnerGiftSelf(w.author);
                } else {
                    giftBon(
                        w.author,
                        amt,
                        `🎉 You won! Enjoy your ${amt} BON!`
                    );
                }
            } else {
                // -- multi-winner gift messages -----------------------------
                winners.forEach((w, i) => {
                    if (selfKeys.size && selfKeys.has(normalizeUserKey(w.author))) {
                        // Host winner — cannot gift to self
                        markWinnerGiftSelf(w.author);
                        return;
                    }

                    const placeText = ordinal(i + 1); // 1st, 2nd, 3rd…
                    giftBon(
                        w.author,
                        allocated[i],
                        `🎉 Congratulations on placing ${placeText}!`
                    );
                });
            }

            // 6b) Verify that the gifts actually show up in chat via the API
            verifyWinnerGifts(winners, allocated, giveawayData.host);
        }

        // 7) clean up timers & state
        stopGiveaway();
    }

    function clearWinnersStatusUI() {
        winnerPayouts.clear();
        winnerGiftStatus.clear();
        clearEntryRowCache();

        const table = getEntriesTable();
        if (!table) return;

        // Reset back to the basic two-column header.
        // Body will be repopulated by updateEntries() as entries arrive.
        table.innerHTML =
            "<thead><tr><th>User</th><th>Entry #</th></tr></thead><tbody></tbody>";
    }

    function initWinnersStatusUI(winners, allocated, hostName) {
        winnerPayouts.clear();
        winnerGiftStatus.clear();

        const selfKeys = resolveSelfKeys(hostName);

        if (!Array.isArray(winners) || !Array.isArray(allocated) || !winners.length) {
            return;
        }

        const table = document.getElementById("entriesTable");
        if (!table) return;

        const thead = table.querySelector("thead");
        const tbody = table.querySelector("tbody");
        if (!thead || !tbody) return;

        const headerRow = thead.querySelector("tr");
        if (!headerRow) return;

        // If we're still in the plain 2-column mode, extend the header
        if (headerRow.children.length === 2) {
            const thPrize = document.createElement("th");
            thPrize.textContent = "Prize";
            const thGift = document.createElement("th");
            thGift.textContent = "Gift Status";
            headerRow.appendChild(thPrize);
            headerRow.appendChild(thGift);
        }

        // Build a lookup from entry number -> { author, prize }
        const byGuess = new Map();
        winners.forEach((w, idx) => {
            if (!w || typeof w.author !== "string") return;
            const prize = allocated[idx];
            if (!prize || prize <= 0) return;
            byGuess.set(w.guess, { author: w.author, prize });
        });

        Array.from(tbody.rows).forEach(row => {
            const cells = row.children;
            if (cells.length < 2) return;

            const entryNum = parseInt(cells[1].textContent, 10);
            const info = byGuess.get(entryNum);

            const prizeCell = document.createElement("td");
            const giftCell = document.createElement("td");
            giftCell.style.textAlign = "center";

            if (info) {
                const key = normalizeUserKey(info.author);
                winnerPayouts.set(key, info.prize);

                prizeCell.textContent = info.prize.toLocaleString();
                row.dataset.winnerKey = encodeURIComponent(key);

                if (selfKeys.size && selfKeys.has(key)) {
                    // Host winner — can't gift to self, so skip gifting/verification UI
                    winnerGiftStatus.set(key, "self");
                    giftCell.textContent = "Self";
                    giftCell.title = "Host winner (no self-gift)";
                    row.classList.add("gift-self");
                } else {
                    winnerGiftStatus.set(key, "pending");
                    giftCell.innerHTML = `<span class="gift-spinner" title="Checking gift status…"></span>`;
                    row.classList.add("gift-pending");
                }

            } else {
                // Non-winners still get empty cells so the table stays aligned
                prizeCell.textContent = "";
                giftCell.textContent = "";
            }

            row.appendChild(prizeCell);
            row.appendChild(giftCell);
        });
    }

    function getWinnerRowByRecipient(recipientName) {
        if (!recipientName) return null;
        const key = encodeURIComponent(normalizeUserKey(recipientName));

        const table = document.getElementById("entriesTable");
        if (!table) return null;

        return table.querySelector(`tbody tr[data-winner-key="${key}"]`);
    }

    function markWinnerGiftConfirmed(recipientName) {
        const row = getWinnerRowByRecipient(recipientName);
        if (!row) return;

        row.classList.remove("gift-pending", "gift-failed");
        row.classList.add("gift-confirmed");

        const key = normalizeUserKey(recipientName);
        winnerGiftStatus.set(key, "confirmed");

        const cells = row.children;
        if (cells.length >= 4) {
            cells[3].textContent = "✓";
        }
    }

    function markWinnerGiftSelf(recipientName) {
        const row = getWinnerRowByRecipient(recipientName);
        if (!row) return;

        row.classList.remove("gift-pending", "gift-failed", "gift-confirmed");
        row.classList.add("gift-self");

        const key = normalizeUserKey(recipientName);
        if (key) winnerGiftStatus.set(key, "self");

        const cells = row.children;
        if (cells.length >= 4) {
            // "No gift" indicator (host winner can't gift to self)
            cells[3].textContent = "Self";
            cells[3].title = "Host winner (no self-gift)";
        }
    }


    function markWinnerGiftFailed(recipientName) {
        const row = getWinnerRowByRecipient(recipientName);
        if (!row) return;

        row.classList.remove("gift-pending", "gift-confirmed");
        row.classList.add("gift-failed");

        const key = normalizeUserKey(recipientName);
        winnerGiftStatus.set(key, "failed");

        const cells = row.children;
        if (cells.length >= 4) {
            cells[3].textContent = "⚠";
        }
    }

    function markAllPendingWinnerGiftsFailed() {
        const table = document.getElementById("entriesTable");
        if (!table) return;

        const rows = table.querySelectorAll('tbody tr.gift-pending[data-winner-key]');
        rows.forEach(row => {
            const keyEnc = row.dataset.winnerKey || "";
            let key = "";
            try { key = decodeURIComponent(keyEnc); } catch (_) { key = keyEnc; }

            const normKey = normalizeUserKey(key);
            if (normKey) winnerGiftStatus.set(normKey, "failed");

            row.classList.remove("gift-pending", "gift-confirmed");
            row.classList.add("gift-failed");

            const cells = row.children;
            if (cells.length >= 4) {
                cells[3].textContent = "⚠";
            }
        });
    }

    // Fetch wrapper that *cannot* hang forever
    async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            return await fetch(url, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(t);
        }
    }

    /**
     * After gifts are sent, poll the chat API a few times to confirm
     * that the expected host→winner gift messages appeared.
     * If we can't confirm them, warn in chat that gifting may have failed.
     *
     * @param {Array<{author:string}>} winners
     * @param {number[]} allocated
     * @param {string} hostName
     */
    function verifyWinnerGifts(winners, allocated, hostName) {
        try {
            if (!winners || !winners.length) return;

            const selfKeys = resolveSelfKeys(hostName);
            if (!selfKeys.size) {
                // If UI is showing pending spinners, don’t leave them stuck
                markAllPendingWinnerGiftsFailed();
                return;
            }

            const hasNonHostWinner = winners.some(w => w && w.author && !selfKeys.has(normalizeUserKey(w.author)));

            // recipientKey -> { display, amount }
            const expected = new Map();

            winners.forEach((w, idx) => {
                const rec = (w && w.author) ? String(w.author).trim() : "";
                const recKey = normalizeUserKey(rec);
                const amt = allocated[idx];
                if (!rec || !amt || amt <= 0) return;

                // Host winner: can't gift to self, so don't expect/verify a gift message
                if (recKey && selfKeys.has(recKey)) {
                    markWinnerGiftSelf(rec);
                    return;
                }

                // If a user somehow appears twice, keep the larger expected amount
                const prev = expected.get(recKey);
                const prevAmt = prev ? prev.amount : 0;
                if (!prev || amt > prevAmt) {
                    expected.set(recKey, { display: rec, amount: amt });
                }
            });

            if (!expected.size) {
                // If the host is the only winner, there is nothing to verify
                if (!hasNonHostWinner) return;


                // If winners UI created pending statuses, don’t leave them stuck
                markAllPendingWinnerGiftsFailed();
                return;
            }

            const maxAttempts = 5;
            const delayMs = 5000;

            // Prevent a single hung request from freezing the whole verifier
            const fetchTimeoutMs = 5000;

            // Hard deadline failsafe (covers any unexpected logic/async issues)
            const hardDeadlineMs = (maxAttempts * (delayMs + fetchTimeoutMs)) + 4000;

            let attempts = 0;
            let done = false;

            function finalizeFail(missing) {
                if (done) return;
                done = true;
                clearTimeout(hardTimer);

                if (missing && missing.length) {
                    missing.forEach(name => markWinnerGiftFailed(name));
                    const missingList = missing.map(sanitizeNick).join(", ");
                    logEvent("Payout verification warning", `Could not confirm gifts for: ${missingList}`);
                    sendMessage(
                        `[color=#ff4f4f][b]Warning:[/b][/color] ` +
                        `Some giveaway gifts could not be confirmed. ` +
                        `Please manually verify BON for: ${missingList}.`
                    );
                } else {
                    // No names passed (should be rare) — still clear stuck UI
                    markAllPendingWinnerGiftsFailed();
                }
            }

            function finalizeSuccess() {
                if (done) return;
                done = true;
                clearTimeout(hardTimer);
            }

            const hardTimer = setTimeout(() => {
                finalizeFail(Array.from(expected.values()).map(v => v.display));
            }, hardDeadlineMs);

            async function checkOnce() {
                attempts++;

                try {
                    const url = new URL(`/api/chat/messages/${chatroomId}`, location.origin);

                    const res = await fetchWithTimeout(
                        url,
                        { credentials: "include" },
                        fetchTimeoutMs
                    );

                    if (res && res.ok) {
                        const payload = await res.json();
                        const messages = Array.isArray(payload.data) ? payload.data : [];

                        for (const m of messages) {
                            const gift = parseGiftMessage(m.message);
                            if (!gift || !gift.gifter || !gift.recipient) continue;
                            if (!selfKeys.has(normalizeUserKey(gift.gifter))) continue;

                            const recKey = normalizeUserKey(gift.recipient);
                            const expectedRec = expected.get(recKey);
                            if (!expectedRec) continue;

                            if (Math.round(gift.amount) === Math.round(expectedRec.amount)) {
                                markWinnerGiftConfirmed(expectedRec.display);
                                expected.delete(recKey);
                            }
                        }
                    }
                } catch (e) {
                    // swallow – we'll just warn at the end if we never see the messages
                }

                if (expected.size === 0) {
                    finalizeSuccess();
                    return;
                }

                if (attempts >= maxAttempts) {
                    finalizeFail(Array.from(expected.values()).map(v => v.display));
                    return;
                }

                setTimeout(checkOnce, delayMs);
            }

            // Give the server a moment to emit the gift messages before first check
            setTimeout(checkOnce, 2000);
        } catch (e) {
            // Never let verification break the script
            // But also don't leave UI stuck
            logEvent("Payout verification error", "Unexpected error while confirming gift messages.");
            markAllPendingWinnerGiftsFailed();
        }
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 12: Utility Functions
    // ───────────────────────────────────────────────────────────
    // Returns true when we're in the "just started" window where entry attempts
    // should be silently ignored (to catch ultra-fast auto-joiners).
    function isWithinEntryIgnoreWindow() {
        if (!giveawayStartTime) return false;
        const elapsed = Date.now() - giveawayStartTime.getTime();
        return elapsed >= 0 && elapsed < ENTRY_IGNORE_WINDOW_MS;
    }

    // Return a small random sample of free numbers in the current range
    // (used by both !free and the "number already taken" messages)
    function getFreeNumberSample(giveawayData, sampleSize = 5) {
        if (!giveawayData) return [];

        const taken = new Set(numberEntries.values());
        const startNum = giveawayData.startNum;
        const endNum = giveawayData.endNum;
        const totalSlots = endNum - startNum + 1;

        if (totalSlots <= 0) return [];

        // Same optimization as !free: for huge ranges with very few taken numbers
        if (totalSlots > 100000 && taken.size / totalSlots < 0.01) {
            const sample = new Set();
            let attempts = 0, maxAttempts = 1000;

            while (sample.size < sampleSize && attempts < maxAttempts) {
                attempts++;
                const candidate = Math.floor(Math.random() * totalSlots) + startNum;
                if (!taken.has(candidate)) sample.add(candidate);
            }

            const result = [...sample];
            result.sort((a, b) => a - b);
            return result;
        }

        // Normal case: build an array of all free numbers and shuffle a subset
        const freeNumbers = [];
        for (let k = startNum; k <= endNum; k++) {
            if (!taken.has(k)) freeNumbers.push(k);
        }
        if (!freeNumbers.length) return [];

        const actualSampleSize = Math.min(sampleSize, freeNumbers.length);
        // Fisher–Yates style partial shuffle
        for (let i = 0; i < actualSampleSize; i++) {
            const j = i + Math.floor(Math.random() * (freeNumbers.length - i));
            [freeNumbers[i], freeNumbers[j]] = [freeNumbers[j], freeNumbers[i]];
        }

        const result = freeNumbers.slice(0, actualSampleSize);
        result.sort((a, b) => a - b);
        return result;
    }

    // Nicely format "here are some free numbers you can try…" text.
    // Respects the "Free" toggle: if !free is disabled, this returns an empty string.
    function formatFreeNumberSuggestion(giveawayData) {
        if (!giveawayData || GENERAL_SETTINGS.disable_free) return "";

        const sample = getFreeNumberSample(giveawayData, 5);
        if (!sample.length) {
            return " There are no free numbers left!";
        }

        const rigHint = rigNote("(these are some [b]suspiciously good[/b] numbers, trust me...) 😏");
        return ` Here are some free numbers you can try: [b][color=#1DDC5D]${sample.join(", ")}[/color][/b].` + rigHint;
    }

    function getRandomInt(min, max) {
        min = Math.ceil(min);
        max = Math.floor(max);
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    function sendReminder(options = {}) {
        const force = !!(options && options.force);
        if (!force && !shouldSendReminder(giveawayData)) {
            // Try again in 15 seconds if still eligible
            if (!reminderRetryTimeout) {
                reminderRetryTimeout = setTimeout(() => {
                    reminderRetryTimeout = null;
                    sendReminder();
                }, 15000);
            }
            return;
        }
        // Clear retry timer if any
        if (reminderRetryTimeout) {
            clearTimeout(reminderRetryTimeout);
            reminderRetryTimeout = null;
        }

        const silentLine = silentNote("(Silent mode is enabled — command replies are sent via /msg.) 🤫");
        const rigLine = rigNote("(Rigged mode is currently enabled, but the math is [b]definitely[/b] still legit) 😉");
        const msg =
              `🎁 Ongoing giveaway for [b][color=#ffc00a]${fmtBON(cleanPotString(giveawayData.amount))} BON[/color][/b] | ` +
              `${buildWinnersAnnouncementLine(giveawayData)} | ` +
              `Time left: [b][color=#1DDC5D]${parseTime(giveawayData.timeLeft*1000)}[/color][/b]. ` +
              `Pick a number [b]between [color=#DC3D1D]${giveawayData.startNum} and ${giveawayData.endNum}[/color][/b]. ` +
              `[b][color=#5DE2E7]${giveawayData.customMessage}[/color][/b]\n` +
              `✨[b][color=#FB4F4F]Gift the host to add to the pot! [color=${GIFT_HINT_COLOR}](/gift ${getGiftSyntaxHostName()} AMOUNT MESSAGE)[/color][/color][/b]✨` +
              silentLine +
              rigLine;
        sendMessage(msg);
    }

    // ───────────── HTTP-based BON gifting helper ─────────────

    /**
     * Per-giveaway ledger of (recipient, amount) tuples that have already been
     * attempted in this payout. Persisted to localStorage so:
     *   - A crash + restore can't replay payouts
     *   - A second tab that somehow ends the same giveaway can't double-pay
     * Keyed by giveawayId (millisecond start timestamp) + lowercase recipient + amount.
     */
    function getActiveGiveawayId() {
        // Prefer the start time of the currently-active giveaway. Falls back to
        // the snapshot's startTime field if needed. Returns null if neither exists,
        // in which case idempotency is best-effort (we still send, just don't track).
        if (giveawayStartTime) return giveawayStartTime.getTime();
        try {
            const raw = localStorage.getItem(LS_ACTIVE_GIVEAWAY);
            if (!raw) return null;
            const snap = JSON.parse(raw);
            return snap && snap.startTime ? snap.startTime : null;
        } catch { return null; }
    }

    function readPaidGiftsLedger() {
        try {
            const raw = localStorage.getItem(LS_PAID_GIFTS);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === "object") ? parsed : {};
        } catch { return {}; }
    }

    function writePaidGiftsLedger(ledger) {
        try {
            // Cap size by dropping oldest giveaway-id entries (numeric, ms timestamps)
            const ids = Object.keys(ledger).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
            while (ids.length > PAID_GIFTS_MAX_GIVEAWAYS) {
                const oldest = ids.shift();
                delete ledger[oldest];
            }
            localStorage.setItem(LS_PAID_GIFTS, JSON.stringify(ledger));
        } catch {}
    }

    function paidGiftKey(recipient, amount) {
        return `${String(recipient || "").trim().toLowerCase()}::${Math.floor(Number(amount) || 0)}`;
    }

    /** Returns true if this (recipient, amount) was already attempted for this giveaway. */
    function hasGiftBeenAttempted(giveawayId, recipient, amount) {
        if (!giveawayId) return false;
        const ledger = readPaidGiftsLedger();
        const bucket = ledger[giveawayId];
        if (!bucket) return false;
        return !!bucket[paidGiftKey(recipient, amount)];
    }

    /** Record a (recipient, amount) attempt before actually sending. */
    function recordGiftAttempt(giveawayId, recipient, amount) {
        if (!giveawayId) return;
        const ledger = readPaidGiftsLedger();
        if (!ledger[giveawayId]) ledger[giveawayId] = {};
        ledger[giveawayId][paidGiftKey(recipient, amount)] = Date.now();
        writePaidGiftsLedger(ledger);
    }

    /**
     * Try to send BON using the site's HTTP gift endpoint.
     *
     * Idempotency: if this exact (recipient, amount) has already been attempted
     * for the current giveaway (in this tab, another tab, or a previous session),
     * the call is a no-op. The host can verify in the gift-status column / chat.
     *
     * Fallback policy: we ONLY fall back to /gift when we have strong evidence
     * the server rejected the request without processing it (specific 4xx codes
     * that mean "input/auth was bad"). We do NOT fall back on:
     *   - network errors / aborted requests (server may have processed it)
     *   - 5xx server errors (server may have processed it then failed to respond)
     *   - 408 / 429 (timeout / rate-limit — request may or may not have landed)
     * In those cases we leave it to verifyWinnerGifts to confirm; if verification
     * fails the host gets a warning and can resend manually. Better to under-pay
     * and warn than to over-pay silently.
     */
    function giftBon(recipient, amount, messageText) {
        const safeRecipient = (recipient || "").trim();
        const safeAmount = Math.max(1, Math.floor(Number(amount) || 0));
        const safeMessage = (messageText || "").trim();

        if (!safeRecipient || !safeAmount) {
            return; // nothing to do
        }

        // ── Idempotency check ─────────────────────────────────────────────
        const giveawayId = getActiveGiveawayId();
        if (hasGiftBeenAttempted(giveawayId, safeRecipient, safeAmount)) {
            logEvent(
                "Gift skipped (duplicate)",
                `Already attempted: ${sanitizeNick(safeRecipient)} for ${fmtBON(safeAmount)} BON in this giveaway.`
            );
            return;
        }
        // Record BEFORE sending — if the send half-completes we still want
        // future calls (this tab, another tab, post-restore) to skip.
        recordGiftAttempt(giveawayId, safeRecipient, safeAmount);

        function fallbackToChat() {
            const cmd = safeMessage
                ? `/gift ${safeRecipient} ${safeAmount} ${safeMessage}`
                : `/gift ${safeRecipient} ${safeAmount}`;
            sendMessage(cmd);
        }

        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        const csrfToken = csrfMeta && csrfMeta.content ? csrfMeta.content : null;

        // Resolve the correct gift endpoint for this site

        // Try to infer /users/<slug>/gifts from any visible "/users/" link
        let giftUrl = null;
        const userLink = Array.from(document.querySelectorAll('a[href*="/users/"]'))
        .find(a => a.offsetParent !== null);

        if (userLink) {
            try {
                const url = new URL(userLink.href, location.origin);
                const parts = url.pathname.split("/").filter(Boolean);
                const idx = parts.indexOf("users");
                if (idx !== -1 && parts[idx + 1]) {
                    const slug = parts[idx + 1];
                    const endpointPath = Site.getGiftEndpointPath(slug);
                    giftUrl = endpointPath ? (location.origin + endpointPath) : null;
                }
            } catch (e) {
                giftUrl = null;
            }
        }

        // If we can't resolve the HTTP endpoint or token, fall back immediately.
        // This is safe: we haven't sent anything yet, so /gift is the first attempt.
        if (!csrfToken || !giftUrl) {
            fallbackToChat();
            return;
        }

        const formData = new FormData();
        formData.append("_token", csrfToken);
        formData.append("recipient_username", safeRecipient);

        if (location.hostname === "darkpeers.org") {
            formData.append("type", "bon");
        }

        formData.append("bon", String(safeAmount));
        formData.append("message", safeMessage);

        // Codes that mean "server definitely did not process this gift":
        //   400 bad request, 401 unauthorized, 403 forbidden, 404 not found,
        //   422 unprocessable entity. Safe to fall back to /gift.
        // Notably NOT in this list: 408 (timeout), 429 (rate limit), 5xx,
        // and network errors — for those we trust verifyWinnerGifts to flag
        // any actually-missing gifts.
        const SAFE_FALLBACK_STATUSES = new Set([400, 401, 403, 404, 422]);

        try {
            fetch(giftUrl, {
                method: "POST",
                credentials: "same-origin",
                body: formData
            }).then(function (resp) {
                if (resp && SAFE_FALLBACK_STATUSES.has(resp.status)) {
                    logEvent(
                        "Gift HTTP rejected, falling back",
                        `${sanitizeNick(safeRecipient)} ${fmtBON(safeAmount)} BON | status=${resp.status}`
                    );
                    fallbackToChat();
                } else if (!resp || resp.status >= 400) {
                    // Ambiguous failure — server may or may not have processed it.
                    // Do NOT fall back. verifyWinnerGifts will confirm via chat API
                    // and warn the host if the gift never lands.
                    logEvent(
                        "Gift HTTP ambiguous (no fallback)",
                        `${sanitizeNick(safeRecipient)} ${fmtBON(safeAmount)} BON | status=${resp ? resp.status : "no-response"} | will verify via chat poll`
                    );
                }
            }).catch(function (err) {
                // Network error / abort — request may have reached the server.
                // Do NOT fall back. Log so the host can investigate if verifier flags it.
                logEvent(
                    "Gift HTTP network error (no fallback)",
                    `${sanitizeNick(safeRecipient)} ${fmtBON(safeAmount)} BON | ${err && err.message ? err.message : "unknown error"} | will verify via chat poll`
                );
            });
        } catch (e) {
            // Synchronous throw before the request was dispatched: nothing was sent,
            // so /gift fallback is safe (and matches the original behavior).
            logEvent(
                "Gift HTTP threw synchronously, falling back",
                `${sanitizeNick(safeRecipient)} ${fmtBON(safeAmount)} BON | ${e && e.message ? e.message : "unknown"}`
            );
            fallbackToChat();
        }
    }

    // Chat formatting: use spaces as thousands separators in outgoing messages.
    // (Menu/UI formatting is intentionally left alone.)
    function formatChatNumbersWithSpaces(str) {
        try {
            if (!str) return str;

            const raw = String(str);
            // Quick bailout: nothing that looks like a 4+ digit number or grouped digits.
            if (!/\d{4}/.test(raw) && !/\d{1,3}[,\s'’]\d{3}/.test(raw)) return raw;

            // Protect URL segments and BBCode tags/attributes from numeric formatting.
            // This keeps [tag=...], [url=...], and color hexes untouched.
            const protectedParts = [];
            const protectedText = raw.replace(/\[[^\]]*\]|https?:\/\/[^\s\]]+|#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g, (segment) => {
                const idx = protectedParts.push(segment) - 1;
                return `__BG_PROTECTED_${idx}__`;
            });

            const formatted = protectedText.replace(/\b\d[\d,\s'’]*\d\b/g, (match) => {
                const digits = match.replace(/[^\d]/g, "");
                if (digits.length < 4) return match;
                return digits.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
            });

            return formatted.replace(/__BG_PROTECTED_(\d+)__/g, (_, i) => protectedParts[Number(i)] ?? "");
        } catch {
            return str;
        }
    }
    async function sendPrivateMessage(username, messageStr) {
        const to = String(username || "").trim();
        if (!to) {
            // No target → fall back to normal chat output
            return sendMessage(messageStr);
        }

        let body = String(messageStr ?? "");

        // Preserve the "spaces for thousands separators" behavior in silent mode by applying the
        // formatter to the message body BEFORE we wrap it in /msg (sendMessage skips formatting for slash commands).
        try {
            body = formatChatNumbersWithSpaces(body);
        } catch { /* ignore */ }

        // Avoid newlines which can confuse slash-command parsers
        body = body.replace(/[\r\n]+/g, " ").trim();

        return sendMessage(`/msg ${to} ${body}`);
    }

    async function sendCommandResponse(username, messageStr) {
        if (GENERAL_SETTINGS.silent_mode) {
            return sendPrivateMessage(username, messageStr);
        }
        return sendMessage(messageStr);
    }

    /** Prepare a message for sending: obfuscate "giveaway" and apply number formatting. */
    function prepareOutgoingMessage(messageStr) {
        // Obfuscate "giveaway" in all messages except the intro announcement
        if (!(messageStr.includes("I am hosting a giveaway for") &&
              messageStr.includes("Pick a number between"))) {
            messageStr = obfuscateGiveaway(messageStr);
        }

        // Apply chat-only number formatting (spaces for thousands separators).
        // Never touch slash-commands (e.g., /gift) since the site expects raw digits.
        try {
            const trimmed = String(messageStr || "").trimStart();
            if (!trimmed.startsWith("/")) {
                messageStr = formatChatNumbersWithSpaces(messageStr);
            }
        } catch { /* ignore */ }

        return messageStr;
    }

    /** Try to send via API POST. Returns true on success, false otherwise. */
    async function trySendViaApi(messageStr) {
        if (!OT_USER_ID || !OT_CHATROOM_ID || !OT_CSRF_TOKEN) return false;

        const payload = {
            bot_id: null,
            chatroom_id: Number(OT_CHATROOM_ID),
            message: messageStr,
            receiver_id: null,
            save: true,
            targeted: 0,
            user_id: Number(OT_USER_ID)
        };

        const resp = await fetch(`/api/chat/messages`, {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
                "X-CSRF-TOKEN": OT_CSRF_TOKEN,
                "X-Requested-With": "XMLHttpRequest"
            },
            body: JSON.stringify(payload)
        });

        const respText = await resp.text();
        if (resp.ok) {
            if (DEBUG_SETTINGS.log_chat_messages) console.log(`API send: ${messageStr}`);
            if (DEBUG_SETTINGS.verify_sendmessage) console.debug("sendMessage: API message sent successfully");
            return true;
        }

        try { console.error("API error", JSON.parse(respText)); }
        catch (e) { console.error("API error (raw):", respText); }
        return false;
    }

    /** Legacy fallback: inject message into the chatbox input and simulate Enter. */
    function sendViaChatbox(messageStr) {
        if (!chatbox) return;
        if (DEBUG_SETTINGS.log_chat_messages) console.log(`Fallback send (chatbox): ${messageStr}`);
        if (DEBUG_SETTINGS.verify_sendmessage) console.debug("sendMessage: sending message via chatbox fallback");

        const originalValue = chatbox.value;
        chatbox.value = messageStr;
        chatbox.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

        setTimeout(() => {
            chatbox.value = originalValue;
            if (DEBUG_SETTINGS.verify_sendmessage) console.debug("sendMessage: restored chatbox original value");
        }, 50);
    }

    async function sendMessage(messageStr) {
        messageStr = prepareOutgoingMessage(messageStr);

        if (DEBUG_SETTINGS.disable_chat_output) return;

        if (DEBUG_SETTINGS.verify_sendmessage) console.debug("sendMessage: caching chat context if needed");

        // If cache is missing, try to refresh
        if (!OT_USER_ID || !OT_CHATROOM_ID || !OT_CSRF_TOKEN) cacheChatContext();

        // --- Attempt API POST, fall back to chatbox on failure ---
        if (!DEBUG_SETTINGS.suppressApiMessages) {
            try {
                if (await trySendViaApi(messageStr)) return;
            } catch (e) {
                if (DEBUG_SETTINGS.log_chat_messages) console.warn("API send failed, falling back to chatbox method:", e);
                if (DEBUG_SETTINGS.verify_sendmessage) console.debug("sendMessage: API send failed, falling back to chatbox method");
            }
        }

        sendViaChatbox(messageStr);
    }

    function countdownTimer (display, giveawayData) {
        display.hidden = false;

        const timerID = setInterval(() => {
            const now = Date.now();
            const msLeft = giveawayData.endTs - now;
            giveawayData.timeLeft = Math.max(Math.ceil(msLeft / 1000), 0);

            // update MM:SS
            const m = Math.floor(giveawayData.timeLeft / 60);
            const s = giveawayData.timeLeft % 60;
            display.textContent = String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");

            // finish conditions
            if (giveawayData.timeLeft === 0) return endGiveaway();
            if (numberEntries.size === giveawayData.totalEntries) {
                sendMessage(`All [b][color=#ffc00a]${giveawayData.totalEntries}[/color][/b] slot(s) filled! Ending early with ` +
                            `[b][color=#1DDC5D]${parseTime(msLeft)}[/color][/b] remaining!`);
                return endGiveaway();
            }

            // automatic reminders (based on time *remaining* until end)
            const msToNext = nextReminderMs(giveawayData.reminderSchedule, msLeft);
            if (msToNext !== null && msToNext <= 1000) {
                // Consume this slot so retries (if any) don't double-send.
                if (giveawayData.reminderSchedule && giveawayData.reminderSchedule.length) {
                    giveawayData.reminderSchedule.shift();
                }
                sendReminder();
            }
        }, 1000);

        return timerID;
    }


    // Inserts a zero-width space after the first character
    function sanitizeNick(nick) {
        if (typeof nick !== "string" || nick.length < 2) return nick;
        return nick[0] + "\u200B" + nick.slice(1);
    }

    // Normalize usernames to a stable, case-insensitive key used for comparisons and map keys.
    // - trims whitespace
    // - strips a leading @ (common in mentions)
    // - lowercases
    function normalizeUserKey(name) {
        return String(name || "")
            .trim()
            .replace(/^@+/, "")
            .toLowerCase();
    }

    // Best-effort: derive the logged-in username from the navbar /users/<name> link
    // so it matches what getAuthor() extracts from chat messages.
    function getLoggedInUsername() {
        const navLink = document.querySelector('.top-nav__username a[href*="/users/"]');
        if (navLink) {
            const href = navLink.getAttribute("href") || navLink.href || "";
            const m = href.match(/\/users\/([^/?#]+)/i);
            if (m && m[1]) {
                try { return decodeURIComponent(m[1]); } catch (_) { return m[1]; }
            }
        }

        const t = document.querySelector('.top-nav__username a')?.textContent || "";
        return String(t || "").trim();
    }

    // Returns a set of possible "self" keys (host + logged-in user).
    // We use a set because some sites display a different name than they use in /users/<...> links.
    function resolveSelfKeys(hostName) {
        const keys = new Set();
        const a = normalizeUserKey(hostName);
        if (a) keys.add(a);
        const b = normalizeUserKey(getLoggedInUsername());
        if (b) keys.add(b);
        return keys;
    }

    function obfuscateGiveaway(text) {
        return text.replace(/giveaway/gi, match => {
            return match[0] + "\u200B" + match.slice(1); // g + zero-width + iveaway
        });
    }

    // ───────────────────────────────
    // Persistent stats (localStorage)
    // ───────────────────────────────

    function defaultGiveawayStats() {
        return { version: 1, users: {}, giveaways: [], updatedAt: 0 };
    }


    // Write-behind stats cache (reduces GM/localStorage churn during busy giveaways)
    // - Commands prefer the in-memory cache so results reflect live updates immediately.
    // - Flush happens automatically after a short delay, and is forced on giveaway end/unload.
    const STATS_WRITE_BEHIND_MS = 1500;
    let _statsCache = null;
    let _statsDirty = false;
    let _statsFlushTimer = null;

    function getStatsCached() {
        if (_statsCache) return _statsCache;
        _statsCache = loadGiveawayStats();
        return _statsCache;
    }

    function getStatsForRead() {
        // Prefer in-memory cache so commands reflect latest live updates
        return _statsCache || loadGiveawayStats();
    }

    function scheduleStatsFlush(ms = STATS_WRITE_BEHIND_MS) {
        if (_statsFlushTimer) return;
        _statsFlushTimer = setTimeout(() => {
            _statsFlushTimer = null;
            flushStatsNow();
        }, ms);
    }

    function markStatsDirty() {
        _statsDirty = true;
        scheduleStatsFlush();
    }

    function flushStatsNow() {
        try {
            if (_statsFlushTimer) {
                clearTimeout(_statsFlushTimer);
                _statsFlushTimer = null;
            }
            if (!_statsDirty) return;
            const stats = _statsCache || loadGiveawayStats();
            _statsCache = stats;
            saveGiveawayStats(stats);
            _statsDirty = false;
        } catch {
            // If something goes wrong (or during early init), fail closed.
        }
    }

    function normalizeGiveawayStatsShape(stats) {
        if (!stats || typeof stats !== "object") return defaultGiveawayStats();

        if (!stats.users || typeof stats.users !== "object") stats.users = {};
        if (!Array.isArray(stats.giveaways)) stats.giveaways = [];

        if (typeof stats.version !== "number") stats.version = STATS_VERSION;
        if (typeof stats.updatedAt !== "number") stats.updatedAt = 0;

        return stats;
    }

    function safeParseLocalStorage(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            return obj && typeof obj === "object" ? obj : null;
        } catch {
            return null;
        }
    }

    function safeGetUpdatedAt(obj) {
        const n = obj && typeof obj.updatedAt === "number" ? obj.updatedAt : 0;
        return Number.isFinite(n) ? n : 0;
    }

    function loadGiveawayStats() {
        // Read both locations
        const gmVal = (typeof GM_getValue === "function") ? GM_getValue(STATS_KEY, null) : null;
        const gmObj = (gmVal && typeof gmVal === "object") ? normalizeGiveawayStatsShape(gmVal) : null;

        const lsRaw = safeParseLocalStorage(STATS_KEY);
        const lsObj = lsRaw ? normalizeGiveawayStatsShape(lsRaw) : null;

        // If both missing/corrupt
        if (!gmObj && !lsObj) {
            const fresh = defaultGiveawayStats();
            // Seed both so they stay in sync from day 1
            if (typeof GM_setValue === "function") GM_setValue(STATS_KEY, fresh);
            try { localStorage.setItem(STATS_KEY, JSON.stringify(fresh)); } catch {}
            return fresh;
        }

        // Choose the newest
        const gmUpdated = safeGetUpdatedAt(gmObj);
        const lsUpdated = safeGetUpdatedAt(lsObj);
        const best = (gmUpdated >= lsUpdated) ? (gmObj || lsObj) : (lsObj || gmObj);

        // Heal the other side if needed
        if (best) {
            if (!gmObj || gmUpdated < safeGetUpdatedAt(best)) {
                if (typeof GM_setValue === "function") GM_setValue(STATS_KEY, best);
            }
            if (!lsObj || lsUpdated < safeGetUpdatedAt(best)) {
                try { localStorage.setItem(STATS_KEY, JSON.stringify(best)); } catch {}
            }
            return best;
        }

        // Absolute fallback
        return defaultGiveawayStats();
    }

    function saveGiveawayStats(stats) {
        if (!stats || typeof stats !== "object") return;
        stats.updatedAt = Date.now();

        // Write GM
        if (typeof GM_setValue === "function") {
            GM_setValue(STATS_KEY, stats);
        }

        // Write localStorage
        try {
            localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        } catch {
            // If LS quota is exceeded or blocked, we still at least have GM storage.
        }
    }

    function sumSponsorContribs(contribs, hostName) {
        if (!contribs || typeof contribs !== "object") return 0;
        const hostKey = hostName ? normUserKey(hostName) : null;

        let sum = 0;
        for (const [name, v] of Object.entries(contribs)) {
            if (hostKey && normUserKey(name) === hostKey) continue; // ignore host self-gifting
            sum += Math.max(0, Math.floor(Number(v) || 0));
        }
        return sum;
    }

    function normUserKey(name) {
        // Back-compat alias used throughout the script. Keep behavior consistent with normalizeUserKey().
        return normalizeUserKey(name);
    }

    function getOrCreateUserStats(stats, username) {
        const key = normUserKey(username);
        if (!key) return null;

        if (!stats.users[key]) {
            stats.users[key] = {
                name: String(username || "").trim() || key,
                entered: 0,
                wins: 0,
                losses: 0,
                totalWon: 0,
                biggestWin: 0,
                sponsoredTotal: 0,
                sponsorCount: 0,
                biggestSponsor: 0,
                hosted: 0,
                hostedTotal: 0,
                lastSeenAt: 0,
                sponsorReceivedTotal: 0
            };
        } else if (username) {
            // keep most recently seen casing
            stats.users[key].name = String(username).trim() || stats.users[key].name;
        }
        return stats.users[key];
    }
    function recordLiveEntry(username) {
        const key = normUserKey(username);
        if (!key) return;
        if (liveEnteredThisGiveaway.has(key)) return;

        liveEnteredThisGiveaway.add(key);

        const stats = getStatsCached();
        const rec = getOrCreateUserStats(stats, username);
        if (!rec) return;

        rec.entered = (rec.entered || 0) + 1;
        rec.lastSeenAt = Date.now();

        markStatsDirty();
    }

    function recordLiveSponsorGift(gifter, amount) {
        const key = normUserKey(gifter);
        const delta = Math.max(0, Math.floor(Number(amount) || 0));
        if (!key || !delta) return;

        // track running total for "biggestSponsor" per giveaway
        const prevTotal = liveSponsorTotalThisGiveaway.get(key) || 0;
        const nowTotal = prevTotal + delta;
        liveSponsorTotalThisGiveaway.set(key, nowTotal);

        const stats = getStatsCached();
        const rec = getOrCreateUserStats(stats, gifter);
        if (!rec) return;

        rec.sponsoredTotal = (rec.sponsoredTotal || 0) + delta;

        // Count “how many giveaways they sponsored” once per giveaway
        if (!liveSponsorSeenThisGiveaway.has(key)) {
            liveSponsorSeenThisGiveaway.add(key);
            rec.sponsorCount = (rec.sponsorCount || 0) + 1;
        }

        // biggestSponsor = biggest total they added in any single giveaway
        rec.biggestSponsor = Math.max(rec.biggestSponsor || 0, nowTotal);

        rec.lastSeenAt = Date.now();
        markStatsDirty();
    }

    function recordGiveawayStats(giveawayData, winners, allocated, entriesMap) {
        if (!giveawayData) return;

        const stats = getStatsCached();
        const now = Date.now();

        // Giveaway totals (for host stats + !largest)
        const potTotal = Math.max(0, Math.floor(Number(giveawayData.amount) || 0));

        // Total non-host sponsor BON for this giveaway (exclude host self-gifting)
        const sponsorTotal = sumSponsorContribs(giveawayData.sponsorContribs, giveawayData.host);

        // Prefer explicit hostAdded (new behavior)
        let hostOnly = giveawayData.hostAdded;
        hostOnly = Number.isFinite(hostOnly) ? Math.max(0, Math.floor(hostOnly)) : null;

        // Back-compat fallback for older giveaways that don’t have hostAdded saved
        if (hostOnly === null) {
            hostOnly = Math.max(0, potTotal - sponsorTotal);
        }

        // Record giveaway history (per-site) for !largest
        try {
            if (!Array.isArray(stats.giveaways)) stats.giveaways = [];
            stats.giveaways.push({
                amount: potTotal,
                host: String(giveawayData.host || "").trim(),
                hostOnly,
                sponsorTotal,
                winners: Array.isArray(winners) ? winners.length : 0,
                entries: entriesMap ? entriesMap.size : 0,
                endedAt: now,
                endedDate: (new Date(now)).toLocaleDateString("en-CA")
            });

            const MAX_HISTORY = 250;
            if (stats.giveaways.length > MAX_HISTORY) {
                stats.giveaways = stats.giveaways.slice(-MAX_HISTORY);
            }
        } catch (e) { /* ignore */ }

        // Host tracking
        const hostRec = getOrCreateUserStats(stats, giveawayData.host);
        if (hostRec) {
            hostRec.hosted = (hostRec.hosted || 0) + 1;

            // Host pot only (excludes sponsors)
            hostRec.hostedTotal = (hostRec.hostedTotal || 0) + hostOnly;

            // Total sponsor BON the host has received across hosted giveaways
            if (sponsorTotal > 0) {
                hostRec.sponsorReceivedTotal = (hostRec.sponsorReceivedTotal || 0) + sponsorTotal;
            }

            hostRec.lastSeenAt = now;
        }

        // Sponsors (per giveaway; uses sponsorContribs totals)
        if (giveawayData.sponsorContribs && typeof giveawayData.sponsorContribs === "object") {
            for (const [sponsor, amt] of Object.entries(giveawayData.sponsorContribs)) {
                const finalTotal = Math.max(0, Math.floor(Number(amt) || 0));
                if (!sponsor || !finalTotal) continue;

                const sKey = normUserKey(sponsor);
                const alreadyCounted = liveSponsorTotalThisGiveaway.get(sKey) || 0;
                const delta = Math.max(0, finalTotal - alreadyCounted);

                const rec = getOrCreateUserStats(stats, sponsor);
                if (!rec) continue;

                if (delta > 0) rec.sponsoredTotal += delta;

                if (!liveSponsorSeenThisGiveaway.has(sKey)) {
                    rec.sponsorCount += 1;
                }

                rec.biggestSponsor = Math.max(rec.biggestSponsor || 0, finalTotal);
                rec.lastSeenAt = now;
            }
        }

        // Winners + payouts
        const winKeySet = new Set((winners || []).map(w => normUserKey(w.author)));
        const payoutByKey = new Map();

        (winners || []).forEach((w, i) => {
            const key = normUserKey(w.author);
            const pay = Math.max(0, Math.floor(Number((allocated || [])[i]) || 0));
            if (!key) return;
            payoutByKey.set(key, (payoutByKey.get(key) || 0) + pay);
        });

        // Participants
        const participants = entriesMap ? Array.from(entriesMap.keys()) : [];
        participants.forEach(name => {
            const rec = getOrCreateUserStats(stats, name);
            if (!rec) return;

            const uKey = normUserKey(name);

            if (!liveEnteredThisGiveaway.has(uKey)) {
                rec.entered += 1;
            }

            if (winKeySet.has(uKey)) {
                rec.wins += 1;
                const pay = payoutByKey.get(uKey) || 0;
                rec.totalWon += pay;
                rec.biggestWin = Math.max(rec.biggestWin || 0, pay);
            } else {
                rec.losses += 1;
            }
            rec.lastSeenAt = now;
        });

        markStatsDirty();
        flushStatsNow();

    }

    function getLeaderboardRows(sorter, topN, filterFn) {
        const stats = getStatsForRead();
        const users = Object.values(stats.users || {})
        .filter(u => u && typeof u === "object")
        .filter(u => (filterFn ? filterFn(u) : true))
        .sort(sorter);

        return users.slice(0, topN);
    }

    function fmtBON(value) {
        let n;
        if (typeof value === "number") {
            n = Math.max(0, Math.floor(value));
        } else {
            const digitsOnly = String(value ?? "").replace(/[^\d]/g, "");
            n = Number.isNaN(parseInt(digitsOnly || "0", 10)) ? 0 : parseInt(digitsOnly || "0", 10);
        }
        return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    }

    function safeNameForChat(name) {
        return sanitizeNick(String(name || "").trim());
    }


    // Small helper for rig-mode suffixes
    function rigNote(inner) {
        if (!riggedMode) return "";

        // Extract trailing emoji(s) or punctuation like "😈", "👀", "😏"
        // This catches anything NOT in parentheses.
        const match = inner.match(/^(.*?)(\s*[^\w\s\)\(]+)?$/);
        const text = match[1].trim(); // "(entry logged ... conditions)"
        const trailing = (match[2] || "").trim(); // "😈" or "👀" or empty

        return ` [i][color=#FF4F9A]${text}[/color][/i]${trailing ? " " + trailing : ""}`;
    }




    // Small helper for silent-mode suffixes (only for public announcements)
    function silentNote(inner) {
        if (!GENERAL_SETTINGS.silent_mode) return "";

        // Extract trailing emoji(s) or punctuation like "🤫"
        const match = inner.match(/^(.*?)(\s*[^\w\s\)\(]+)?$/);
        const text = match[1].trim();
        const trailing = (match[2] || "").trim();

        return ` [i][color=#999999]${text}[/color][/i]${trailing ? " " + trailing : ""}`;
    }

    // Fun denial message when non-hosts try to use !rig / !unrig (rate-limited per user)
    function maybeSendRigDeny(author, safeAuthor, action) {
        const now = Date.now();
        const nextOk = rigDenyCooldown.get(author) || 0;
        if (now < nextOk) return;
        rigDenyCooldown.set(author, now + RIG_DENY_COOLDOWN_MS);

        const who = `[color=#d85e27]${safeAuthor}[/color]`;

        const linesRig = [
            `🛑 Nice try ${who}. The Rigging Lever™ is behind host-only glass.`,
            `🚨 Unauthorized rig attempt by ${who}. Deploying the Fairness Police…`,
            `${who} tried to rig the giveaway. The universe said: “lol, no.”`,
            `Sorry ${who} — only the host has a license to operate the Rig-O-Matic™.`
        ];

        const linesUnrig = [
            `Hold up ${who}… you can’t unrig what you never rigged.`,
            `🚫 Access denied, ${who}. The “Unrig” button is guarded by a tiny, angry moderator.`,
            `Nice try ${who}. Only the host can turn off the Chaos Generator™.`,
            `${who} reached for the unrig switch… and touched nothing but air.`
        ];

        const pool = (action === "unrig") ? linesUnrig : linesRig;
        const msg = pool[Math.floor(Math.random() * pool.length)];
        sendCommandResponse(author, msg);
    }

    function updateRigToggleUI() {
        if (!rigToggleInput) return;

        rigToggleInput.disabled = false;
        rigToggleInput.checked = !!riggedMode;
        rigToggleInput.title = riggedMode
            ? "Rigged mode is ON (cosmetic only). Click to disable."
        : "Rigged mode is OFF (cosmetic only). Click to enable.";
    }

    function fmtUserList(arr) {
        return arr.map(n => `[b]${sanitizeNick(n)}[/b]`).join(", ");
    }

    // Safely read the host's BON balance from the page, regardless of locale separators
    function readHostBalance() {
        try {
            const points = document.getElementsByClassName("ratio-bar__points")[0];
            if (!points || !points.firstElementChild) return 0;
            const raw = points.firstElementChild.textContent || "";
            // remove everything that isn't a digit: spaces, commas, dots, apostrophes, etc.
            const digitsOnly = raw.replace(/[^\d]/g, "");
            const n = parseInt(digitsOnly, 10);
            return Number.isNaN(n) ? 0 : n;
        } catch {
            return 0;
        }
    }
    // ---- Live BON balance refresh (no page reload) ----
    // Some UNIT3D pages don't live-update the ratio bar when BON changes.
    // For host-only funding checks (start / !addbon), we pull a fresh snapshot via background fetch.
    const BON_BALANCE_FETCH_MAX_AGE_MS = 1200; // cache window to avoid spam-click bursts
    const BON_BALANCE_FETCH_TIMEOUT_MS = 7000;

    let bonBalanceFetchCache = {
        value: null,     // number | null
        fetchedAt: 0,    // ms
        inFlight: null   // Promise<number|null> | null
    };

    function parseBonBalanceFromDocument(doc) {
        try {
            const points = doc?.querySelector?.(".ratio-bar__points");
            if (!points) return null;

            // use full textContent (covers sites/themes that don't have a single child)
            const raw = (points.textContent || "").trim();
            const digitsOnly = raw.replace(/[^\d]/g, "");
            if (!digitsOnly) return null;

            const n = parseInt(digitsOnly, 10);
            return Number.isNaN(n) ? null : n;
        } catch {
            return null;
        }
    }

    async function fetchFreshBonBalance({ maxAgeMs = BON_BALANCE_FETCH_MAX_AGE_MS, timeoutMs = BON_BALANCE_FETCH_TIMEOUT_MS } = {}) {
        const now = Date.now();

        // Reuse a recent value
        if (bonBalanceFetchCache.value != null && (now - bonBalanceFetchCache.fetchedAt) <= maxAgeMs) {
            return bonBalanceFetchCache.value;
        }

        // Reuse an in-flight request
        if (bonBalanceFetchCache.inFlight) return bonBalanceFetchCache.inFlight;

        bonBalanceFetchCache.inFlight = (async () => {
            try {
                // Home page usually includes the top nav ratio bar on UNIT3D installs.
                // If a particular theme/routeset doesn't, fall back to the current page.
                const tryUrls = [
                    new URL("/", location.origin),
                    new URL(location.pathname, location.origin)
                ];

                let n = null;

                for (const url of tryUrls) {
                    const res = await fetchWithTimeout(url, {
                        credentials: "include",
                        cache: "no-store",
                        headers: { "Accept": "text/html" }
                    }, timeoutMs);

                    if (!res.ok) continue;

                    const html = await res.text();
                    const doc = new DOMParser().parseFromString(html, "text/html");
                    n = parseBonBalanceFromDocument(doc);

                    if (n != null) break;
                }

                if (n != null) {
                    bonBalanceFetchCache.value = n;
                    bonBalanceFetchCache.fetchedAt = Date.now();
                }

                return n;
            } catch {
                return null;
            } finally {
                bonBalanceFetchCache.inFlight = null;
            }
        })();

        return bonBalanceFetchCache.inFlight;
    }

    /**
     * Get the host BON balance.
     * - requireServer=true: only return a value if we successfully fetched/parsing server HTML (safest for funding checks).
     * - requireServer=false: fallback to DOM if fetch fails.
     */
    async function getVerifiedHostBalance({ requireServer = false, maxAgeMs = BON_BALANCE_FETCH_MAX_AGE_MS } = {}) {
        const fresh = await fetchFreshBonBalance({ maxAgeMs });

        if (typeof fresh === "number" && Number.isFinite(fresh) && fresh >= 0) return fresh;

        if (requireServer) return null;

        const dom = readHostBalance();
        return (typeof dom === "number" && Number.isFinite(dom)) ? dom : 0;
    }



    function ordinal(n){
        const rem100 = n % 100;
        if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
        switch (n % 10){
            case 1: return `${n}st`;
            case 2: return `${n}nd`;
            case 3: return `${n}rd`;
            default: return `${n}th`;
        }
    }

    function getLuckyNumber(giveawayData) {
        // Returns a FREE number centered in the largest gap (or null if none left).
        const start = giveawayData.startNum;
        const end = giveawayData.endNum;

        // Unique + sorted taken list
        const taken = Array.from(new Set(numberEntries.values()))
        .filter(n => Number.isFinite(n))
        .sort((a, b) => a - b);

        let bestLen = 0;
        let bestPick = null;

        // Sentinel at the end so the final gap is considered
        const boundaries = taken.concat([end + 1]);

        let prev = start - 1;
        for (const current of boundaries) {
            // Free interval: (prev, current) => [prev+1 .. current-1]
            const freeLen = current - prev - 1;
            if (freeLen > bestLen) {
                // Pick the center-left number of the free interval
                bestLen = freeLen;
                bestPick = prev + 1 + Math.floor((freeLen - 1) / 2);
            }
            prev = current;
        }

        if (!bestPick || bestLen <= 0) return null;

        // Clamp just in case
        if (bestPick < start) bestPick = start;
        if (bestPick > end) bestPick = end;

        return bestPick;
    }




    function cleanPotString(giveawayPotAmount) {
        // Always returns a number. Rounds to integer if whole, otherwise keeps 2 decimals.
        const n = Number(giveawayPotAmount) || 0;
        return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
    }

    function parseTime(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        const parts = [];
        if (hours) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
        if (minutes) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
        if (seconds) parts.push(`${seconds} second${seconds > 1 ? 's' : ''}`);
        return parts.join(", ");
    }
    function getChatMsgText(msgNode) {
        const raw = (Site.getMessageContentElement(msgNode)?.textContent || "");
        // Remove zero-width obfuscation chars so regex/includes work reliably
        return raw.replace(/[\u200B\u200C\u200D\uFEFF]/g, "").trim();
    }


    function totalMinutes () {
        const t = parseInt(String(timerInput?.value ?? ""), 10);
        return (Number.isFinite(t) && t > 0) ? t : 0;
    }

    function nextReminderMs(schedule, msLeft) {
        if (!schedule || !schedule.length) return null;

        // Drop reminders we've clearly passed (more than ~1s behind us)
        // e.g. if the tab was suspended or the host adjusted the end time.
        while (schedule.length && msLeft < schedule[0] - 1000) {
            schedule.shift();
        }
        if (!schedule.length) return null;

        // Next upcoming reminder triggers when msLeft shrinks down to schedule[0].
        // msToNext is positive before we reach it, ~0 around the tick it fires,
        // and negative if we're a little bit late.
        return msLeft - schedule[0];
    }

    // Returns [maxReminders, minInterval (in min)]
    function getReminderLimits(totalMinutes) {
        const MIN_INTERVAL = 5; // 5 min between reminders
        if (totalMinutes < MIN_INTERVAL) return [0, null];
        let max = Math.floor(totalMinutes / MIN_INTERVAL);
        return [max, MIN_INTERVAL];
    }

    // Returns [N reminders] timestamps (ms before end) evenly spaced
    function getReminderSchedule(totalMinutes, numReminders) {
        if (numReminders < 1) return [];
        const interval = totalMinutes / (numReminders + 1);
        return Array.from({length: numReminders}, (_,i) =>
                          Math.round((totalMinutes - (i + 1) * interval) * 60_000)
                         );
    }

    function shouldSendReminder(giveawayData) {
        // Look at a small recent window to avoid duplicate reminders.
        const messages = Array.from(document.querySelectorAll('.chatbox-message'));

        for (let i = messages.length - 1; i >= Math.max(messages.length - 7, 0); i--) {
            const msgNode = messages[i];
            const author = getAuthor(msgNode);
            const text = getChatMsgText(msgNode);

            if (
                author === giveawayData.host &&
                text.includes("Gift the host to add to the pot")
            ) {
                return false; // Recent visible reminder by host exists
            }
        }
        return true;
    }

    // Live sync reminder number field with allowed max/min and show interval
    function syncReminderNumUI() {
        if (!giveawayForm) return;
        const totMin = totalMinutes();
        const [maxRem, minInterval] = getReminderLimits(totMin);

        remNumInput.max = maxRem;
        remNumInput.min = 0;

        // Clamp to allowed range
        if (Number(remNumInput.value) > maxRem) remNumInput.value = maxRem;
        if (Number(remNumInput.value) < 0) remNumInput.value = 0;

        // Show interval in "Every" field
        if (Number(remNumInput.value) > 0) {
            const interval = totMin / (Number(remNumInput.value) + 1);
            reminderEvery.value = interval.toFixed(2).replace(/\.00$/,"") + " min";
        } else {
            reminderEvery.value = "–";
        }
        const label = giveawayForm.querySelector('label[for="reminderNum"]');
        if (label) {
            label.textContent = "# Reminders" + (maxRem ? ` (max ${maxRem})` : '');
        }
    }

    function cacheChatContext() {
        OT_USER_ID = null;
        OT_CHATROOM_ID = null;
        OT_CSRF_TOKEN = null;

        if (DEBUG_SETTINGS.verify_cacheChatContext) {
            console.debug("cacheChatContext: starting cache refresh");
        }

        // Try oldtoons (#chatbody[x-data]) first
        const section = document.querySelector('section#chatbody[x-data]');
        if (section) {
            try {
                const raw = section.getAttribute('x-data');
                if (DEBUG_SETTINGS.verify_cacheChatContext) {
                    console.debug("cacheChatContext: found x-data attribute:", raw);
                }
                // Extract the substring 'JSON.parse(...)' from raw
                const jsonParseMatch = raw.match(/JSON\.parse\((['"])([\s\S]*?)\1\)/);
                if (jsonParseMatch) {
                    let jsonContent = jsonParseMatch[2]; // the JSON string inside the quotes
                    if (DEBUG_SETTINGS.verify_cacheChatContext) {
                        console.debug("cacheChatContext: extracted JSON content:", jsonContent);
                    }
                    try {
                        // The x-data attribute contains JavaScript-escaped strings (\x7B, \x22, \\, \/, etc.)
                        // that JSON.parse can't handle directly. Decode JS escapes in a single pass so that
                        // \\ is consumed before \uNNNN — matching how JS string literal parsing works.
                        jsonContent = jsonContent.replace(
                            /\\(u[0-9A-Fa-f]{4}|x[0-9A-Fa-f]{2}|\\|'|\/|n|r|t|b|f)/g,
                            (_, esc) => {
                                if (esc[0] === 'u') return String.fromCharCode(parseInt(esc.slice(1), 16));
                                if (esc[0] === 'x') return String.fromCharCode(parseInt(esc.slice(1), 16));
                                const simple = { '\\': '\\', "'": "'", '/': '/', 'n': '\n', 'r': '\r', 't': '\t', 'b': '\b', 'f': '\f' };
                                return simple[esc] || esc;
                            }
                        );

                        const jsonData = JSON.parse(jsonContent);
                        if (jsonData) {
                            OT_USER_ID = Number(jsonData.id);
                            OT_CHATROOM_ID = Number(jsonData.chatroom_id);
                        }
                    } catch (e) {
                        if (DEBUG_SETTINGS.verify_cacheChatContext) {
                            console.debug("cacheChatContext: error parsing JSON content", e);
                        }
                    }
                } else {
                    if (DEBUG_SETTINGS.verify_cacheChatContext) {
                        console.debug("cacheChatContext: JSON.parse(...) pattern not found in x-data");
                    }
                }
            } catch (e) {
                if (DEBUG_SETTINGS.verify_cacheChatContext) {
                    console.debug("cacheChatContext: error reading x-data attribute", e);
                }
            }
        }

        // CSRF token
        const xsrfToken = document.querySelector('meta[name=csrf-token]')?.content ||
              window?.CSRF_TOKEN ||
              (document.cookie.match(/XSRF-TOKEN=([^;]+)/)?.[1] || "");
        OT_CSRF_TOKEN = xsrfToken ? decodeURIComponent(xsrfToken) : "";

        if (DEBUG_SETTINGS.verify_cacheChatContext) {
            console.debug("cacheChatContext: final OT_CSRF_TOKEN =", OT_CSRF_TOKEN ? "[token present]" : "[token missing]");
        }
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 13: Menu Field Scaling and Validation
    // ───────────────────────────────────────────────────────────
    function reminderAutoScaling() {
        const totMin = totalMinutes();
        const [maxRem] = getReminderLimits(totMin);

        // Only auto-set if the reminders field isn't focused or is empty/zero
        // (so we don't overwrite intentional user edits)
        if (
            document.activeElement !== remNumInput ||
            remNumInput.value === "" ||
            remNumInput.value === "0"
        ) {
            remNumInput.value = maxRem;
        }

        syncReminderNumUI();
    }

    function entryRangeValidation() {
        const startVal = startInput.value.trim();
        const endVal = endInput.value.trim();

        // Allow optional negative sign followed by digits (no letters)
        const integerRegex = /^-?\d+$/;

        // Clear previous custom validity messages
        startInput.setCustomValidity("");
        endInput.setCustomValidity("");

        // Check for any letters in the inputs
        const lettersRegex = /[A-Za-z]/;

        if (lettersRegex.test(startVal) || lettersRegex.test(endVal)) {
            startInput.setCustomValidity("Letters are not allowed—please enter valid integers.");
            endInput.setCustomValidity("Letters are not allowed—please enter valid integers.");
            return false;
        }

        // Ensure the inputs match the integer pattern
        if (
            !integerRegex.test(startVal) ||
            !integerRegex.test(endVal)
        ) {
            startInput.setCustomValidity("Please enter valid integers (e.g., -5, 0, 10).");
            endInput.setCustomValidity("Please enter valid integers (e.g., -5, 0, 10).");
            return false;
        }

        const startNum = parseInt(startVal, 10);
        const endNum = parseInt(endVal, 10);

        // Check for NaN just in case
        if (isNaN(startNum) || isNaN(endNum)) {
            startInput.setCustomValidity("Please enter numbers only.");
            endInput.setCustomValidity("Please enter numbers only.");
            return false;
        }

        // Ensure start is not greater than end
        if (startNum > endNum) {
            endInput.setCustomValidity("End # should be greater than or equal to Start #.");
            return false;
        }

        return true;
    }

    function winnersValidation() {
        winnersInput.setCustomValidity("");
        const val = parseInt(winnersInput.value, 10);
        if (isNaN(val) || val < 1 || val > MAX_WINNERS) {
            winnersInput.setCustomValidity(`Please choose between 1 and ${MAX_WINNERS} winners.`);
            winnersInput.reportValidity();
            updateStartButtonState();
            return false;
        }
        validateMaxScaledWinnersInput({ forceMessage: !!(scaleWinnersToggleInput && scaleWinnersToggleInput.checked) });
        return true;
    }

    function getClampedMaxScaledWinnersValue(baseWinners) {
        const safeBase = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(baseWinners) || 1)));
        const raw = Number(maxScaledWinnersInput && maxScaledWinnersInput.value);
        const parsed = Number.isFinite(raw) ? Math.floor(raw) : safeBase;
        return Math.max(safeBase, Math.min(parsed, MAX_WINNERS));
    }

    function setMaxScaledWinnersError(message = "") {
        if (maxScaledWinnersError) {
            maxScaledWinnersError.textContent = message;
            maxScaledWinnersError.classList.toggle("visible", !!message);
        }

        if (maxScaledWinnersInput) {
            maxScaledWinnersInput.classList.toggle("input-invalid", !!message);
            maxScaledWinnersInput.setCustomValidity(message ? "Invalid max winners." : "");
        }
    }

    function getMaxScaledWinnersValidation(baseWinners, rawValue) {
        const raw = String(rawValue ?? "").trim();
        const rangeMsg = `Must be between ${fmtBON(baseWinners)} and ${fmtBON(MAX_WINNERS)}.`;

        if (!raw) return { valid: false, message: rangeMsg };
        if (!/^-?\d+$/.test(raw)) return { valid: false, message: `Enter an integer. ${rangeMsg}` };

        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed)) return { valid: false, message: rangeMsg };
        if (parsed < baseWinners || parsed > MAX_WINNERS) return { valid: false, message: rangeMsg };

        return { valid: true, value: parsed, message: "" };
    }

    function updateStartButtonState() {
        if (!startButton || !scaleWinnersToggleInput || !maxScaledWinnersInput) return;
        if (startButton.textContent !== "Start") return;

        const requiresValidMax = !!scaleWinnersToggleInput.checked;
        const invalidMax = requiresValidMax && maxScaledWinnersInput.classList.contains("input-invalid");
        startButton.disabled = invalidMax;
    }

    function validateMaxScaledWinnersInput(options = {}) {
        if (!maxScaledWinnersInput || !winnersInput) return true;

        const { forceMessage = false } = options;
        const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(winnersInput.value) || 1)));
        maxScaledWinnersInput.min = String(baseWinners);

        if (scaleWinnersToggleInput && !scaleWinnersToggleInput.checked) {
            setMaxScaledWinnersError("");
            updateStartButtonState();
            return true;
        }

        const raw = String(maxScaledWinnersInput.value ?? "");
        const validation = getMaxScaledWinnersValidation(baseWinners, raw);
        if (!validation.valid) {
            setMaxScaledWinnersError(forceMessage ? validation.message : "");
            updateStartButtonState();
            return false;
        }

        maxScaledWinnersRawValue = String(validation.value);
        if (String(maxScaledWinnersInput.value) !== maxScaledWinnersRawValue) {
            maxScaledWinnersInput.value = maxScaledWinnersRawValue;
        }

        setMaxScaledWinnersError("");
        updateStartButtonState();
        return true;
    }

    function handleMaxScaledWinnersInput() {
        if (!maxScaledWinnersInput) return;
        maxScaledWinnersRawValue = String(maxScaledWinnersInput.value ?? "");

        validateMaxScaledWinnersInput({ forceMessage: false });

        if (maxScaledWinnersDebounceTimer) clearTimeout(maxScaledWinnersDebounceTimer);
        maxScaledWinnersDebounceTimer = setTimeout(() => {
            validateMaxScaledWinnersInput({ forceMessage: true });
        }, 350);
    }

    function updateScaleWinnersControls() {
        if (!scaleWinnersToggleInput || !maxScaledWinnersInput || !winnersInput) return;
        const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(winnersInput.value) || 1)));
        maxScaledWinnersInput.min = String(baseWinners);
        if (!maxScaledWinnersInput.value) {
            maxScaledWinnersInput.value = String(baseWinners);
            maxScaledWinnersRawValue = String(baseWinners);
        }

        const showMaxScaled = !!scaleWinnersToggleInput.checked;
        if (maxScaledWinnersGroup) {
            maxScaledWinnersGroup.style.display = showMaxScaled ? "block" : "none";
        }
        if (scaleBonPerWinnerGroup) {
            scaleBonPerWinnerGroup.style.display = showMaxScaled ? "block" : "none";
        }
        if (scaleBonPerWinnerInput) {
            scaleBonPerWinnerInput.disabled = !showMaxScaled || !!scaleWinnersToggleInput.disabled;
        }

        maxScaledWinnersInput.disabled = !showMaxScaled || !!scaleWinnersToggleInput.disabled;
        validateMaxScaledWinnersInput({ forceMessage: showMaxScaled });
        bonPerWinnerManuallyEdited = false;
        syncBonPerWinnerValue();
        fitSettingsMenuHeight();
    }

    /** Auto-populate the BON/Winner field with the calculated threshold (unless manually edited). */
    function syncBonPerWinnerValue() {
        if (!scaleBonPerWinnerInput || !coinInput || !winnersInput) return;
        if (bonPerWinnerManuallyEdited) return;

        const rawAmount = String(coinInput.value || "").replace(/[^0-9]/g, "");
        const amount = parseInt(rawAmount, 10);
        const winners = parseInt(winnersInput.value, 10);

        if (Number.isFinite(amount) && amount > 0 && Number.isFinite(winners) && winners > 0) {
            const auto = Math.max(1, Math.floor(amount / winners));
            scaleBonPerWinnerInput.value = String(auto);
        } else {
            scaleBonPerWinnerInput.value = "";
        }
    }

    function getGiftSyntaxHostName() {
        const activeHost = giveawayData && giveawayData.host ? String(giveawayData.host).trim() : "";
        if (activeHost) return activeHost;
        const loggedIn = String(getLoggedInUsername() || "").trim();
        return loggedIn || "HOSTNAME";
    }

    function syncWinnersDisplayValue(effective) {
        const safe = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(effective) || 1)));
        pendingEffectiveWinnersDisplay = safe;
        if (winnersInput) {
            winnersInput.value = String(safe);
            winnersInput.dataset.displayMode = "effective";
        }
    }

    function recomputeEffectiveWinners(data) {
        if (!data) return 1;

        const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(data.baseWinnersAtStart || data.winnersNum) || 1)));
        data.baseWinnersAtStart = baseWinners;

        const hardMax = MAX_WINNERS;
        const configuredMax = Math.max(baseWinners, Math.min(Math.floor(Number(data.hostMaxScaledWinners) || baseWinners), hardMax));
        data.hostMaxScaledWinners = configuredMax;

        let effective = baseWinners;
        if (data.scaleWinnersWithSponsors) {
            const baseBonPerWinner = getScalingBonPerWinner(data);
            const totalContribForScaling = getTotalContribForScaling(data);
            const extraWinnersFromSponsors = Math.floor(totalContribForScaling / baseBonPerWinner);
            const scaledWinners = baseWinners + extraWinnersFromSponsors;
            effective = Math.max(1, Math.min(scaledWinners, Math.min(configuredMax, hardMax)));
        }

        data.effectiveWinnersNum = effective;
        if (data === giveawayData) syncWinnersDisplayValue(effective);
        return effective;
    }

    function getHostAddedDuringGiveaway(data) {
        if (!data) return 0;
        const hostAddedTotal = Math.max(0, Math.floor(Number(data.hostAdded) || 0));
        const initialPotVerified = Math.max(0, Math.floor(Number(data.initialPotVerifiedAtStart) || 0));
        return Math.max(0, hostAddedTotal - initialPotVerified);
    }

    function getTotalContribForScaling(data) {
        if (!data) return 0;
        const totalSponsored = Math.max(0, Math.floor(sumSponsorContribs(data.sponsorContribs, data.host) || 0));
        return totalSponsored + getHostAddedDuringGiveaway(data);
    }

    /** Returns the effective BON-per-extra-winner threshold, using custom value if set. */
    function getScalingBonPerWinner(data) {
        if (!data) return 1;
        // Use custom threshold if explicitly set
        if (data.scaleBonPerWinner && Number.isFinite(data.scaleBonPerWinner) && data.scaleBonPerWinner > 0) {
            return Math.max(1, Math.floor(data.scaleBonPerWinner));
        }
        // Auto-calculate from initial pot / base winners
        const baseWinners = Math.max(1, Math.floor(Number(data.baseWinnersAtStart || data.winnersNum) || 1));
        const initialPotVerified = Math.max(0, Math.floor(Number(data.initialPotVerifiedAtStart) || 0));
        return Math.max(1, Math.floor(initialPotVerified / baseWinners));
    }

    function initializeScaledWinnersAnnouncementState(data) {
        if (!data) return;
        const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(data.baseWinnersAtStart || data.winnersNum) || 1)));
        data.lastAnnouncedWinners = Math.max(
            baseWinners,
            Math.floor(Number(data.effectiveWinnersNum || baseWinners) || baseWinners)
        );
    }

    function buildWinnersAnnouncementLine(data, options = {}) {
        const winnersBase = Math.max(1, Math.floor(Number(data?.baseWinnersAtStart || data?.winnersNum) || 1));
        // Show the effective winner count (accounts for scaling) — never capped by current entrants
        const winnersNow = Math.max(1, Math.floor(Number(data?.effectiveWinnersNum) || winnersBase));
        let line = `[b][color=#5DE2E7]${winnersNow} possible ${winnersNow === 1 ? 'winner' : 'winners'}[/color][/b]`;

        if (data && data.scaleWinnersWithSponsors) {
            const maxWinners = Math.max(winnersBase, Math.min(Math.floor(Number(data.hostMaxScaledWinners) || winnersBase), MAX_WINNERS));
            line += ` (up to [b][color=#5DE2E7]${maxWinners}[/color][/b])`;
        }

        return line;
    }

    function isCurrentUserGiveawayHost() {
        const navDisplayName = document.getElementsByClassName("top-nav__username")[0]?.children?.[0]?.textContent || "";
        const selfNames = [getLoggedInUsername(), navDisplayName].map((name) => normUserKey(name)).filter(Boolean);
        if (!selfNames.length) return false;

        const hostKey = normUserKey(giveawayData?.host) || lastKnownGiveawayHostKey;
        if (hostKey) return selfNames.some((name) => name === hostKey);
        // No active/known host yet: default to showing host controls for the logged-in user.
        // Actions still remain gated by giveaway activity + host checks elsewhere.
        return true;
    }

    function isGiveawayCurrentlyActive(data) {
        if (!data) return false;
        const secondsLeft = Math.floor(Number(data.timeLeft) || 0);
        return secondsLeft > 0;
    }

    function getSponsorshipNextWinnerLine(data, options = {}) {
        if (!data || !data.scaleWinnersWithSponsors) return "";

        const baseWinners = Math.max(1, Math.min(MAX_WINNERS, Math.floor(Number(data.baseWinnersAtStart || data.winnersNum) || 1)));
        const effectiveWinners = Math.max(1, Math.floor(Number(data.effectiveWinnersNum || recomputeEffectiveWinners(data)) || baseWinners));
        const cap = Math.min(
            Math.max(baseWinners, Math.min(Math.floor(Number(data.hostMaxScaledWinners) || baseWinners), MAX_WINNERS)),
            MAX_WINNERS
        );

        if (effectiveWinners >= cap) {
            return options.plain
                ? `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]Max winners reached[/b] (${fmtBON(cap)}).`
            : `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [i][color=#9aa0a6][b]Max winners reached[/b] (${fmtBON(cap)}).[/color][/i]`;
        }

        const thresholdBonPerWinner = getScalingBonPerWinner(data);
        const totalContribForScaling = Math.max(0, Math.floor(getTotalContribForScaling(data)));
        const progress = totalContribForScaling % thresholdBonPerWinner;
        const remaining = progress === 0 ? thresholdBonPerWinner : thresholdBonPerWinner - progress;

        if (progress === 0) {
            if (totalContribForScaling > 0 && effectiveWinners < cap) {
                return options.plain
                    ? `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]BON needed to increase # of winners[/b]: reached.`
                : `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [i][color=#9aa0a6][b]Next threshold[/b]: reached.[/color][/i]`;
            }
            return "";
        }

        return options.plain
            ? `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [b]BON needed to increase # of winners[/b]: ${fmtBON(remaining)}.`
        : `[b][color=${SCALING_ACCENT_COLOR}]Scaling:[/color][/b] [i][color=#9aa0a6][b]BON needed to increase # of winners[/b]: ${fmtBON(remaining)}.[/color][/i]`;
    }

    function flashUIElement(el, durationMs = 950) {
        if (!el) return;
        el.classList.remove("bg-flash");
        void el.offsetWidth;
        el.classList.add("bg-flash");
        setTimeout(() => {
            if (el) el.classList.remove("bg-flash");
        }, durationMs);
    }

    function flashPotTotalUI() {
        flashUIElement(coinHeader, 900);
    }

    function flashWinnersUI() {
        const target = maxScaledWinnersGroup?.parentElement || winnersInput?.closest('.giveaway-winners-row') || winnersInput;
        flashUIElement(target, 1050);
    }

    function buildSponsorsSummaryMessage(data) {
        if (!data) return "";
        const sponsorNames = Array.from(new Set([
            ...(data.sponsors || []),
            ...Object.keys(data.sponsorContribs || {})
        ]));

        const safe = sponsorNames
        .map(name => ({
            name,
            amount: data.sponsorContribs?.[name] || 0
        }))
        .filter(item => item.name && Number(item.amount) > 0)
        .sort((a, b) =>
              (b.amount - a.amount) ||
              a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
             )
        .map(({ name, amount }) =>
             `[color=#1DDC5D][b]${sanitizeNick(name)}[/b][/color] ([color=#ffc00a][b]${fmtBON(amount)} BON[/b][/color])`
            );

        if (!safe.length) return "";

        const sponsorTotal = sumSponsorContribs(data.sponsorContribs, data.host);
        return `Thank you to all the sponsors! 🥳 Total sponsored: ` +
            `[color=#ffc00a][b]${fmtBON(sponsorTotal)} BON[/b][/color]. ` +
            safe.join(", ");
    }

    function bindSettingsSectionToggleButtons() {
        const buttons = settingsMenu ? settingsMenu.querySelectorAll("[data-settings-toggle]") : [];
        buttons.forEach((btn) => {
            btn.addEventListener("click", () => {
                const key = btn.getAttribute("data-settings-toggle");
                const group = settingsMenu.querySelector(`[data-settings-group="${key}"]`);
                if (!group) return;

                const ids = String(group.getAttribute("data-toggle-ids") || "").split(",").map((v) => v.trim()).filter(Boolean);
                const toggles = ids.map((id) => document.getElementById(id)).filter(Boolean);
                if (!toggles.length) return;

                const enforceOne = group.getAttribute("data-enforce-one") === "true";
                const enabledCount = toggles.filter((el) => el.checked).length;
                const turnOn = enabledCount !== 0;
                const keepEnabledEl = turnOn && enforceOne ? (toggles.find((el) => el.checked) || toggles[0]) : null;

                toggles.forEach((el) => {
                    const nextChecked = turnOn ? (el === keepEnabledEl ? true : false) : true;
                    if (el.checked !== nextChecked) {
                        el.checked = nextChecked;
                        el.dispatchEvent(new Event("change", { bubbles: true }));
                    }
                });
            });
        });
    }

    function normalizePanelCommandName(name) {
        return String(name || "").trim().toLowerCase();
    }

    function isEndCommandExcludedFromHostPanel(name) {
        const normalized = normalizePanelCommandName(name);
        return HOST_PANEL_END_COMMAND_DENYLIST.includes(normalized);
    }

    function isUploadCxExtraCommand(name) {
        const normalized = normalizePanelCommandName(name);
        return uploadCxExtras.some((extra) => normalizePanelCommandName(extra) === normalized);
    }

    function getPanelCommandList() {
        if (!COMMAND_HANDLERS || typeof COMMAND_HANDLERS !== "object") {
            return {
                commands: [],
                registryName: "COMMAND_HANDLERS",
                reason: "COMMAND_HANDLERS unavailable"
            };
        }

        const commands = Object.keys(COMMAND_HANDLERS)
        .filter((name) => typeof COMMAND_HANDLERS[name] === "function")
        .filter((name) => !isEndCommandExcludedFromHostPanel(name))
        .filter((name) => !HOST_PANEL_INTERNAL_COMMAND_DENYLIST.includes(normalizePanelCommandName(name)))
        .filter((name) => Site.isUploadCx || !isUploadCxExtraCommand(name))
        .sort((a, b) => a.localeCompare(b));

        return {
            commands,
            registryName: "COMMAND_HANDLERS",
            reason: `COMMAND_HANDLERS has ${commands.length} entr${commands.length === 1 ? "y" : "ies"}`
        };
    }

    function getCommandMeta(name) {
        const fallback = {
            label: name,
            section: "info",
            description: `Execute !${name}.`,
            usage: `!${name}`,
            requiresGiveaway: true
        };
        return { ...fallback, ...(HOST_PANEL_COMMAND_METADATA[name] || {}) };
    }

    function setButtonDisabledWithTooltip(button, disabled, reason, enabledTip) {
        if (!button) return;
        let wrap = button.closest('.disabled-wrap');
        if (!wrap) {
            wrap = document.createElement('span');
            wrap.className = 'disabled-wrap';
            button.parentNode.insertBefore(wrap, button);
            wrap.appendChild(button);
        }
        button.disabled = !!disabled;
        button.title = disabled ? "" : (enabledTip || button.title || "");
        wrap.title = disabled ? reason : "";
    }

    function withButtonDebounce(button, fn, done) {
        if (!button || button.dataset.busy === "1") return;
        button.dataset.busy = "1";
        button.disabled = true;
        const finish = () => {
            setTimeout(() => {
                button.dataset.busy = "0";
                if (typeof done === "function") done();
            }, 450);
        };
        try {
            const out = fn();
            if (out && typeof out.then === "function") out.finally(finish);
            else finish();
        } catch {
            finish();
        }
    }

    function getPanelCommandDisableReason(name) {
        const meta = getCommandMeta(name);
        const active = !!(giveawayData && isGiveawayCurrentlyActive(giveawayData));
        if (meta.requiresGiveaway && !active) return "Requires an active giveaway.";

        if (meta.hostOnly && !isCurrentUserGiveawayHost()) return "Only the host can use this.";

        if (name === "reminder" && active && !shouldSendReminder(giveawayData)) return "No reminder is due right now.";

        return "";
    }

    function validatePanelCommand(name) {
        const state = hostPanelCommandState.get(name);
        if (!state) return { valid: false, args: [], errors: [] };
        const meta = state.meta || getCommandMeta(name);
        const allRaw = {};
        state.inputs.forEach((item) => {
            allRaw[item.arg.name] = String(item.input.value || "").trim();
        });

        const args = [];
        const errors = [];
        state.inputs.forEach((item) => {
            const { arg, input } = item;
            const raw = allRaw[arg.name];
            const requiredNow = !!(arg.required || (typeof arg.requiredWhen === "function" && arg.requiredWhen(allRaw)));
            let error = "";

            if (!raw) {
                if (requiredNow) error = arg.hint || "Required.";
            } else if (arg.type === "int") {
                const n = Number(raw);
                if (!Number.isSafeInteger(n)) {
                    error = "Enter an integer.";
                } else if (Number.isFinite(arg.min) && n < arg.min) {
                    error = `Minimum: ${arg.min}.`;
                } else if (Number.isFinite(arg.max) && n > arg.max) {
                    error = `Maximum: ${arg.max}.`;
                }
            } else if (typeof arg.validate === "function" && !arg.validate(raw, allRaw)) {
                error = arg.hint || "Invalid value.";
            }

            input.classList.toggle("input-invalid", !!error);
            if (error) errors.push(error);
            if (raw) args.push(raw);
        });

        if (state.errorNode) {
            state.errorNode.textContent = errors[0] || "";
            state.errorNode.classList.toggle("visible", errors.length > 0);
        }

        return { valid: errors.length === 0, args, errors, meta };
    }

    function runHostPanelAction(name) {
        const state = hostPanelCommandState.get(name);
        if (!state) return;
        const disabledReason = getPanelCommandDisableReason(name);
        const validation = validatePanelCommand(name);
        const canRun = !disabledReason && validation.valid;

        setButtonDisabledWithTooltip(state.button, !canRun, disabledReason || "Fix invalid arguments.", `${validation.meta.description} Example: ${validation.meta.usage}`);
        if (!canRun) return;

        executeCommand({
            name,
            args: validation.args,
            author: giveawayData?.host || getLoggedInUsername() || "",
            giveawayData,
            source: "panel"
        });
    }

    function renderHostPanelCommands() {
        if (!hostCommandPanelBody) return;
        hostPanelCommandState.clear();
        hostCommandPanelBody.innerHTML = "";

        const panelList = getPanelCommandList();
        if (!panelList || !Array.isArray(panelList.commands)) {
            const placeholder = document.createElement("p");
            placeholder.className = "host-command-panel__empty";
            placeholder.textContent = "Host Panel commands unavailable (init error).";
            hostCommandPanelBody.appendChild(placeholder);
            return;
        }

        const { commands, registryName, reason } = panelList;
        if (commands.length === 0) {
            const placeholder = document.createElement("p");
            placeholder.className = "host-command-panel__empty";
            placeholder.textContent = `No commands found (registry empty). ${registryName} has 0 entries.`;
            hostCommandPanelBody.appendChild(placeholder);
            return;
        }

        const grouped = new Map();
        let naughtyItem = null;

        commands.forEach((name) => {
            const key = normalizePanelCommandName(name);
            const meta = getCommandMeta(name);

            if (!Site.isUploadCx && isUploadCxExtraCommand(name)) return;

            const mappedSection = HOST_PANEL_COMMAND_SECTION_BY_KEY[key];
            if (mappedSection === "naughty") {
                naughtyItem = { name, meta, key };
                return;
            }

            const sectionKey = mappedSection || meta.section || "unknown";
            if (!grouped.has(sectionKey)) grouped.set(sectionKey, []);
            grouped.get(sectionKey).push({ name, meta, key });
        });

        const buildCommandRow = (name, meta) => {
            const commandKey = normalizePanelCommandName(name);
            const row = document.createElement("div");
            row.className = "host-command-panel__row";
            row.title = `${meta.description} Example: ${meta.usage}`;
            row.dataset.command = name;

            const inline = document.createElement("div");
            inline.className = "hp-row";
            const mainLine = document.createElement("div");
            mainLine.className = "hp-row-main";
            const rightColumn = document.createElement("div");
            rightColumn.className = "hp-row-right";
            const fieldsWrap = document.createElement("div");
            fieldsWrap.className = "hp-row-fields";
            const errorLine = document.createElement("small");
            errorLine.className = "hp-row-error";

            const argInputs = [];
            const buttonWrap = document.createElement("span");
            buttonWrap.className = "disabled-wrap host-command-panel__button-wrap";
            const button = document.createElement("button");
            button.type = "button";
            button.className = "form__button form__button--filled";
            button.textContent = meta.label;
            button.title = `${meta.description} Example: ${meta.usage}`;
            button.dataset.command = name;
            buttonWrap.appendChild(button);
            mainLine.appendChild(buttonWrap);

            (meta.args || []).forEach((arg) => {
                const argWrap = document.createElement("div");
                argWrap.className = "host-command-panel__arg-wrap";

                let input;
                if (arg.type === "select") {
                    input = document.createElement("select");
                    input.className = "form__text command-input";
                    const options = Array.isArray(arg.options) ? arg.options : [];
                    options.forEach((opt) => {
                        const optionEl = document.createElement("option");
                        optionEl.value = String(opt.value || "");
                        optionEl.textContent = String(opt.label || opt.value || "");
                        input.appendChild(optionEl);
                    });
                } else {
                    input = document.createElement("input");
                    input.className = "form__text command-input";
                    if (arg.type === "text" || arg.type === "username") {
                        input.classList.add("command-input--long");
                    }
                    if (arg.type === "int") {
                        input.type = "number";
                        input.step = "1";
                        if (Number.isFinite(arg.min)) input.min = String(arg.min);
                        if (Number.isFinite(arg.max)) input.max = String(arg.max);
                    } else {
                        input.type = "text";
                    }
                    input.placeholder = arg.placeholder || arg.label || arg.name;
                }

                input.title = `${arg.label || arg.name}${arg.required ? " (required)" : " (optional)"}`;
                input.dataset.argName = arg.name;

                argWrap.appendChild(input);
                fieldsWrap.appendChild(argWrap);
                argInputs.push({ arg, input });
            });

            rightColumn.appendChild(fieldsWrap);
            rightColumn.appendChild(errorLine);
            mainLine.appendChild(rightColumn);
            inline.appendChild(mainLine);

            if (commandKey === "naughty") {
                const actionInput = argInputs.find((item) => item.arg.name === "action")?.input;
                const userInput = argInputs.find((item) => item.arg.name === "username")?.input;
                const syncNaughtyInputs = () => {
                    if (!(actionInput instanceof HTMLSelectElement) || !(userInput instanceof HTMLInputElement)) return;
                    const action = String(actionInput.value || "").toLowerCase();
                    const isList = action === "list";
                    userInput.disabled = isList;
                    if (isList) {
                        userInput.value = "";
                        userInput.classList.remove("input-invalid");
                        errorLine.textContent = "";
                        errorLine.classList.remove("visible");
                    }
                };
                if (actionInput instanceof HTMLSelectElement) {
                    actionInput.addEventListener("change", () => {
                        syncNaughtyInputs();
                        updateHostPanelUI();
                    });
                    syncNaughtyInputs();
                }
            }

            row.appendChild(inline);
            hostPanelCommandState.set(name, { button, inputs: argInputs, meta, errorNode: errorLine });
            return row;
        };

        const orderSectionItems = (sectionKey, items) => {
            const expectedOrder = HOST_PANEL_COMMAND_ORDER_BY_SECTION[sectionKey];
            if (!expectedOrder) {
                return [...items].sort((a, b) => a.key.localeCompare(b.key));
            }
            const rank = new Map(expectedOrder.map((key, idx) => [key, idx]));
            return [...items].sort((a, b) => {
                const aRank = rank.has(a.key) ? rank.get(a.key) : 999;
                const bRank = rank.has(b.key) ? rank.get(b.key) : 999;
                if (aRank !== bRank) return aRank - bRank;
                return a.key.localeCompare(b.key);
            });
        };

        const appendSection = (sectionKey, sectionLabel, items) => {
            if (!items.length) return;
            const section = document.createElement("section");
            section.className = "host-command-panel__section";
            const title = document.createElement("h5");
            title.className = "host-command-panel__section-title";
            title.textContent = sectionLabel;
            section.appendChild(title);
            orderSectionItems(sectionKey, items).forEach(({ name, meta }) => section.appendChild(buildCommandRow(name, meta)));
            hostCommandPanelBody.appendChild(section);
        };

        HOST_PANEL_SECTION_ORDER.forEach((sectionKey) => {
            if (sectionKey === "fun" && !Site.isUploadCx) {
                grouped.delete("fun");
                return;
            }
            const items = grouped.get(sectionKey) || [];
            grouped.delete(sectionKey);
            appendSection(sectionKey, COMMAND_PANEL_SECTIONS[sectionKey] || sectionKey, items);
        });

        grouped.delete("naughty");
        const unknownSections = [...grouped.entries()]
        .filter(([, items]) => Array.isArray(items) && items.length)
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
        unknownSections.forEach(([sectionKey, items]) => {
            const fallbackLabel = COMMAND_PANEL_SECTIONS[sectionKey] || sectionKey;
            appendSection(sectionKey, fallbackLabel, items);
        });

        if (naughtyItem) {
            appendSection("naughty", HOST_PANEL_NAUGHTY_SECTION_TITLE, [naughtyItem]);
        }

        if (!hostPanelCommandState.size) {
            const placeholder = document.createElement("p");
            placeholder.className = "host-command-panel__empty";
            placeholder.textContent = `No commands found (registry empty). ${reason || `${registryName} has 0 entries.`}`;
            hostCommandPanelBody.appendChild(placeholder);
        }
    }

    function bindHostPanelEvents() {
        if (!hostCommandPanelBody || hostCommandPanelBody.dataset.bound === "1") return;
        hostCommandPanelBody.dataset.bound = "1";

        hostCommandPanelBody.addEventListener("input", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !target.classList.contains("command-input")) return;
            updateHostPanelUI();
        });

        hostCommandPanelBody.addEventListener("change", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement) || !target.classList.contains("command-input")) return;
            updateHostPanelUI();
        });

        hostCommandPanelBody.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const button = target.closest("button[data-command]");
            if (!(button instanceof HTMLButtonElement)) return;
            const commandName = button.dataset.command || "";
            if (!commandName || !hostPanelCommandState.has(commandName)) return;

            withButtonDebounce(button, () => runHostPanelAction(commandName), updateHostPanelUI);
        });
    }

    function toggleCommandsMenu() {
        if (!commandsMenu) return;

        // close Settings before toggling Commands
        if (settingsMenu?.classList.contains('open')) hardCloseSettings();

        const open = commandsMenu.classList.toggle('open');
        if (open) {
            updateHostPanelUI();
            openCommandsMenu();
            document.addEventListener('click', handleOutsideClick);
            return;
        }
        hardCloseCommands();
        const anyOpen = settingsMenu?.classList.contains('open');
        if (!anyOpen) document.removeEventListener('click', handleOutsideClick);
    }

    function bindHeaderMenuDelegation() {
        if (!frameHeader) return;
        if (frameHeader.dataset.menuDelegationBound === "1") return;
        frameHeader.dataset.menuDelegationBound = "1";

        frameHeader.addEventListener('click', (event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;

            const commandsToggle = target.closest('#commandsButton');
            if (commandsToggle) {
                event.preventDefault();
                event.stopPropagation();
                toggleCommandsMenu();
                return;
            }

            const hostToggle = target.closest('#hostPanelToggle');
            if (hostToggle) {
                event.preventDefault();
                event.stopPropagation();
                const shouldOpen = !(hostCommandPanel && hostCommandPanel.classList.contains('open'));
                setHostPanelOpen(shouldOpen);
                updateHostPanelUI();
            }
        });
    }

    function bindFrameDrag() {
        if (!frameHeader || frameHeader.dataset.dragBound === "1") return;
        frameHeader.dataset.dragBound = "1";

        frameHeader.style.cursor = 'move';
        frameHeader.style.userSelect = 'none';

        let isDragging = false;
        let dragOffsetX = 0;
        let dragOffsetY = 0;

        const stopDrag = () => {
            isDragging = false;
        };

        frameHeader.addEventListener('mousedown', (event) => {
            const target = event.target;
            if (target instanceof Element && target.closest('.no-drag, button, input, textarea, select, a, [data-no-drag="1"]')) {
                return;
            }

            const rect = giveawayFrame.getBoundingClientRect();
            isDragging = true;
            dragOffsetX = event.clientX - rect.left;
            dragOffsetY = event.clientY - rect.top;
            giveawayFrame.style.left = rect.left + 'px';
            giveawayFrame.style.top = rect.top + 'px';
            giveawayFrame.style.right = 'auto';
            giveawayFrame.style.bottom = 'auto';
        });

        document.addEventListener('mousemove', (event) => {
            if (!isDragging) return;
            const maxX = window.innerWidth - giveawayFrame.offsetWidth;
            const maxY = window.innerHeight - giveawayFrame.offsetHeight;
            giveawayFrame.style.left = Math.max(0, Math.min(maxX, event.clientX - dragOffsetX)) + 'px';
            giveawayFrame.style.top = Math.max(0, Math.min(maxY, event.clientY - dragOffsetY)) + 'px';
        });

        document.addEventListener('mouseup', stopDrag);
    }

    function bindHeaderInteractions() {
        frameHeader = giveawayFrame?.querySelector('header.panel__heading');
        if (!frameHeader) return;
        bindHeaderMenuDelegation();
        bindFrameDrag();
    }

    function clampHostPanelPosition(left, top) {
        if (!hostCommandPanel) return { left: 8, top: 8 };
        const panelWidth = hostCommandPanel.offsetWidth || hostCommandPanel.getBoundingClientRect().width || 0;
        const panelHeight = hostCommandPanel.offsetHeight || hostCommandPanel.getBoundingClientRect().height || 0;
        const minLeft = 8;
        const minTop = 8;
        const maxLeft = Math.max(minLeft, window.innerWidth - panelWidth - 8);
        const maxTop = Math.max(minTop, window.innerHeight - panelHeight - 8);
        return {
            left: Math.max(minLeft, Math.min(maxLeft, Number(left) || 0)),
            top: Math.max(minTop, Math.min(maxTop, Number(top) || 0))
        };
    }

    function applyHostPanelPosition(left, top) {
        if (!hostCommandPanel) return;
        const next = clampHostPanelPosition(left, top);
        hostCommandPanel.style.left = `${next.left}px`;
        hostCommandPanel.style.top = `${next.top}px`;
        hostCommandPanel.style.right = "auto";
    }

    function readStoredHostPanelPos() {
        try {
            const raw = localStorage.getItem(LS_HOST_PANEL_POS);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") return null;
            if (!Number.isFinite(parsed.left) || !Number.isFinite(parsed.top)) return null;
            return { left: parsed.left, top: parsed.top };
        } catch {
            return null;
        }
    }

    function saveHostPanelPosition() {
        if (!hostCommandPanel) return;
        const rect = hostCommandPanel.getBoundingClientRect();
        const clamped = clampHostPanelPosition(rect.left, rect.top);
        localStorage.setItem(LS_HOST_PANEL_POS, JSON.stringify(clamped));
    }

    function positionHostPanelOnOpen() {
        if (!hostCommandPanel) return;
        const stored = readStoredHostPanelPos();
        if (stored) {
            applyHostPanelPosition(stored.left, stored.top);
            return;
        }
        const defaultLeft = window.innerWidth - hostCommandPanel.offsetWidth - 16;
        const defaultTop = 50;
        applyHostPanelPosition(defaultLeft, defaultTop);
    }

    function clampHostPanelCurrentPosition() {
        if (!hostCommandPanel) return;
        const rect = hostCommandPanel.getBoundingClientRect();
        applyHostPanelPosition(rect.left, rect.top);
        saveHostPanelPosition();
    }

    function bindHostPanelDrag() {
        if (!hostPanelHandle || !hostCommandPanel || hostPanelHandle.dataset.dragBound === "1") return;
        hostPanelHandle.dataset.dragBound = "1";

        let pointerDown = false;
        let dragStarted = false;
        let pointerStartX = 0;
        let pointerStartY = 0;
        let startLeft = 0;
        let startTop = 0;

        const stopDrag = () => {
            if (!pointerDown) return;
            pointerDown = false;
            if (dragStarted) {
                hostCommandPanel.classList.remove("dragging");
                document.body.classList.remove("host-panel-dragging");
                saveHostPanelPosition();
            }
            dragStarted = false;
        };

        hostPanelHandle.addEventListener("mousedown", (event) => {
            if (event.button !== 0) return;
            const target = event.target;
            if (target instanceof Element && target.closest("button, input, textarea, select, a, [data-no-drag='1']")) return;

            pointerDown = true;
            dragStarted = false;
            pointerStartX = event.clientX;
            pointerStartY = event.clientY;
            const rect = hostCommandPanel.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            event.preventDefault();
        });

        document.addEventListener("mousemove", (event) => {
            if (!pointerDown || !hostCommandPanel.classList.contains("open")) return;

            const deltaX = event.clientX - pointerStartX;
            const deltaY = event.clientY - pointerStartY;
            if (!dragStarted && Math.hypot(deltaX, deltaY) < 4) return;

            if (!dragStarted) {
                dragStarted = true;
                hostCommandPanel.classList.add("dragging");
                document.body.classList.add("host-panel-dragging");
            }

            applyHostPanelPosition(startLeft + deltaX, startTop + deltaY);
        });

        document.addEventListener("mouseup", stopDrag);
        window.addEventListener("blur", stopDrag);
    }

    function bindHostPanelResizeClamp() {
        if (hostPanelResizeBound) return;
        hostPanelResizeBound = true;
        window.addEventListener("resize", () => {
            if (!hostCommandPanel) return;
            clampHostPanelCurrentPosition();
        });
    }

    function ensureHostPanelInitialized() {
        if (hostPanelInitialized) return;
        ensureHostPanelToggleButton();

        if (!document.getElementById("hostCommandPanel")) {
            document.body.insertAdjacentHTML("beforeend", hostPanelHTML);
        }

        bindHostPanelButtons();
        hostPanelInitialized = true;
    }

    function bindHostPanelButtons() {
        hostPanelToggleBtn = document.getElementById("hostPanelToggle");
        hostCommandPanel = document.getElementById("hostCommandPanel");
        hostCommandPanelBody = document.getElementById("hostCommandPanelBody");
        hostPanelCloseBtn = document.getElementById("hostPanelCloseBtn");
        hostPanelHandle = document.getElementById("hostCommandPanelHandle");

        if (hostCommandPanel && hostCommandPanel.parentElement !== document.body) {
            document.body.appendChild(hostCommandPanel);
        }

        renderHostPanelCommands();
        bindHostPanelEvents();
        bindHostPanelDrag();
        bindHostPanelResizeClamp();

        if (hostPanelCloseBtn && hostPanelCloseBtn.dataset.bound !== "1") {
            hostPanelCloseBtn.dataset.bound = "1";
            hostPanelCloseBtn.addEventListener("click", () => {
                setHostPanelOpen(false);
                updateHostPanelUI();
            });
        }
    }

    function setHostPanelOpen(open) {
        const shouldOpen = !!open;
        if (shouldOpen) ensureHostPanelInitialized();
        if (!hostCommandPanel) return;
        if (shouldOpen) {
            renderHostPanelCommands();
            hostCommandPanel.style.zIndex = "10030";
            hostCommandPanel.classList.add("open");
            hostCommandPanel.setAttribute("aria-hidden", "false");
            positionHostPanelOnOpen();
            clampHostPanelCurrentPosition();
            if (hostCommandPanelBody) hostCommandPanelBody.scrollLeft = 0;
        } else {
            hostCommandPanel.classList.remove("open", "dragging");
            hostCommandPanel.setAttribute("aria-hidden", "true");
            document.body.classList.remove("host-panel-dragging");
        }
        localStorage.setItem(LS_HOST_PANEL_OPEN, shouldOpen ? "true" : "false");
    }

    function updateHostPanelUI() {
        const visible = true;

        if (hostPanelToggleBtn) hostPanelToggleBtn.style.display = visible ? "inline-flex" : "none";
        if (hostCommandPanel && !visible) setHostPanelOpen(false);

        hostPanelCommandState.forEach((state, name) => {
            const reason = getPanelCommandDisableReason(name);
            const validation = validatePanelCommand(name);
            const disabled = !!reason || !validation.valid;
            setButtonDisabledWithTooltip(
                state.button,
                disabled,
                reason || "Fix invalid arguments.",
                `${state.meta.description} Example: ${state.meta.usage}`
            );
            state.inputs.forEach(({ input, arg }) => {
                let shouldDisable = !!reason;
                if (!shouldDisable && normalizePanelCommandName(name) === "naughty" && arg.name === "username") {
                    const actionInput = state.inputs.find((item) => item.arg.name === "action")?.input;
                    const actionValue = actionInput ? String(actionInput.value || "").toLowerCase() : "";
                    shouldDisable = actionValue === "list";
                }
                input.disabled = shouldDisable;
            });
        });

        fitSettingsMenuHeight();
    }

    // Outside-click only affects Settings / Commands menus (Host Panel stays open).
    function handleOutsideClick(event) {
        const settingsButton = document.getElementById('giveawaySettingsBtn') || settingsBtn;
        const commandsButton = document.getElementById('commandsButton') || commandsBtn;

        const insideSettings = !!(settingsMenu && (settingsMenu.contains(event.target) || settingsButton?.contains(event.target)));
        const insideCommands = !!(commandsMenu && (commandsMenu.contains(event.target) || commandsButton?.contains(event.target)));

        if (!insideSettings && !insideCommands) {
            settingsMenu.classList.remove('open');
            settingsMenu.style.display = 'none';
            hardCloseCommands();
            document.removeEventListener('click', handleOutsideClick);
        }
    }


    function fitSettingsMenuHeight() {
        if (!settingsMenu || settingsMenu.style.display === 'none') return;

        settingsMenu.style.height = 'auto';
        const viewportMax = Math.max(220, window.innerHeight - 90);
        const neededHeight = settingsMenu.scrollHeight;
        const cappedHeight = Math.min(neededHeight, viewportMax);

        settingsMenu.style.maxHeight = `${cappedHeight}px`;
        settingsMenu.style.overflowY = neededHeight > viewportMax ? 'auto' : 'visible';
    }

    function hardCloseCommands() {
        commandsMenu.classList.remove('open');
        commandsMenu.style.display = 'none'; // keep it hidden
    }

    function openCommandsMenu() {
        commandsMenu.style.display = 'block';
    }

    function hardCloseSettings () {
        settingsMenu.classList.remove('open');
        settingsMenu.style.display = 'none';
        document.removeEventListener('click', handleOutsideClick);
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 14: Internal Namespaces (refactor-only; no behavior change)
    // Provides a single place to find related functionality by area.
    // ───────────────────────────────────────────────────────────
    // Optional debug hook: set DEBUG_SETTINGS.expose_modules = true in code if you want this on window.
    if (DEBUG_SETTINGS && DEBUG_SETTINGS.expose_modules === true) {
        window.BON_GIVEAWAY = Object.freeze({
            Site,
            Chat: Object.freeze({
                parseMessage,
                getAuthor,
                getChatMsgText,
            }),
            Giveaway: Object.freeze({
                startGiveaway,
                stopGiveaway,
                endGiveaway,
            }),
            Commands: Object.freeze({
                handleGiveawayCommands,
            }),
            Sponsors: Object.freeze({
                SponsorTracker,
                parseGiftMessage,
            }),
            Stats: Object.freeze({
                loadGiveawayStats,
                saveGiveawayStats,
                recordLiveEntry,
                recordGiveawayStats,
                recordLiveSponsorGift,
            }),
            Util: Object.freeze({
                normalizeUserKey,
                normUserKey,
                cleanPotString,
                fmtBON,
                parseTime,
            }),
        });
    }

    function addStyle(css, id) {
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    // ───────────────────────────────────────────────────────────
    // SECTION 12: SPA / Turbolinks Navigation Support
    // ───────────────────────────────────────────────────────────
    // When the user navigates to another page on the same site via turbolinks,
    // re-inject the giveaway UI so entries and commands keep working cross-page.
    window.addEventListener('turbolinks:load', () => {
        // Re-inject the giveaway button and frame if they were removed during navigation
        const existingFrame = document.getElementById('giveawayFrame');
        if (!existingFrame && document.querySelector('#chatbox_header div')) {
            injectMenu();
        }
        // Re-cache chat context (CSRF token, user ID, etc.) which may have changed
        cacheChatContext();
    });
})();