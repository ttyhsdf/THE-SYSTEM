import { getContext } from "../../../extensions.js";
import { saveSettingsDebounced, setExtensionPrompt } from "../../../../script.js";
import { eventSource, event_types } from "../../../events.js";
import { ConnectionManagerRequestService } from "../../shared.js";
import { executeSlashCommandsOnChatInput } from "../../../slash-commands.js";
import { PROMPTS } from "./prompts.js";

const extensionName = "sillytavern-litrpg-system"; // Keep download folder name here
const extensionFolderPath = `scripts/extensions/third-party/${extensionName}`;

const CLASSES = {
    Warrior: { name: "Warrior", hpMult: 1.5, spMult: 1.2, mpMult: 0.5, desc: "High HP & Stamina. Low Mana." },
    Mage: { name: "Mage", hpMult: 0.8, spMult: 0.8, mpMult: 2.0, desc: "High Mana. Low HP & Stamina." },
    Rogue: { name: "Rogue", hpMult: 1.0, spMult: 1.5, mpMult: 0.8, desc: "High Stamina for dodges." },
    Incubus: { name: "Incubus/Succubus", hpMult: 0.8, spMult: 0.8, mpMult: 1.5, desc: "Restores MP/HP from intimacy. Weak to physical/holy." }
};

const DEFAULT_SYS = {
    initialized: false,
    playerClass: null,
    level: 1, xp: 0, xpNeeded: 100, gold: 0,
    hp: 100, maxHp: 100,
    sp: 100, maxSp: 100,
    mp: 50, maxMp: 50,
    debuffs: [],
    inventory: [], 
    quests: [],
    completedQuests: [],
    shop: [],
    genre: "fantasy"
};

let sys = null;
let isEvaluating = false;
let globalSettings = { enabled: true, apiProfile: "", language: "en" };

jQuery(async () => {
    try {
        console.log("[THE SYSTEM] Booting up V4...");
        await initUI();
        
        if (eventSource && event_types) {
            eventSource.on(event_types.MESSAGE_RECEIVED, evaluateTurn);
            eventSource.on(event_types.CHAT_CHANGED, onChatChanged);
        }
        console.log("[THE SYSTEM] Successfully initialized.");
    } catch (e) {
        console.error("[THE SYSTEM] Fatal Error during init:", e);
    }
});

async function initUI() {
    const res = await fetch(`${extensionFolderPath}/index.html`);
    $("body").append(await res.text());
    
    const menuHtml = `
        <div class="extension_settings" id="the_system_settings">
            <div class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b><i class="fa-solid fa-microchip" style="color: #3498db; margin-right: 5px;"></i> THE SYSTEM V4</b>
                    <div class="inline-drawer-icon fa-solid fa-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none; padding: 10px;">
                    <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                        <input type="checkbox" id="sys-toggle-enabled" checked /> Enable THE SYSTEM globally
                    </label>
                    <p style="font-size: 0.9em; margin-bottom: 10px;">The floating buttons will appear when a chat is open and the system is enabled.</p>
                    <button class="menu_button interactable" onclick="$('#sys-main-modal').addClass('open');" style="width: 100%;">Open System Window</button>
                </div>
            </div>
        </div>
    `;
    $("#extensions_settings").append(menuHtml);
    
    // Load global settings
    const st = getContext().extensionSettings;
    if (!st.litrpg_v4_global) st.litrpg_v4_global = { enabled: true, apiProfile: "", language: "en" };
    globalSettings = st.litrpg_v4_global;
    if (!globalSettings.language) globalSettings.language = "en";
    
    $("#sys-toggle-enabled").prop("checked", globalSettings.enabled).on("change", function() {
        globalSettings.enabled = $(this).prop("checked");
        saveGlobal();
        checkVisibility();
    });
    
    setupEvents();
    checkVisibility();
}

function saveGlobal() {
    getContext().extensionSettings.litrpg_v4_global = globalSettings;
    saveSettingsDebounced();
}

function onChatChanged() {
    const chatId = getContext().chatId;
    if (!chatId) return;
    
    const st = getContext().extensionSettings;
    if (!st.litrpg_v4_chats) st.litrpg_v4_chats = {};
    
    if (!st.litrpg_v4_chats[chatId]) {
        st.litrpg_v4_chats[chatId] = Object.assign({}, DEFAULT_SYS);
    }
    
    sys = st.litrpg_v4_chats[chatId];
    sys.debuffs = sys.debuffs.filter(d => d.duration > 0);
    
    checkVisibility();
    
    if (globalSettings.enabled && !sys.initialized) {
        showAwakening();
    } else if (globalSettings.enabled) {
        updateUI();
        injectContext();
    }
}

function checkVisibility() {
    const chatId = getContext().chatId;
    if (globalSettings.enabled && chatId) {
        $(".sys-float-container").show();
    } else {
        $(".sys-float-container").hide();
        $("#sys-main-modal").removeClass("open");
        $("#sys-awakening-overlay").hide();
    }
}

function saveData() {
    const chatId = getContext().chatId;
    if (!chatId || !sys) return;
    getContext().extensionSettings.litrpg_v4_chats[chatId] = sys;
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
    $(".sys-class-card").off("click").on("click", function() {
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
        if(!sys) return showToast("No chat selected!", "warning");
        $("#sys-main-modal").addClass("open"); 
        $(".sys-tab").removeClass("active");
        $(".sys-panel").removeClass("active");
        $("[data-target='sys-panel-status']").addClass("active");
        $("#sys-panel-status").addClass("active");
        updateUI();
    });
    
    $("#sys-trigger-map").on("click", () => {
        if(!sys) return;
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
        if(!sys) return;
        if(confirm("Wipe all system data for this chat?")) {
            const chatId = getContext().chatId;
            getContext().extensionSettings.litrpg_v4_chats[chatId] = Object.assign({}, DEFAULT_SYS);
            sys = getContext().extensionSettings.litrpg_v4_chats[chatId];
            saveSettingsDebounced();
            $("#sys-main-modal").removeClass("open");
            showAwakening();
        }
    });
    
    $("#sys-btn-gen-map").on("click", generateMap);
    $("#sys-btn-refresh-shop").on("click", () => refreshShop(false));
    $("#sys-btn-refresh-shop-18").on("click", () => refreshShop(true));
    
    // Auto APIs
    const st = getContext().extensionSettings;
    if (st.connectionProfiles) {
        st.connectionProfiles.forEach(p => $("#sys-opt-api").append(`<option value="${p.name}">${p.name}</option>`));
        if (globalSettings.apiProfile) $("#sys-opt-api").val(globalSettings.apiProfile);
        $("#sys-opt-api").on('change', function() { globalSettings.apiProfile = $(this).val(); saveGlobal(); });
    }
    
    // Language Dropdown
    if (globalSettings.language) $("#sys-opt-lang").val(globalSettings.language);
    $("#sys-opt-lang").on('change', function() { globalSettings.language = $(this).val(); saveGlobal(); });
}

function checkLevelUp() {
    let leveledUp = false;
    while (sys.xp >= sys.xpNeeded) {
        sys.xp -= sys.xpNeeded;
        sys.level++;
        sys.xpNeeded = Math.floor(sys.xpNeeded * 1.5);
        
        const hpBoost = Math.floor(20 * sys.playerClass.hpMult);
        const spBoost = Math.floor(10 * sys.playerClass.spMult);
        const mpBoost = Math.floor(10 * sys.playerClass.mpMult);
        
        sys.maxHp += hpBoost; sys.hp = sys.maxHp;
        sys.maxSp += spBoost; sys.sp = sys.maxSp;
        sys.maxMp += mpBoost; sys.mp = sys.maxMp;
        
        leveledUp = true;
    }
    
    if (leveledUp) {
        const overlay = $("#sys-levelup-overlay");
        overlay.css("display", "flex");
        setTimeout(() => overlay.hide(), 3000);
        showToast(`LEVEL UP! You are now Level ${sys.level}!`, "info");
    }
    return leveledUp;
}

window.sysCompleteQuest = (idx) => {
    if(!sys) return;
    const q = sys.quests.splice(idx, 1)[0];
    sys.xp += q.rewardXp;
    sys.gold += q.rewardGold;
    sys.completedQuests.push(q);
    showToast(`Quest Completed: ${q.title}!`, "info");
    checkLevelUp();
    saveData();
};

window.sysBuyItem = (idx) => {
    if(!sys) return;
    const item = sys.shop[idx];
    if (sys.gold >= item.cost) {
        sys.gold -= item.cost;
        sys.inventory.push(item);
        sys.shop.splice(idx, 1);
        showToast(`Bought ${item.name}!`, "info");
        saveData();
    } else {
        showToast(`Not enough gold for ${item.name}!`, "warning");
        sys.debuffs.push({ name: "System Warning", duration: 5, effect: "Attempted to cheat the shop." });
        saveData();
    }
};

function updateUI() {
    if (!sys || !sys.initialized) return;
    
    $("#sys-class-name").text(sys.playerClass ? sys.playerClass.name : "None");
    $("#sys-val-level").text(sys.level);
    $("#sys-val-hp").text(`${sys.hp}/${sys.maxHp}`);
    $("#sys-val-sp").text(`${sys.sp}/${sys.maxSp}`);
    $("#sys-val-mp").text(`${sys.mp}/${sys.maxMp}`);
    $("#sys-val-gold").text(sys.gold);
    
    const xpPercent = Math.min(100, Math.floor((sys.xp / sys.xpNeeded) * 100));
    $("#sys-val-xp-bar").css("width", `${xpPercent}%`);
    $("#sys-val-xp-text").text(`${sys.xp} / ${sys.xpNeeded} XP`);
    
    // Debuffs
    const dList = $("#sys-debuffs-list");
    if (sys.debuffs.length === 0) dList.html('<i style="color:#888;">No active status effects.</i>');
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
    if (sys.quests.length === 0) qList.html('<i style="color:#888;">No active quests.</i>');
    else {
        qList.html(sys.quests.map((q, idx) => `
            <div class="sys-item-card" style="border-left-color: #f1c40f;">
                <div style="font-weight:bold; color: #f1c40f; padding-right: 80px;">${q.title}</div>
                <div style="font-size: 0.9em; margin: 5px 0;">${q.desc}</div>
                <div style="font-size: 0.8em; color: #fff;">Reward: ${q.rewardXp} XP | ${q.rewardGold} Gold</div>
                <button class="sys-buy-btn" onclick="sysCompleteQuest(${idx})">Done</button>
            </div>
        `).join(''));
    }
    
    const cqList = $("#sys-completed-quests-list");
    cqList.html(sys.completedQuests.map(q => `
        <div class="sys-item-card" style="border-left-color: #2ecc71; opacity: 0.7;">
            <div style="font-weight:bold; color: #2ecc71;">${q.title} (Completed)</div>
        </div>
    `).join(''));
    
    // Shop
    const shopList = $("#sys-shop-list");
    if (!sys.shop || sys.shop.length === 0) shopList.html('<i style="color:#888;">Shop is empty.</i>');
    else {
        shopList.html(sys.shop.map((item, idx) => `
            <div class="sys-item-card">
                <div style="font-weight:bold; color: #3498db;">${item.name} <span style="font-size:0.8em; color:#aaa;">[${item.type}]</span></div>
                <div style="font-size: 0.9em; margin: 5px 0;">${item.desc}</div>
                <div style="font-size: 0.8em; color: #f1c40f;"><i class="fa-solid fa-coins"></i> ${item.cost} Gold</div>
                <button class="sys-buy-btn" onclick="sysBuyItem(${idx})">Buy</button>
            </div>
        `).join(''));
    }
    
    // Inventory
    const invList = $("#sys-inventory-list");
    if (!sys.inventory || sys.inventory.length === 0) invList.html('<i style="color:#888;">Empty.</i>');
    else {
        invList.html(sys.inventory.map(item => `
            <div class="sys-item-card" style="border-left-color: #9b59b6; background: rgba(0,0,0,0.6);">
                <div style="font-weight:bold; color: #9b59b6;">${item.name} <span style="font-size:0.8em; color:#aaa;">[${item.type}]</span></div>
                <div style="font-size: 0.8em; margin-top: 5px; color: #ccc;">${item.desc}</div>
            </div>
        `).join(''));
    }
}

function injectContext() {
    if (!sys || !sys.initialized || !globalSettings.enabled) return;
    const debuffStr = sys.debuffs.length > 0 ? `DEBUFFS: ${sys.debuffs.map(d => d.name).join(', ')}` : "DEBUFFS: None";
    
    // Include full inventory descriptions for the AI so it knows what items do
    let invStr = "INVENTORY: Empty";
    if (sys.inventory.length > 0) {
        invStr = "INVENTORY:\n" + sys.inventory.map(i => `- ${i.name} (${i.type}): ${i.desc}`).join('\n');
    }
    
    const lang = globalSettings.language || "en";
    let p = PROMPTS[lang].INJECT_CONTEXT;
    p = p.replace("{{CLASS}}", sys.playerClass.name)
         .replace("{{LEVEL}}", sys.level)
         .replace("{{HP}}", sys.hp).replace("{{MAXHP}}", sys.maxHp)
         .replace("{{SP}}", sys.sp).replace("{{MAXSP}}", sys.maxSp)
         .replace("{{MP}}", sys.mp).replace("{{MAXMP}}", sys.maxMp)
         .replace("{{DEBUFFS}}", debuffStr)
         .replace("{{INVENTORY}}", invStr);

    try { setExtensionPrompt(extensionName, p, 1, 0); } 
    catch { getContext().extensionPrompt["litrpg_v4"] = p; }
}

async function callAI(prompt) {
    const cp = globalSettings.apiProfile || getContext().extensionSettings.connectionProfile;
    if (!cp) return null;
    try {
        const res = await ConnectionManagerRequestService.sendRequest(cp, [{role:"user", content:prompt}], undefined, {stream:false, extractData:true});
        let text = typeof res === 'string' ? res : res.text;
        const match = text.match(/(\{|\[)[\s\S]*(\}|\])/);
        return match ? JSON.parse(match[0]) : JSON.parse(text);
    } catch (e) {
        console.warn("[THE SYSTEM] AI call failed", e);
        return null;
    }
}

async function evaluateTurn() {
    if (!globalSettings.enabled || !sys || !sys.initialized || isEvaluating) return;
    
    try {
        isEvaluating = true;
        
        let debuffsChanged = false;
        sys.debuffs.forEach(d => { d.duration--; debuffsChanged = true; });
        sys.debuffs = sys.debuffs.filter(d => d.duration > 0);
        
        const ctx = getContext().chat.slice(-5).map(m => `${m.name}: ${m.mes}`).join('\n');
        const stats = `HP:${sys.hp}, SP:${sys.sp}, MP:${sys.mp}, Gold:${sys.gold}`;
        const lang = globalSettings.language || "en";
        const p = PROMPTS[lang].EVALUATE_TURN.replace('{{GENRE}}', sys.genre).replace('{{CHAT_CONTEXT}}', ctx).replace('{{CURRENT_STATS}}', stats);
        
        const res = await callAI(p);
        if (!res) { isEvaluating = false; return; }
        
        let changed = debuffsChanged;
        if (res.hpDelta) { sys.hp = Math.max(0, Math.min(sys.maxHp, sys.hp + res.hpDelta)); changed = true; }
        if (res.spDelta) { sys.sp = Math.max(0, Math.min(sys.maxSp, sys.sp + res.spDelta)); changed = true; }
        if (res.mpDelta) { sys.mp = Math.max(0, Math.min(sys.maxMp, sys.mp + res.mpDelta)); changed = true; }
        if (res.goldGained) { sys.gold += res.goldGained; changed = true; }
        if (res.xpGained) { sys.xp += res.xpGained; changed = true; }
        
        if (res.punishment) {
            sys.debuffs.push({ name: "System Penalty", duration: 5, effect: res.punishment });
            showToast("SYSTEM PENALTY!", "warning");
            changed = true;
        }
        
        if (sys.sp <= 0 && !sys.debuffs.find(d => d.name === "Exhaustion")) {
            sys.debuffs.push({ name: "Exhaustion", duration: 5, effect: "Stats halved due to 0 stamina." });
            showToast("Exhaustion Debuff!", "warning");
            changed = true;
        }
        
        if (res.triggerQuest) {
            const lang = globalSettings.language || "en";
            const qp = PROMPTS[lang].GENERATE_QUEST.replace(/\{\{TITLE\}\}/g, res.triggerQuest);
            const q = await callAI(qp);
            if (q && q.title) { sys.quests.push(q); showToast(`NEW QUEST: ${q.title}`, "info"); changed = true; }
        }
        
        if (res.itemsUsed && Array.isArray(res.itemsUsed)) {
            res.itemsUsed.forEach(itemName => {
                const idx = sys.inventory.findIndex(i => i.name.toLowerCase().includes(itemName.toLowerCase()));
                if (idx !== -1) {
                    sys.inventory.splice(idx, 1);
                    showToast(`Used Item: ${itemName}`, "info");
                    changed = true;
                }
            });
        }
        
        if (changed) {
            checkLevelUp();
            saveData();
        }
    } catch (e) {
        console.error("[THE SYSTEM] evaluateTurn Error:", e);
    } finally {
        isEvaluating = false;
    }
}

async function refreshShop(isNsfw = false) {
    if(!sys) return;
    showToast(isNsfw ? "Connecting to Black Market..." : "Generating shop items...", "info");
    const lang = globalSettings.language || "en";
    const p = isNsfw ? PROMPTS[lang].GENERATE_SHOP_18 : PROMPTS[lang].GENERATE_SHOP;
    const items = await callAI(p);
    if (items && Array.isArray(items)) {
        sys.shop = items.slice(0, 4);
        saveData();
    } else {
        showToast("Failed to generate items.", "warning");
    }
}

async function generateMap() {
    if(!sys) return;
    $("#sys-map-loader").css("display", "flex");
    $("#sys-map-img").hide();
    
    try {
        const ctx = getContext().chat.slice(-10).map(m => `${m.name}: ${m.mes}`).join('\n');
        const lang = globalSettings.language || "en";
        const p = PROMPTS[lang].GENERATE_MAP + `\n${ctx}`;
        const res = await ConnectionManagerRequestService.sendRequest(globalSettings.apiProfile || getContext().extensionSettings.connectionProfile, [{role:"user", content:p}], undefined, {stream:false, extractData:true});
        let prompt = typeof res === 'string' ? res : res.text;
        prompt = prompt.replace(/(\{|\[|\}|\])/g, '').trim(); 
        
        $("#sys-map-prompt").val(prompt);
        showToast("Map Prompt Generated!", "info");
        
        try {
            await executeSlashCommandsOnChatInput(`/imagine prompt=${prompt}`);
            setTimeout(() => {
                const chat = getContext().chat;
                const lastMsg = chat[chat.length - 1];
                if (lastMsg && lastMsg.extra && lastMsg.extra.image) {
                    $("#sys-map-img").attr("src", lastMsg.extra.image).show();
                }
                $("#sys-map-loader").hide();
            }, 5000);
        } catch(slashErr) {
            console.warn("Could not run /imagine", slashErr);
            $("#sys-map-loader").hide();
        }
    } catch (e) {
        console.error("[THE SYSTEM] generateMap error:", e);
        $("#sys-map-loader").hide();
    }
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
    t.className = `sys-item-card ${type === 'warning' ? 'sys-debuff' : ''}`;
    t.style.cssText = "background: rgba(10,15,25,0.9); pointer-events:auto;";
    t.innerHTML = `<div style="font-weight:bold; color: ${type==='warning'?'#e74c3c':'#3498db'};">${msg}</div>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = 0; setTimeout(() => t.remove(), 300); }, 4000);
}
