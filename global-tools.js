/**************************************************************
 * Global-Tools – Hilfsfunktionen für ilovegyms ioBroker-Umgebung
 * Version: 1.1
 * Typ: global (Bibliothek)
 *
 * Enthält:
 *  - Logging-Helper (gtLog, gtLogDebug, gtSetDebugEnabled, gtIsDebugEnabled)
 *  - State-Helper:
 *      ensureState (kombiniert legacy + async/typed)
 *      ensureStateAsync (typed/async Master)
 *      ensureChannel
 *      getSafeState, getNum, getBool, getStr
 *      setStateIfChanged, setStateSafe
 *  - Format-Helper (fmtBytes, fmtWatt, fmtPercent, fmtDuration, fmtDateTime, fmtNum)
 *  - Datum/Zeit (gtDate, gtTime, gtStartOfDay, gtIsSameDay, gtDaysBetween)
 *  - JSON-Helper (gtJsonParse, gtJsonStringify)
 *  - Array-Helper (deleteDuplicates)
 *  - HTML-Helper (gtEscapeHtml)
 *  - Heartbeat-Helper (hbEnsure, heartbeat, hbOk, hbError)
 *  - SynoChat-Helper:
 *      notifySynoChat, notifySynoChatEx
 *
 * Dieses Script startet KEINE Schedules und registriert KEINE on()-Listener.
 * Es stellt nur Funktionen im globalen Kontext bereit.
 **************************************************************/

// ==================== KONFIG FÜR SETUP ====================

// Wurzel für Heartbeat-States
const GT_HB_ROOT = '0_userdata.0.Scripte.Heartbeat';

// Wurzel für Synology-Chat-Notification-States
// Erwartet Pfade wie: 0_userdata.0.Notifications.SynoChat.<Channel>.send
const GT_SYNOCHAT_ROOT = '0_userdata.0.Notifications.SynoChat';

// Debug-Flag für gtLogDebug()
let GT_DEBUG = false;


// ==================== LOGGING-HELPER ====================

/**
 * Debug an/aus für alle globalen Tools.
 * Beispiel: gtSetDebugEnabled(true);
 */
function gtSetDebugEnabled(enabled) {
    GT_DEBUG = !!enabled;
}
function gtIsDebugEnabled() {
    return GT_DEBUG;
}

/**
 * Log mit Prefix.
 * @param {string} prefix  z.B. 'SynoPhoto', 'UniFi', 'GlobalTools'
 * @param {string} msg
 * @param {ioBroker.LogLevel} [level='info']
 */
function gtLog(prefix, msg, level) {
    level = level || 'info';
    log('[' + prefix + '] ' + msg, level);
}

/** Debug-Log */
function gtLogDebug(prefix, msg) {
    if (GT_DEBUG) gtLog(prefix, msg, 'debug');
}


// ==================== JSON-HELPER ====================

function gtJsonParse(str, fallback) {
    try {
        if (str === null || str === undefined || str === '') return fallback;
        return JSON.parse(str);
    } catch (e) {
        return fallback;
    }
}

function gtJsonStringify(obj, fallback) {
    try {
        return JSON.stringify(obj);
    } catch (e) {
        return (fallback !== undefined) ? fallback : '{}';
    }
}


// ==================== STATE-HELPER ====================

/**
 * Channel (oder Device) sicher anlegen, falls nicht vorhanden.
 * @param {string} id z.B. '0_userdata.0.Geraete.SynoPhoto'
 * @param {object} [common]
 */
function ensureChannel(id, common) {
    try {
        if (existsObject(id)) return;
        setObject(id, {
            type: 'channel',
            common: common || { name: id },
            native: {}
        });
    } catch (e) {
        log('[GlobalTools] Fehler in ensureChannel(' + id + '): ' + e, 'warn');
    }
}

/**
 * Typed/async Master-Variante.
 * Aufruf:
 *   await ensureStateAsync(id, def, role, type, rw)
 */
async function ensureStateAsync(id, def, role, type, rw) {
    try {
        const writeFlag = (rw === 'write');
        const want = {
            name: id.split('.').pop(),
            role,
            type,
            read: true,
            write: writeFlag
        };
        if (def !== undefined) want.def = def;

        const obj = await getObjectAsync(id);
        if (!obj) {
            await setObjectAsync(id, { type: 'state', common: want, native: {} });
            if (def !== undefined) {
                await setStateAsync(id, def, true);
            }
            return;
        }

        const c = obj.common || {};
        if (c.role !== role || c.type !== type || c.read !== true || c.write !== writeFlag) {
            await extendObjectAsync(id, {
                common: Object.assign({}, c, {
                    role,
                    type,
                    read: true,
                    write: writeFlag
                })
            });
        }
    } catch (e) {
        log('[GlobalTools] Fehler in ensureStateAsync(' + id + '): ' + e, 'warn');
    }
}

/**
 * Kombinierte ensureState:
 *
 * 1) Legacy-Variante:
 *    ensureState(id, commonObj, initialValue)
 *
 * 2) Typisierte/async Variante:
 *    await ensureState(id, def, role, type, rw)
 */
function ensureState(id, a2, a3, a4, a5) {
    // Fall 1: Legacy-Stil mit common-Objekt
    if (typeof a2 === 'object' && a2 !== null && !Array.isArray(a2)) {
        let common = a2;
        const initialValue = a3;
        try {
            if (existsState(id)) return;
            if (!common || typeof common !== 'object') {
                common = { name: id, type: 'mixed', read: true, write: true, role: 'state' };
            }
            createState(id, initialValue, common, function () {});
        } catch (e) {
            log('[GlobalTools] Fehler in ensureState(legacy ' + id + '): ' + e, 'warn');
        }
        return;
    }

    // Fall 2: Typisierte/async Variante
    return ensureStateAsync(id, a2, a3, a4, a5);
}

/**
 * State lesen ohne Fehler/Warnings, wenn er nicht existiert.
 * Gibt immer ein Objekt mit .val zurück.
 */
function getSafeState(id, fallback) {
    try {
        if (!existsState(id)) {
            return { val: fallback, ts: 0, lc: 0, ack: true };
        }
        const s = getState(id);
        if (!s || typeof s.val === 'undefined') {
            return { val: fallback, ts: 0, lc: 0, ack: true };
        }
        return s;
    } catch (e) {
        log('[GlobalTools] Fehler in getSafeState(' + id + '): ' + e, 'warn');
        return { val: fallback, ts: 0, lc: 0, ack: true };
    }
}

function getNum(id, fallback) {
    const s = getSafeState(id, fallback);
    const n = Number(s.val);
    return isNaN(n) ? fallback : n;
}

function getBool(id, fallback) {
    const s = getSafeState(id, fallback);
    if (typeof s.val === 'boolean') return s.val;
    if (typeof s.val === 'string') {
        if (s.val === 'true') return true;
        if (s.val === 'false') return false;
    }
    if (typeof s.val === 'number') return s.val !== 0;
    return !!fallback;
}

function getStr(id, fallback) {
    const s = getSafeState(id, fallback);
    if (s.val === null || s.val === undefined) return fallback;
    return String(s.val);
}

/**
 * Setzt State nur, wenn Wert wirklich anders ist (reduziert setState-Spam).
 */
function setStateIfChanged(id, val, ack) {
    ack = (ack === undefined) ? true : !!ack;
    try {
        const s = getState(id);
        if (!s || s.val !== val) {
            setState(id, val, ack);
            return true;
        }
    } catch (e) {
        // falls der State nicht existiert, einfach setzen
        try { setState(id, val, ack); return true; } catch (_) {}
    }
    return false;
}

/**
 * Setzt State ohne zu crashen (mit optionalem fallback-ensureState).
 */
function setStateSafe(id, val, ack, commonIfMissing, defIfMissing) {
    try {
        if (!existsState(id) && commonIfMissing) {
            ensureState(id, commonIfMissing, defIfMissing);
        }
        setState(id, val, ack === undefined ? true : !!ack);
    } catch (e) {
        log('[GlobalTools] Fehler in setStateSafe(' + id + '): ' + e, 'warn');
    }
}


// ==================== FORMAT-HELPER ====================

function fmtNum(n, decimals, fallback) {
    decimals = (decimals === undefined) ? 1 : decimals;
    fallback = (fallback === undefined) ? '-' : fallback;
    if (n === null || n === undefined || isNaN(n)) return fallback;
    return Number(n).toFixed(decimals);
}

function fmtBytes(bytes, decimals) {
    decimals = (decimals === undefined) ? 1 : decimals;
    if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let u = 0;
    let v = Math.abs(Number(bytes));
    while (v >= 1024 && u < units.length - 1) {
        v /= 1024;
        u++;
    }
    const sign = (bytes < 0) ? '-' : '';
    return sign + v.toFixed(decimals) + ' ' + units[u];
}

function fmtWatt(watt, decimals) {
    decimals = (decimals === undefined) ? 1 : decimals;
    if (watt === null || watt === undefined || isNaN(watt)) return '-';
    const abs = Math.abs(Number(watt));
    const sign = (watt < 0) ? '-' : '';
    if (abs < 1000) return sign + abs.toFixed(decimals) + ' W';
    if (abs < 1000000) return sign + (abs / 1000).toFixed(decimals) + ' kW';
    return sign + (abs / 1000000).toFixed(decimals) + ' MW';
}

function fmtPercent(value, decimals) {
    decimals = (decimals === undefined) ? 1 : decimals;
    if (value === null || value === undefined || isNaN(value)) return '-';
    return Number(value).toFixed(decimals) + ' %';
}

function fmtDuration(ms) {
    if (ms === null || ms === undefined || isNaN(ms) || ms < 0) return '-';
    const sec = Math.floor(ms / 1000);
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    if (d > 0) return d + 'd ' + h + 'h';
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
}

/**
 * Timestamp (ms oder Date) als "YYYY-MM-DD HH:MM" formatieren.
 */
function fmtDateTime(ts) {
    if (ts === null || ts === undefined) return '-';
    const d = (ts instanceof Date) ? ts : new Date(ts);
    if (isNaN(d.getTime())) return '-';

    const pad = function (n) { return (n < 10 ? '0' : '') + n; };
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const h = pad(d.getHours());
    const min = pad(d.getMinutes());

    return y + '-' + m + '-' + day + ' ' + h + ':' + min;
}


// ==================== DATUM / ZEIT HELFER ====================

/**
 * Liefert ein Datum als String mit Offset in Tagen.
 * variant: "tmj" (DD.MM.YY), "tm" (DD.MM.), sonst "DD.MM.YYYY"
 *
 * Beispiele:
 *   gtDate(0, 'tmj')  -> "20.11.25"
 *   gtDate(1, 'tm')   -> "21.11."
 *   gtDate(2, 'lang') -> "22.11.2025"
 */
function gtDate(offsetDays, variant) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0)); // DST-sicher

    let pattern;
    if (variant === 'tmj') pattern = 'DD.MM.YY';
    else if (variant === 'tm') pattern = 'DD.MM.';
    else pattern = 'DD.MM.YYYY';

    return formatDate(d, pattern);
}

/**
 * Deutsche Zeit "HH:MM" oder "HH:MM:SS"
 */
function gtTime(variant) {
    const d = new Date();
    if (variant === 'hms') return formatDate(d, 'hh:mm:ss');
    return formatDate(d, 'hh:mm');
}

/**
 * Tagesbeginn (00:00) als Timestamp (ms).
 */
function gtStartOfDay(ts) {
    const d = ts ? new Date(ts) : new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

/**
 * Prüft, ob zwei Timestamps am selben Kalendertag liegen (lokale TZ).
 */
function gtIsSameDay(ts1, ts2) {
    if (!ts1 || !ts2) return false;
    return gtStartOfDay(ts1) === gtStartOfDay(ts2);
}

/**
 * Ganze Tage zwischen zwei Zeitpunkten (lokal, Tag->Tag).
 */
function gtDaysBetween(ts1, ts2) {
    if (!ts1 || !ts2) return 0;
    const a = gtStartOfDay(ts1);
    const b = gtStartOfDay(ts2);
    return Math.round((b - a) / 86400000);
}


// ==================== ARRAY-HELPER ====================

/**
 * Entfernt doppelte Einträge aus einem Array.
 */
function deleteDuplicates(arr) {
    if (!Array.isArray(arr)) return [];
    return Array.from(new Set(arr));
}


// ==================== HTML-HELPER ====================

/**
 * HTML escapen (für Dashboard-Bau).
 */
function gtEscapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


// ==================== HEARTBEAT-HELPER ====================

function hbEnsure(scriptKey) {
    const base = GT_HB_ROOT + '.' + scriptKey;

    ensureState(base + '.lastPing', {
        name: 'Letzter Ping ' + scriptKey,
        type: 'number',
        role: 'value.time',
        read: true,
        write: false
    }, 0);

    ensureState(base + '.status', {
        name: 'Status ' + scriptKey,
        type: 'string',
        role: 'text',
        read: true,
        write: false
    }, 'init');

    ensureState(base + '.lastMessage', {
        name: 'Letzte Meldung ' + scriptKey,
        type: 'string',
        role: 'text',
        read: true,
        write: false
    }, '');
}

function heartbeat(scriptKey, ok, msg) {
    try {
        hbEnsure(scriptKey);
        const base = GT_HB_ROOT + '.' + scriptKey;
        setState(base + '.lastPing', Date.now(), true);
        setState(base + '.status', ok ? 'ok' : 'error', true);
        if (msg !== undefined && msg !== null) {
            setState(base + '.lastMessage', String(msg), true);
        }
    } catch (e) {
        log('[GlobalTools] Fehler in heartbeat(' + scriptKey + '): ' + e, 'warn');
    }
}

function hbOk(scriptKey, msg) {
    heartbeat(scriptKey, true, msg);
}

function hbError(scriptKey, msg) {
    heartbeat(scriptKey, false, msg);
}


// ==================== SYNOCHAT-HELPER ====================

function notifySynoChat(channel, message) {
    try {
        if (!channel) channel = 'System';
        const base = GT_SYNOCHAT_ROOT + '.' + channel;
        ensureChannel(base, { name: 'SynoChat Channel ' + channel });

        const sendId = base + '.send';
        ensureState(sendId, {
            name: 'SynoChat Nachricht (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        // ack=false => triggert dein SynoChat-Script
        setState(sendId, String(message), false);
    } catch (e) {
        log('[GlobalTools] Fehler in notifySynoChat(' + channel + '): ' + e, 'warn');
    }
}

function notifySynoChatEx(channel, message, title) {
    try {
        if (!channel) channel = 'System';
        const base = GT_SYNOCHAT_ROOT + '.' + channel;
        ensureChannel(base, { name: 'SynoChat Channel ' + channel });

        const sendId  = base + '.send';
        const titleId = base + '.title';

        ensureState(sendId, {
            name: 'SynoChat Nachricht (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        ensureState(titleId, {
            name: 'SynoChat Titel (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        if (title !== undefined && title !== null) {
            setState(titleId, String(title), false);
        }
        setState(sendId, String(message), false);
    } catch (e) {
        log('[GlobalTools] Fehler in notifySynoChatEx(' + channel + '): ' + e, 'warn');
    }
}
/**
 * SynoChat: File/Bild senden.
 *
 * channel: z.B. 'Security', 'System', 'Backup'
 * fileValue: das, was dein SynoChat-Sender-Script erwartet:
 *            - meist lokaler Dateipfad (z.B. /mnt/data/snap.jpg)
 *            - oder URL / Base64, je nach deinem Sender-Script
 * message/title optional als Begleittext.
 *
 * Unterstützt .sendFile UND .sendfile (kompatibilität).
 */
function notifySynoChatFile(channel, fileValue, message, title) {
    try {
        if (!channel) channel = 'System';
        const base = GT_SYNOCHAT_ROOT + '.' + channel;
        ensureChannel(base, { name: 'SynoChat Channel ' + channel });

        const sendId      = base + '.send';
        const titleId     = base + '.title';
        const sendFileId1 = base + '.sendFile';
        const sendFileId2 = base + '.sendfile';

        // Text-States wie gehabt
        ensureState(sendId, {
            name: 'SynoChat Nachricht (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        ensureState(titleId, {
            name: 'SynoChat Titel (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        // File-State anlegen (wir legen beide an, damit alle Varianten funktionieren)
        ensureState(sendFileId1, {
            name: 'SynoChat File (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        ensureState(sendFileId2, {
            name: 'SynoChat File legacy (' + channel + ')',
            type: 'string',
            role: 'text',
            read: true,
            write: true
        }, '');

        if (title !== undefined && title !== null) {
            setState(titleId, String(title), false);
        }
        if (message !== undefined && message !== null) {
            setState(sendId, String(message), false);
        }

        // File triggern (ack=false)
        const v = String(fileValue);
        setState(sendFileId1, v, false);
        setState(sendFileId2, v, false);

    } catch (e) {
        log('[GlobalTools] Fehler in notifySynoChatFile(' + channel + '): ' + e, 'warn');
    }
}

// ======== Ende Global-Tools v1.1 ========
