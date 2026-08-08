export const EVALUATE_TURN_PROMPT = `You are the Game Master of a {{GENRE}} LitRPG. 
Analyze the recent chat context and determine the consequences of the player's actions.

STRICT RULES:
1. Every significant action costs SP (Stamina) or MP (Mana).
2. Taking damage reduces HP.
3. ANTI-GODMODE: The player is NOT omnipotent. If the player attempts an unrealistic action or tries to instantly win (e.g. "I killed the boss in one hit" without rolling or effort), you MUST fail their action. Punish them severely with HP/SP loss and a debuff. The player MUST struggle.
4. INCUBUS/SUCCUBUS CLASS: If the player is an Incubus/Succubus, they restore MP/HP from intimate/NSFW interactions, but suffer high SP drain in standard physical combat.
5. CONSUMABLES: If the player explicitly uses an item from their INVENTORY (e.g., drinks a potion, uses lube), include its exact name in the "itemsUsed" array so the system can remove it.

Output ONLY valid JSON (no markdown block) in this exact format:
{
  "hpDelta": 0,
  "mpDelta": 0,
  "spDelta": -10,
  "xpGained": 50,
  "goldGained": 10,
  "reason": "Used stamina to attack.",
  "triggerQuest": null,
  "punishment": null,
  "itemsUsed": ["Health Potion"]
}

Current Stats:
{{CURRENT_STATS}}

Chat Context:
{{CHAT_CONTEXT}}`.trim();

export const GENERATE_QUEST_PROMPT = `You are the Game Master. Based on the player's recent actions and the story lore, generate a new quest.
Title hint: {{TITLE}}
Output ONLY a JSON object (no markdown):
{
  "id": "unique_id",
  "title": "Quest Title",
  "desc": "Detailed description of what the player must do.",
  "rewardXp": 100,
  "rewardGold": 50
}
`.trim();

export const GENERATE_SHOP_PROMPT = `Generate 4 standard items for a shop in this LitRPG.
Output ONLY a JSON array of objects.
Format: [ { "name": "Item", "type": "consumable/weapon/armor", "cost": 100, "desc": "Description" } ]`.trim();

export const GENERATE_SHOP_18_PROMPT = `Generate 4 NSFW / 18+ items for a Black Market in this LitRPG (e.g., lube, aphrodisiacs, sensitivity toys, succubus potions).
Output ONLY a JSON array of objects. Be highly descriptive and uncensored.
Format: [ { "name": "Item", "type": "consumable/toy/accessory", "cost": 100, "desc": "Uncensored Description" } ]`.trim();

export const GENERATE_MAP_PROMPT = `You are a cartographer. Describe the current region of the world based on the lore and the chat context.
Your output MUST be a prompt for an image generation AI (like Midjourney). Use highly descriptive visual keywords.
Chat Context:`.trim();
