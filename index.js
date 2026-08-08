import { getContext, getExtensionSettings, eventSource, event_types, saveSettingsDebounced } from "../../../../script.js";
import { setExtensionPrompt } from "../../../extensions.js";
import { ConnectionManagerRequestService } from "../../../connection-manager-request-service.js";
import { executeSlashCommands } from "../../../slash-commands.js";
import { EVALUATE_TURN_PROMPT, GENERATE_SHOP_PROMPT, GENERATE_QUEST_PROMPT, GENERATE_MAP_PROMPT } from "./prompts.js";

const extensionName = "sillytavern-litrpg-system";
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const CLASSES = {
    Warrior: { name: "Warrior", hpMult: 1.5, spMult: 1.2, mpMult: 0.5, desc: "High HP & Stamina. Low Mana." },
    Mage: { name: "Mage", hpMult: 0.8, spMult: 0.8, mpMult: 2.0, desc: "High Mana. Low HP & Stamina." },
    Rogue: { name: "Rogue", hpMult: 1.0, spMult: 1.5, mpMult: 0.8, desc: "High Stamina for dodges." }
};

const DEFAULT_SYS = {
    initialized: false,
    playerClass: null,
    level: 1, xp: 0, xpNeeded: 100, gold: 0,
    hp: 100, maxHp: 100,
    sp: 100, maxSp: 100,
    mp: 50, maxMp: 50,
    debuffs: [], // { name, duration, effect }
    inventory: [], quests: [],
    genre: "fantasy", apiProfile: ""
};

let sys = null;
let msgCounter = 0;

async function initUI() {
    const res = await fetch(`${extensionFolderPath}/index.html`);
    $("body").append(await res.text());
    loadData();
    setupEvents();
    if (!sys.initialized) showAwakening();
    else updateUI();
}

function loadData() {
    const st = getExtensionSettings();
    if (!st.litrpg_v2) st.litrpg_v2 = {};
    sys = Object.assign({}, DEFAULT_SYS, st.litrpg_v2);
    // Cleanup expired debuffs
    sys.debuffs = sys.debuffs.filter(d => d.duration > 0);
}

function saveData() {
    getExtensionSettings().litrpg_v2 = sys;
    saveSettingsDebounced();
    updateUI();
    injectContext();
}

function showAwakening() {
    const grid = $("#sys-class-grid");
    grid.empty();
    for (const [k, v] of Object.entries(CLASSES)) {
        grid.append(`
            <div class="sys-class-card" data-class="${k}">
                <div class="sys-class-title">${v.name}</div>
                <div style="font-size: 0.85em; margin-top: 5px;">${v.desc}</div>
            </div>
        `);
    }
    $("#sys-awakening-overlay").css("display", "flex");
    $(".sys-class-card").on("click", function() {
        const cls = $(this).data("class");
        sys.playerClass = CLASSES[cls];
        sys.maxHp = Math.floor(100 * sys.playerClass.hpMult);
        sys.maxSp = Math.floor(100 * sys.playerClass.spMult);
        sys.maxMp = Math.floor(50 * sys.playerClass.mpMult);
        sys.hp = sys.maxHp; sys.sp = sys.maxSp; sys.mp = sys.maxMp;
        sys.initialized = true;
        $("#sys-awakening-overlay").hide();
        saveData();
        showToast(`Awakened as ${sys.playerClass.name}!`, "info");
    });
}

function setupEvents() {
    $("#sys-trigger-main").on("click", () => { 
        $("#sys-main-modal").addClass("open"); 
        $(".sys-tab").removeClass("active");
        $(".sys-panel").removeClass("active");
        $("[data-target='sys-panel-status']").addClass("active");
        $("#sys-panel-status").addClass("active");
    });
    $("#sys-trigger-map").on("click", () => {
        $("#sys-main-modal").addClass("open");
        $(".sys-tab").removeClass("active");
        $(".sys-panel").removeClass("active");
        $("[data-target='sys-panel-map']").addClass("active");
        $("#sys-panel-map").addClass("active");
    });
    $("#sys-close").on("click", () => $("#sys-main-modal").removeClass("open"));
    
    $(".sys-tab").on("click", function() {
        $(".sys-tab, .sys-panel").removeClass("active");
        $(this).addClass("active");
        $("#" + $(this).data("target")).addClass("active");
    });
    
    $("#sys-btn-reset").on("click", () => {
        if(confirm("Wipe all system data?")) {
            Object.assign(sys, DEFAULT_SYS);
            sys.initialized = false;
            saveData();
            showAwakening();
        }
    });
    
    $("#sys-btn-gen-map").on("click", generateMap);
    
    // Auto APIs
    const st = getExtensionSettings();
    if (st.connectionProfiles) {
        st.connectionProfiles.forEach(p => $("#sys-opt-api").append(`<option value="${p.name}">${p.name}</option>`));
        if (sys.apiProfile) $("#sys-opt-api").val(sys.apiProfile);
        $("#sys-opt-api").on('change', function() { sys.apiProfile = $(this).val(); saveData(); });
    }
}

function updateUI() {
    if (!sys.initialized) return;
    $("#sys-class-name").text(sys.playerClass ? sys.playerClass.name : "None");
    $("#sys-val-hp").text(`${sys.hp}/${sys.maxHp}`);
    $("#sys-val-sp").text(`${sys.sp}/${sys.maxSp}`);
    $("#sys-val-gold").text(sys.gold);
    
    // Debuffs
    const dList = $("#sys-debuffs-list");
    if (sys.debuffs.length === 0) dList.html('<i style="color:#888;">No active debuffs</i>');
    else {
        dList.html(sys.debuffs.map(d => `
            <div class="sys-card sys-debuff">
                <div class="sys-card-title">${d.name} (${d.duration} turns left)</div>
                <div style="font-size: 0.8em; color: #ccc;">${d.effect}</div>
            </div>
        `).join(''));
    }
    
    // Quests
    const qList = $("#sys-quests-list");
    if (sys.quests.length === 0) qList.html('<i style="color:#888;">No active quests</i>');
    else {
        qList.html(sys.quests.map((q, idx) => `
            <div class="sys-card" style="border-left-color: #f1c40f;">
                <div class="sys-card-title">${q.title}</div>
                <div style="font-size: 0.9em; margin: 5px 0;">${q.desc}</div>
                <div style="font-size: 0.8em; color: #f1c40f;">Reward: ${q.rewardXp} XP | ${q.rewardGold} Gold</div>
            </div>
        `).join(''));
    }
}

function injectContext() {
    if (!sys.initialized) return;
    const debuffStr = sys.debuffs.length > 0 ? `DEBUFFS: ${sys.debuffs.map(d => d.name).join(', ')}` : "DEBUFFS: None";
    const p = `[SYSTEM] Class: ${sys.playerClass.name} | Lvl: ${sys.level} | HP: ${sys.hp}/${sys.maxHp} | SP: ${sys.sp}/${sys.maxSp} | MP: ${sys.mp}/${sys.maxMp}
${debuffStr}
The user is subject to these stats. If HP is low, they are wounded. If SP is low, they are exhausted.`;
    try { setExtensionPrompt(extensionName, p, 1, 0); } 
    catch { getContext().extensionPrompt["litrpg_v2"] = p; }
}

async function callAI(prompt) {
    const cp = sys.apiProfile || getExtensionSettings().connectionProfile;
    if (!cp) return null;
    try {
        const res = await ConnectionManagerRequestService.sendRequest(cp, [{role:"user", content:prompt}], undefined, {stream:false, extractData:true});
        let text = typeof res === 'string' ? res : res.text;
        const match = text.match(/(\{|\[)[\s\S]*(\}|\])/);
        return match ? JSON.parse(match[0]) : JSON.parse(text);
    } catch { return null; }
}

async function evaluateTurn() {
    if (!sys.initialized || $("#sys-main-modal").hasClass("open")) return;
    msgCounter++;
    
    // Decrement debuffs
    let debuffsChanged = false;
    sys.debuffs.forEach(d => { d.duration--; debuffsChanged = true; });
    sys.debuffs = sys.debuffs.filter(d => d.duration > 0);
    
    const ctx = getContext().chat.slice(-5).map(m => `${m.name}: ${m.mes}`).join('\n');
    const stats = `HP:${sys.hp}, SP:${sys.sp}, Gold:${sys.gold}`;
    const p = EVALUATE_TURN_PROMPT.replace('{{GENRE}}', sys.genre).replace('{{CHAT_CONTEXT}}', ctx).replace('{{CURRENT_STATS}}', stats);
    
    const res = await callAI(p);
    if (!res) return;
    
    let changed = debuffsChanged;
    if (res.hpDelta) { sys.hp = Math.max(0, Math.min(sys.maxHp, sys.hp + res.hpDelta)); changed = true; }
    if (res.spDelta) { sys.sp = Math.max(0, Math.min(sys.maxSp, sys.sp + res.spDelta)); changed = true; }
    if (res.goldGained) { sys.gold += res.goldGained; changed = true; }
    if (res.xpGained) { sys.xp += res.xpGained; changed = true; }
    
    if (res.punishment) {
        sys.debuffs.push({ name: "System Penalty (Weakness)", duration: 10, effect: res.punishment });
        showToast("SYSTEM PENALTY APPLIED!", "warning");
        changed = true;
    }
    
    // Starvation / exhaustion debuff
    if (sys.sp <= 0 && !sys.debuffs.find(d => d.name === "Exhaustion")) {
        sys.debuffs.push({ name: "Exhaustion", duration: 5, effect: "Stats reduced by 50% due to 0 stamina." });
        showToast("Exhaustion Debuff Applied!", "warning");
        changed = true;
    }
    
    if (res.triggerQuest) {
        const qp = GENERATE_QUEST_PROMPT.replace('{{TITLE}}', res.triggerQuest);
        const q = await callAI(qp);
        if (q && q.title) { sys.quests.push(q); showToast(`HIDDEN QUEST: ${q.title}`, "info"); changed = true; }
    }
    
    if (changed) saveData();
}

async function generateMap() {
    $("#sys-map-loader").css("display", "flex");
    $("#sys-map-img").hide();
    
    const ctx = getContext().chat.slice(-10).map(m => `${m.name}: ${m.mes}`).join('\n');
    const p = GENERATE_MAP_PROMPT + `\nContext:\n${ctx}`;
    const res = await ConnectionManagerRequestService.sendRequest(sys.apiProfile || getExtensionSettings().connectionProfile, [{role:"user", content:p}], undefined, {stream:false, extractData:true});
    let prompt = typeof res === 'string' ? res : res.text;
    prompt = prompt.replace(/(\{|\[|\}|\])/g, '').trim(); // sanitize
    
    showToast("Generating Map Image...", "info");
    // Hook into SillyTavern's slash commands to trigger image generation
    await executeSlashCommands(`/imagine prompt=${prompt}`);
    
    // Try to find the latest image generated in the chat
    setTimeout(() => {
        const chat = getContext().chat;
        const lastMsg = chat[chat.length - 1];
        if (lastMsg && lastMsg.extra && lastMsg.extra.image) {
            $("#sys-map-img").attr("src", lastMsg.extra.image).show();
            $("#sys-map-loader").hide();
        } else {
            // Fallback if the image doesn't appear in extra (depends on ST version)
            showToast("Map requested! Check the main chat for the image.", "info");
            $("#sys-map-loader").hide();
        }
    }, 5000);
}

function showToast(msg, type="info") {
    let container = document.getElementById("sys-toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "sys-toast-container";
        container.style.cssText = "position:fixed; top:20px; right:20px; z-index:100000; display:flex; flex-direction:column; gap:10px; pointer-events:none;";
        document.body.appendChild(container);
    }
    const t = document.createElement("div");
    t.className = `sys-card ${type === 'warning' ? 'sys-debuff' : ''}`;
    t.style.cssText = "background: rgba(10,15,25,0.9); animation: sys-fadein 0.3s; pointer-events:auto;";
    t.innerHTML = `<div class="sys-card-title">${msg}</div>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 4000);
}

jQuery(async () => {
    const link = document.createElement("link");
    link.rel = "stylesheet"; link.href = `${extensionFolderPath}/style.css`;
    document.head.appendChild(link);
    await initUI();
    if (eventSource) eventSource.on(event_types.MESSAGE_RECEIVED, evaluateTurn);
});
