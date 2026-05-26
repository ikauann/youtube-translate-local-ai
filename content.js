(function () {
  'use strict';

  let popupContainer = null;
  let shadowRoot = null;

  const defaults = {
    ollamaModel: 'llama3.2',
    vaultName: 'trabalho-notas',
    targetFolder: '3-estudo/vocabulario'
  };

  let settings = { ...defaults };
  chrome.storage.local.get(Object.keys(defaults), saved => {
    settings = { ...defaults, ...saved };
  });

  // ── Caption word wrapping ──────────────────────────────────────────────

  function splitIntoWordSpans(text) {
    return text.split(/(\s+)/).map(part => {
      if (/^\s+$/.test(part)) return part;
      const word = part.match(/[a-zA-Z''-]+/)?.[0];
      if (!word) return part;
      return `<span class="vocab-word" data-word="${word}">${part}</span>`;
    }).join('');
  }

  function processSegment(segment) {
    const currentText = segment.textContent;
    if (!currentText.trim()) return;
    if (segment.dataset.vocabText === currentText) return;

    segment.dataset.vocabText = currentText;
    segment.innerHTML = splitIntoWordSpans(currentText);
    segment.querySelectorAll('.vocab-word').forEach(span =>
      span.addEventListener('click', handleWordClick)
    );
  }

  function observeCaptionWindow(captionWindow) {
    captionWindow.querySelectorAll('.ytp-caption-segment').forEach(processSegment);

    const observer = new MutationObserver(() => {
      captionWindow.querySelectorAll('.ytp-caption-segment').forEach(seg => {
        if (seg.dataset.vocabText !== seg.textContent) processSegment(seg);
      });
    });

    observer.observe(captionWindow, { childList: true, subtree: true, characterData: true });
  }

  function watchForCaptionWindows() {
    document.querySelectorAll('.caption-window').forEach(observeCaptionWindow);

    new MutationObserver(() => {
      document.querySelectorAll('.caption-window:not([data-vocab-observed])').forEach(win => {
        win.dataset.vocabObserved = '1';
        observeCaptionWindow(win);
      });
    }).observe(document.body, { childList: true, subtree: true });
  }

  // ── Video context helpers ──────────────────────────────────────────────

  function getVideoContext() {
    const video = document.querySelector('video');
    const timestamp = video ? Math.floor(video.currentTime) : 0;

    const titleEl = document.querySelector('#title h1, h1.ytd-video-primary-info-renderer');
    const videoTitle = (titleEl?.textContent?.trim() || document.title)
      .replace(/\s*[-–|]\s*YouTube\s*$/, '').trim();

    const channelEl = document.querySelector('#channel-name a, ytd-channel-name a');
    const channel = channelEl?.textContent?.trim() || '';

    const videoId = new URLSearchParams(window.location.search).get('v');
    const timestampUrl = videoId
      ? `https://youtu.be/${videoId}?t=${timestamp}`
      : window.location.href;

    return { videoTitle, channel, timestamp, timestampUrl };
  }

  // ── Word click → popup ─────────────────────────────────────────────────

  function handleWordClick(e) {
    e.stopPropagation();
    e.preventDefault();

    const word = e.target.dataset.word;
    if (!word) return;

    const captionWindow = e.target.closest('.caption-window');
    const captionText = captionWindow ? captionWindow.textContent.trim() : '';
    const videoCtx = getVideoContext();

    showPopup(e.target, word, captionText, videoCtx);
  }

  // ── Popup (Shadow DOM) ─────────────────────────────────────────────────

  const POPUP_CSS = `
    :host { all: initial; }

    .popup {
      position: fixed;
      width: 340px;
      background: #13131f;
      color: #e8e8f0;
      border: 1px solid #2a2a42;
      border-radius: 12px;
      padding: 18px 18px 16px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 14px;
      line-height: 1.55;
      box-shadow: 0 8px 32px rgba(0,0,0,0.7);
      z-index: 2147483647;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
    }
    .word-title {
      font-size: 20px;
      font-weight: 700;
      color: #7c8cf8;
      flex: 1;
    }
    .tag {
      font-size: 11px;
      font-weight: 600;
      color: #7c8cf8;
      background: #1e1e38;
      border: 1px solid #3a3a58;
      border-radius: 20px;
      padding: 2px 8px;
      letter-spacing: 0.03em;
    }
    .close-btn {
      cursor: pointer;
      background: none;
      border: none;
      color: #555570;
      font-size: 16px;
      padding: 0 0 0 4px;
      line-height: 1;
      transition: color 0.15s;
    }
    .close-btn:hover { color: #e8e8f0; }

    .translation {
      font-size: 13px;
      color: #8888cc;
      margin: -8px 0 10px;
      letter-spacing: 0.01em;
    }
    .translation span {
      color: #b0b0e8;
      font-weight: 600;
    }
    .divider {
      height: 1px;
      background: #2a2a42;
      margin: 0 0 14px;
    }

    .section-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: #44446a;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .definition {
      color: #c8c8e0;
      margin-bottom: 14px;
    }

    .example-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-bottom: 3px;
    }
    .example-en {
      font-style: italic;
      color: #e8e8f0;
      flex: 1;
    }
    .speak-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 15px;
      padding: 0;
      line-height: 1.55;
      opacity: 0.5;
      transition: opacity 0.15s;
      flex-shrink: 0;
    }
    .speak-btn:hover { opacity: 1; }
    .speak-btn.speaking { opacity: 1; animation: pulse 0.8s infinite alternate; }
    @keyframes pulse { from { opacity: 0.5; } to { opacity: 1; } }
    .example-pt {
      font-size: 13px;
      color: #6868aa;
      margin-bottom: 16px;
    }

    .save-btn {
      width: 100%;
      padding: 10px;
      background: #7c8cf8;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: background 0.15s;
    }
    .save-btn:hover { background: #6a7ae8; }

    .loading {
      color: #44446a;
      font-style: italic;
      padding: 8px 0 18px;
    }

    .error {
      color: #f87171;
      font-size: 13px;
      margin-bottom: 4px;
    }
  `;

  function showPopup(anchor, word, captionText, videoCtx) {
    closePopup();

    popupContainer = document.createElement('div');
    document.body.appendChild(popupContainer);
    shadowRoot = popupContainer.attachShadow({ mode: 'closed' });

    const rect = anchor.getBoundingClientRect();
    const top = Math.max(8, rect.top - 210);
    const left = Math.min(rect.left, window.innerWidth - 356);

    shadowRoot.innerHTML = `
      <style>${POPUP_CSS}</style>
      <div class="popup" style="top:${top}px;left:${left}px;">
        <div class="header">
          <span class="word-title">${word}</span>
          <span class="tag">inglês</span>
          <button class="close-btn">✕</button>
        </div>
        <div class="divider"></div>
        <div class="loading">Consultando Llama…</div>
      </div>
    `;

    shadowRoot.querySelector('.close-btn').addEventListener('click', closePopup);
    document.addEventListener('keydown', handleEsc);

    // Normalise caption: fix missing spaces around punctuation, collapse whitespace
    const cleanCaption = captionText
      .replace(/([,.!?;:])([^\s])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

    chrome.runtime.sendMessage(
      {
        type: 'GET_DEFINITION',
        word,
        captionText: cleanCaption,
        videoTitle: videoCtx.videoTitle,
        channel: videoCtx.channel
      },
      response => {
        if (!shadowRoot) return;
        const popup = shadowRoot.querySelector('.popup');
        popup.querySelector('.loading').remove();

        if (response && response.ok) {
          renderResult(popup, word, response, videoCtx);
        } else {
          const err = document.createElement('div');
          err.className = 'error';
          err.textContent = response?.error || 'Erro ao consultar Llama. Verifique se o Ollama está rodando.';
          popup.appendChild(err);
        }
      }
    );
  }

  function speak(text, btn) {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'en-US';
    utt.rate = 0.85;
    if (btn) {
      btn.classList.add('speaking');
      utt.onend = () => btn.classList.remove('speaking');
      utt.onerror = () => btn.classList.remove('speaking');
    }
    window.speechSynthesis.speak(utt);
  }

  function renderResult(popup, word, res, videoCtx) {
    const { translation_pt_br, definition_pt_br, hint_pt_br, example_en, example_pt_br } = res;

    const translationHtml = translation_pt_br
      ? `<div class="translation">= <span>${translation_pt_br}</span></div>`
      : '';

    popup.insertAdjacentHTML('beforeend', `
      ${translationHtml}
      <div class="section-label">Definição</div>
      <div class="definition">${definition_pt_br}</div>

      <div class="section-label">Exemplo</div>
      <div class="example-row">
        <div class="example-en">"${example_en}"</div>
        <button class="speak-btn" title="Ouvir em inglês">🔊</button>
      </div>
      <div class="example-pt">${example_pt_br}</div>

      <button class="save-btn">Salvar no Obsidian</button>
    `);

    const speakBtn = popup.querySelector('.speak-btn');
    speakBtn.addEventListener('click', () => speak(example_en, speakBtn));

    popup.querySelector('.save-btn').addEventListener('click', () => {
      window.speechSynthesis.cancel();
      saveToObsidian(word, definition_pt_br, hint_pt_br, example_en, example_pt_br, videoCtx);
    });
  }

  function saveToObsidian(word, definition, hint, exampleEn, examplePt, videoCtx) {
    const today = new Date().toISOString().split('T')[0];

    // Cloze: wrap the word occurrence in the example with ==
    const clozeExample = exampleEn.replace(
      new RegExp(`\\b${word}\\b`, 'i'),
      `==${word}==`
    );

    const content =
`---
data: ${today}
area: estudo
dominio: ingles
tags:
  - flashcards
  - ingles
fonte: "${videoCtx.videoTitle}"
---
# ${word}

> "${videoCtx.timestampUrl ? `[▶ Assistir no momento](${videoCtx.timestampUrl})` : videoCtx.videoTitle}"

## Flashcards

O que significa "${word}"? :: ${definition}
Como se diz "${hint}" em inglês? :: ${word}
"${clozeExample}" :: ${word} — ${examplePt}
`;

    const notePath = `${settings.targetFolder}/${word}`;
    const uri = `obsidian://new?vault=${encodeURIComponent(settings.vaultName)}&name=${encodeURIComponent(notePath)}&content=${encodeURIComponent(content)}`;

    window.open(uri);
    closePopup();
  }

  function closePopup() {
    document.removeEventListener('keydown', handleEsc);
    if (popupContainer) {
      popupContainer.remove();
      popupContainer = null;
    }
    shadowRoot = null;
  }

  function handleEsc(e) {
    if (e.key === 'Escape') closePopup();
  }

  // ── Boot ───────────────────────────────────────────────────────────────

  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      setTimeout(watchForCaptionWindows, 1500);
    }
  }).observe(document, { subtree: true, childList: true });

  watchForCaptionWindows();
})();
