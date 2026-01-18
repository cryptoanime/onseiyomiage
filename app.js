const input = document.getElementById("textInput");
const speakBtn = document.getElementById("speakBtn");
const stopBtn = document.getElementById("stopBtn");
const preview = document.getElementById("preview");
const voiceSelect = document.getElementById("voiceSelect");
const rateInput = document.getElementById("rateInput");
const rateValue = document.getElementById("rateValue");
const pitchInput = document.getElementById("pitchInput");
const pitchValue = document.getElementById("pitchValue");

const urlPattern = /https?:\/\/[^\s]+|www\.[^\s]+/gi;
const boldPattern = /\*\*(.*?)\*\*|__(.*?)__/g;
const checkboxLinePattern = /(^|\n)\s*[-*]\s*\[(x|X| )\]\s*/g;
const checkboxSymbolPattern =
  /[\u2611\u2610\u2705\u2714\u2716\u2713\u25A1\u25A0\u25AA\u25CF\u25CB\u25FB\u25FC]/g;
const emojiPattern = /[\p{Extended_Pictographic}\uFE0F]/gu;
const symbolPattern = /[*#]+/g;
const markdownRefPattern = /\(\[[^\]]+\]\[[^\]]+\]\)/g;

const sanitizeText = (raw) => {
  if (!raw) return "";
  const withoutUrls = raw.replace(urlPattern, "");
  const withoutBold = withoutUrls.replace(boldPattern, (_, a, b) => a || b || "");
  const withoutCheckboxLines = withoutBold.replace(checkboxLinePattern, "$1");
  const withoutCheckboxSymbols = withoutCheckboxLines.replace(
    checkboxSymbolPattern,
    ""
  );
  const withoutMarkdownRefs = withoutCheckboxSymbols.replace(
    markdownRefPattern,
    ""
  );
  const withoutSymbols = withoutMarkdownRefs.replace(symbolPattern, "");
  const withoutEmoji = withoutSymbols.replace(emojiPattern, "");
  return withoutEmoji.replace(/\s+/g, " ").trim();
};

const getFullText = () => sanitizeText(input.value);
const getFromCursorText = () => {
  const start = input.selectionStart ?? 0;
  const raw = input.value || "";
  return sanitizeText(raw.slice(start));
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

let suppressAutoScroll = false;
let restoreScrollTimer = null;
let lastHighlightText = "";
let lastHighlightIndex = null;

const scheduleAutoScrollRestore = () => {
  if (restoreScrollTimer) clearTimeout(restoreScrollTimer);
  restoreScrollTimer = setTimeout(() => {
    suppressAutoScroll = false;
    if (lastHighlightText && lastHighlightIndex !== null) {
      renderPreview(lastHighlightText, lastHighlightIndex, true);
    }
  }, 5000);
};

const isElementVisibleWithin = (element, container) => {
  if (!element || !container) return false;
  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (
    elementRect.top >= containerRect.top &&
    elementRect.bottom <= containerRect.bottom
  );
};

const renderPreview = (text, highlightIndex = null, forceScroll = false) => {
  if (!text) {
    preview.textContent = "ここに読み上げ内容が表示されます";
    return;
  }
  const safeText = escapeHtml(text);
  if (highlightIndex === null || highlightIndex < 0) {
    preview.innerHTML = `<span class="read">${safeText}</span>`;
    return;
  }
  const before = safeText.slice(0, highlightIndex);
  const current = safeText.slice(highlightIndex, highlightIndex + 1);
  const after = safeText.slice(highlightIndex + 1);
  preview.innerHTML = `<span class="read">${before}</span><span class="highlight">${current}</span><span class="unread">${after}</span>`;
  const target = preview.querySelector(".highlight");
  if (!target) return;
  if (!forceScroll && suppressAutoScroll) return;
  if (!forceScroll && !isElementVisibleWithin(target, preview)) {
    suppressAutoScroll = true;
    scheduleAutoScrollRestore();
    return;
  }
  const block = forceScroll ? "center" : "nearest";
  target.scrollIntoView({ behavior: "smooth", block });
};

const updatePreview = () => {
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;
  const cleaned = end > start ? getFromCursorText() : getFullText();
  renderPreview(cleaned);
};

const updateSliderLabels = () => {
  rateValue.textContent = Number(rateInput.value).toFixed(1);
  pitchValue.textContent = Number(pitchInput.value).toFixed(1);
};

const storeSetting = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore storage errors
  }
};

const loadSetting = (key, fallback) => {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
};

const buildVoiceOptions = (voices) => {
  voiceSelect.innerHTML = "";
  const japaneseVoices = voices.filter((voice) => voice.lang.startsWith("ja"));
  const list = japaneseVoices.length ? japaneseVoices : voices;
  list.forEach((voice) => {
    const option = document.createElement("option");
    option.value = voice.name;
    option.textContent = `${voice.name} (${voice.lang})`;
    voiceSelect.appendChild(option);
  });

  const savedVoice = loadSetting("voiceName", "");
  const defaultVoice =
    list.find((voice) => voice.name === savedVoice) ||
    list.find((voice) => voice.lang === "ja-JP") ||
    list[0];
  if (defaultVoice) {
    voiceSelect.value = defaultVoice.name;
  }
};

const getSelectedVoice = (voices) => {
  const name = voiceSelect.value;
  return voices.find((voice) => voice.name === name) || null;
};

let fallbackTimer = null;

const clearFallback = () => {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
};

const startFallbackHighlight = (text) => {
  clearFallback();
  const rate = Number(rateInput.value) || 1;
  const charsPerSec = 5;
  const rawInterval = 1000 / (charsPerSec * rate);
  const intervalMs = Math.min(360, Math.max(120, rawInterval));
  let index = 0;
  fallbackTimer = setInterval(() => {
    renderPreview(text, index);
    index += 1;
    if (index >= text.length) {
      clearFallback();
    }
  }, intervalMs);
};

const speakText = (text, voices) => {
  if (!text) {
    preview.textContent = "読み上げる文章がありません";
    return;
  }
  window.speechSynthesis.cancel();
  clearFallback();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "ja-JP";
  utter.rate = Number(rateInput.value);
  utter.pitch = Number(pitchInput.value);
  const selected = getSelectedVoice(voices);
  if (selected) utter.voice = selected;

  let boundaryHit = false;
  utter.onstart = () => {
    lastHighlightText = text;
    lastHighlightIndex = 0;
    renderPreview(text, 0);
    setTimeout(() => {
      if (!boundaryHit) startFallbackHighlight(text);
    }, 300);
  };
  utter.onboundary = (event) => {
    boundaryHit = true;
    clearFallback();
    lastHighlightText = text;
    lastHighlightIndex = event.charIndex;
    renderPreview(text, event.charIndex);
  };
  utter.onend = () => {
    clearFallback();
    lastHighlightText = text;
    lastHighlightIndex = null;
    renderPreview(text);
  };
  utter.onerror = () => {
    clearFallback();
    lastHighlightText = text;
    lastHighlightIndex = null;
    renderPreview(text);
  };
  window.speechSynthesis.speak(utter);
};

const initVoices = () => {
  let voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    window.speechSynthesis.addEventListener("voiceschanged", () => {
      voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        buildVoiceOptions(voices);
      }
    });
  } else {
    buildVoiceOptions(voices);
  }
  return () => (voices = window.speechSynthesis.getVoices());
};

initVoices();

let lastReadMode = "all";
let autoSpeakTimer = null;

const speakAll = () => {
  const voices = window.speechSynthesis.getVoices();
  lastReadMode = "all";
  speakText(getFullText(), voices);
};

const speakFromCursor = () => {
  const voices = window.speechSynthesis.getVoices();
  lastReadMode = "cursor";
  speakText(getFromCursorText(), voices);
};

const stop = () => {
  window.speechSynthesis.cancel();
  clearFallback();
};

const autoSpeak = () => {
  if (autoSpeakTimer) clearTimeout(autoSpeakTimer);
  autoSpeakTimer = setTimeout(() => {
    const voices = window.speechSynthesis.getVoices();
    const text = lastReadMode === "cursor" ? getFromCursorText() : getFullText();
    speakText(text, voices);
  }, 150);
};

let pointerDownAt = 0;
input.addEventListener("pointerdown", () => {
  pointerDownAt = Date.now();
});
input.addEventListener("pointerup", () => {
  const held = Date.now() - pointerDownAt;
  if (held >= 450) {
    speakFromCursor();
  }
});

document.addEventListener("selectionchange", () => {
  if (document.activeElement === input) {
    updatePreview();
  }
});

preview.addEventListener("scroll", () => {
  suppressAutoScroll = true;
  scheduleAutoScrollRestore();
});

window.addEventListener("scroll", () => {
  suppressAutoScroll = true;
  scheduleAutoScrollRestore();
});

input.addEventListener("input", updatePreview);
speakBtn.addEventListener("click", speakAll);
stopBtn.addEventListener("click", stop);

voiceSelect.addEventListener("change", () => {
  storeSetting("voiceName", voiceSelect.value);
});

rateInput.addEventListener("input", () => {
  updateSliderLabels();
  storeSetting("rateValue", rateInput.value);
  autoSpeak();
});

pitchInput.addEventListener("input", () => {
  updateSliderLabels();
  storeSetting("pitchValue", pitchInput.value);
  autoSpeak();
});

rateInput.value = loadSetting("rateValue", rateInput.value);
pitchInput.value = loadSetting("pitchValue", pitchInput.value);
updateSliderLabels();
updatePreview();
