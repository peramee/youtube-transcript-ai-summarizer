import { DEFAULT_MODEL, DEFAULT_SYSTEM_PROMPT } from "./core.js";

const keyInput = document.getElementById("api-key");
const modelInput = document.getElementById("model");
const promptInput = document.getElementById("system-prompt");
const resetPrompt = document.getElementById("reset-prompt");
const status = document.getElementById("status");
const forget = document.getElementById("forget");
const form = document.getElementById("settings");
const save = form.querySelector('[type="submit"]');

function show(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}
function savedState(hasKey) {
  keyInput.value = "";
  keyInput.placeholder = hasKey ? "Key saved ••••••••" : "sk-…";
  forget.disabled = !hasKey;
}
save.disabled = true;
forget.disabled = true;
try {
  await chrome.storage.local.setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" });
  const settings = await chrome.storage.local.get(["apiKey", "model", "systemPrompt"]);
  modelInput.value = settings.model || DEFAULT_MODEL;
  promptInput.value = settings.systemPrompt || DEFAULT_SYSTEM_PROMPT;
  savedState(Boolean(settings.apiKey));
  save.disabled = false;
} catch { show("Could not load settings. Reopen the extension and try again.", true); }

form.addEventListener("submit", async event => {
  event.preventDefault();
  const apiKey = keyInput.value.trim();
  const model = modelInput.value.trim() || DEFAULT_MODEL;
  if (apiKey && (!apiKey.startsWith("sk-") || /\s/.test(apiKey))) return show("Enter a valid OpenAI API key beginning with sk-.", true);
  save.disabled = true;
  try {
    const existing = await chrome.storage.local.get("apiKey");
    await chrome.storage.local.set({ model, systemPrompt: promptInput.value.trim(), ...(apiKey ? { apiKey } : {}) });
    savedState(Boolean(apiKey || existing.apiKey));
    show(apiKey || existing.apiKey ? "Saved. You’re ready to summarize on YouTube." : "Settings saved. Add an API key before summarizing.");
  } catch { show("Could not save settings. Try again.", true); }
  finally { save.disabled = false; }
});
forget.addEventListener("click", async () => {
  try {
    await chrome.storage.local.remove("apiKey");
    savedState(false);
    show("API key removed from this browser.");
  } catch { show("Could not remove the key. Try again.", true); }
});

resetPrompt.addEventListener("click", () => {
  promptInput.value = DEFAULT_SYSTEM_PROMPT;
  show("Default prompt restored. Click Save settings to apply it.");
});
