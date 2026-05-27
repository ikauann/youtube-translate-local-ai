(function () {
  'use strict';

  let popupContainer = null;
  let shadowRoot = null;
  let toggleButtonContainer = null;
  let toggleShadowRoot = null;
  let highlightOverlay = null;
  let vocabSaverActive = false;

  const defaults = {
    ollamaModel: 'llama3.2',
    vaultName: 'trabalho-notas',
    targetFolder: '3-estudo/vocabulario',
    vocabSelectionMode: 'word'
  };

  let settings = { ...defaults };

  // Load settings and active state
  chrome.storage.local.get(['vocabSaverActive', 'vocabSelectionMode', ...Object.keys(defaults)], saved => {
    settings = { ...defaults, ...saved };
    vocabSaverActive = !!saved.vocabSaverActive;
    injectToggleButton();
    updateToggleButtonState();
    toggleExtensionBehavior();
  });

  // Sync state changes from storage (e.g. from popup or other tabs)
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if ('vocabSaverActive' in changes) {
        vocabSaverActive = !!changes.vocabSaverActive.newValue;
        updateToggleButtonState();
        toggleExtensionBehavior();
      }
      if ('vocabSelectionMode' in changes) {
        settings.vocabSelectionMode = changes.vocabSelectionMode.newValue;
        updateToggleButtonState();
      }
      // Keep settings updated
      const keys = Object.keys(defaults);
      keys.forEach(key => {
        if (key in changes) {
          settings[key] = changes[key].newValue;
        }
      });
    }
  });

  // ── Word Range & Extraction Helpers ─────────────────────────────────────

  function getWordRangeAtPosition(textNode, offset) {
    const text = textNode.textContent;
    let start = offset;
    let end = offset;
    
    const isWordChar = (char) => /[a-zA-Z''-]/.test(char);
    
    while (start > 0 && isWordChar(text[start - 1])) {
      start--;
    }
    while (end < text.length && isWordChar(text[end])) {
      end++;
    }
    
    const word = text.slice(start, end);
    if (!word.match(/[a-zA-Z''-]+/)) return null;

    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    return { range, word };
  }

  // ── Sentence Range & Extraction Helpers ──────────────────────────────────

  function getAbsoluteOffset(blockEl, textNode, offset) {
    let absoluteOffset = 0;
    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node === textNode) {
        absoluteOffset += offset;
        break;
      }
      absoluteOffset += node.textContent.length;
    }
    return absoluteOffset;
  }

  function getSentenceBoundaries(text, offset) {
    let start = offset;
    let end = offset;
    
    const isTerminator = (char, nextChar) => {
      if (['.', '!', '?'].includes(char)) {
        return !nextChar || /\s/.test(nextChar);
      }
      return false;
    };

    // Search left
    while (start > 0) {
      if (isTerminator(text[start - 1], text[start])) {
        while (start < offset && /\s/.test(text[start])) {
          start++;
        }
        break;
      }
      start--;
    }

    // Search right
    while (end < text.length) {
      if (isTerminator(text[end], text[end + 1])) {
        end++; // Include the terminator
        break;
      }
      end++;
    }

    return { start, end };
  }

  function createRangeFromOffsets(blockEl, startOffset, endOffset) {
    const range = document.createRange();
    let currentOffset = 0;
    let startNode = null;
    let startNodeOffset = 0;
    let endNode = null;
    let endNodeOffset = 0;

    const walker = document.createTreeWalker(blockEl, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const len = node.textContent.length;
      
      if (!startNode && currentOffset + len >= startOffset) {
        startNode = node;
        startNodeOffset = startOffset - currentOffset;
      }
      if (!endNode && currentOffset + len >= endOffset) {
        endNode = node;
        endNodeOffset = endOffset - currentOffset;
        break;
      }
      currentOffset += len;
    }

    if (startNode && endNode) {
      range.setStart(startNode, startNodeOffset);
      range.setEnd(endNode, endNodeOffset);
      return range;
    }
    return null;
  }

  function getSentenceRangeAtPosition(textNode, offset) {
    const blockEl = textNode.parentElement?.closest('p, li, blockquote, h1, h2, h3, h4, h5, h6, div, [class*="caption-window"]');
    if (!blockEl) return null;

    const text = blockEl.textContent;
    const absOffset = getAbsoluteOffset(blockEl, textNode, offset);
    const { start, end } = getSentenceBoundaries(text, absOffset);

    const sentence = text.slice(start, end).trim();
    if (!sentence || sentence.length < 3) return null;

    const range = createRangeFromOffsets(blockEl, start, end);
    if (!range) return null;

    return { range, sentence };
  }

  // ── Caption word wrapping (YouTube captions specific) ───────────────────

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
    const isSentenceMode = settings.vocabSelectionMode === 'sentence';
    if (!vocabSaverActive || isSentenceMode) return; // Ignore word-span click in sentence mode
    e.stopPropagation();
    e.preventDefault();

    const word = e.target.dataset.word;
    if (!word) return;

    const captionWindow = e.target.closest('.caption-window');
    const captionText = captionWindow ? captionWindow.textContent.trim() : '';
    const videoCtx = getVideoContext();

    showPopup(e.target, word, captionText, videoCtx);
  }

  // ── General Document Listeners (Click & Hover) ─────────────────────────

  function handleDocumentClick(e) {
    if (!vocabSaverActive) return;

    // Ignore if clicked inside our own UI containers
    const path = e.composedPath();
    if (toggleButtonContainer && path.includes(toggleButtonContainer)) return;
    if (popupContainer && path.includes(popupContainer)) return;

    // Ignore clicks on interactive elements to prevent breaking normal navigation/interaction
    const isInteractive = path.some(el => {
      if (!el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return ['button', 'a', 'input', 'textarea', 'select', 'option', 'label'].includes(tag) || 
             el.getAttribute?.('role') === 'button' ||
             el.style?.cursor === 'pointer';
    });
    if (isInteractive) return;

    let word = '';
    let contextText = '';
    let videoCtx = null;
    const isSentenceMode = settings.vocabSelectionMode === 'sentence';

    // Check if we clicked on an existing wrapped vocab-word (e.g. YouTube subtitles)
    const vocabWordSpan = e.target.closest('.vocab-word');
    if (vocabWordSpan && !isSentenceMode) {
      word = vocabWordSpan.dataset.word;
      const captionWindow = e.target.closest('.caption-window');
      contextText = captionWindow ? captionWindow.textContent.trim() : '';
      videoCtx = getVideoContext();
    } else {
      // General website click detection using caretRangeFromPoint
      if (!document.caretRangeFromPoint) return;
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      if (!range) return;

      const textNode = range.startContainer;
      if (textNode.nodeType !== Node.TEXT_NODE) return;

      const offset = range.startOffset;
      
      if (isSentenceMode) {
        const sentenceRes = getSentenceRangeAtPosition(textNode, offset);
        if (!sentenceRes) return;
        word = sentenceRes.sentence;
        contextText = textNode.parentElement ? textNode.parentElement.textContent.trim() : '';
      } else {
        const wordRes = getWordRangeAtPosition(textNode, offset);
        if (!wordRes) return;
        word = wordRes.word;
        contextText = textNode.parentElement ? textNode.parentElement.textContent.trim() : '';
      }

      const pageTitle = document.title || 'Página Web';
      const pageUrl = window.location.href;
      videoCtx = {
        videoTitle: pageTitle,
        channel: new URL(pageUrl).hostname,
        timestamp: 0,
        timestampUrl: pageUrl
      };
    }

    if (word) {
      e.preventDefault();
      e.stopPropagation();
      showPopup({ x: e.clientX, y: e.clientY }, word, contextText, videoCtx);
    }
  }

  function handleDocumentMouseMove(e) {
    if (!vocabSaverActive) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    const path = e.composedPath();
    if (toggleButtonContainer && path.includes(toggleButtonContainer)) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }
    if (popupContainer && path.includes(popupContainer)) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    // Ignore interactive elements
    const isInteractive = path.some(el => {
      if (!el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      return ['button', 'a', 'input', 'textarea', 'select', 'option', 'label'].includes(tag) || 
             el.getAttribute?.('role') === 'button' ||
             el.style?.cursor === 'pointer';
    });
    if (isInteractive) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    if (!document.caretRangeFromPoint) return;
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (!range) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    const isSentenceMode = settings.vocabSelectionMode === 'sentence';

    // Don't show range highlight inside wrapped spans on YouTube if we are hovering captions and NOT in sentence mode (captions have CSS highlights)
    if (!isSentenceMode && textNode.parentElement && textNode.parentElement.closest('.caption-window')) {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
      return;
    }

    const offset = range.startOffset;
    let targetRange = null;

    if (isSentenceMode) {
      const sentenceRes = getSentenceRangeAtPosition(textNode, offset);
      if (sentenceRes) targetRange = sentenceRes.range;
    } else {
      const wordRes = getWordRangeAtPosition(textNode, offset);
      if (wordRes) targetRange = wordRes.range;
    }

    if (targetRange) {
      const rect = targetRange.getBoundingClientRect();

      createHighlightOverlay();
      highlightOverlay.style.display = 'block';
      highlightOverlay.style.left = `${rect.left + window.scrollX - 2}px`;
      highlightOverlay.style.top = `${rect.top + window.scrollY}px`;
      highlightOverlay.style.width = `${rect.width + 4}px`;
      highlightOverlay.style.height = `${rect.height}px`;
    } else {
      if (highlightOverlay) highlightOverlay.style.display = 'none';
    }
  }

  function createHighlightOverlay() {
    if (highlightOverlay) return;
    highlightOverlay = document.createElement('div');
    highlightOverlay.id = 'vocab-saver-highlight-overlay';
    highlightOverlay.style.position = 'absolute';
    highlightOverlay.style.pointerEvents = 'none';
    highlightOverlay.style.background = 'rgba(124, 140, 248, 0.18)';
    highlightOverlay.style.borderBottom = '2px solid #7c8cf8';
    highlightOverlay.style.borderRadius = '3px';
    highlightOverlay.style.zIndex = '2147483645';
    highlightOverlay.style.display = 'none';
    highlightOverlay.style.transition = 'all 0.08s ease-out';
    document.body.appendChild(highlightOverlay);
  }

  // ── Toggle Button Insertion ────────────────────────────────────────────

  function injectToggleButton() {
    if (document.getElementById('vocab-saver-toggle-container')) return;

    toggleButtonContainer = document.createElement('div');
    toggleButtonContainer.id = 'vocab-saver-toggle-container';
    toggleButtonContainer.style.position = 'fixed';
    toggleButtonContainer.style.right = '24px';
    toggleButtonContainer.style.bottom = '24px';
    toggleButtonContainer.style.zIndex = '2147483647';
    document.body.appendChild(toggleButtonContainer);

    toggleShadowRoot = toggleButtonContainer.attachShadow({ mode: 'closed' });

    const TOGGLE_CSS = `
      .menu-container {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 8px;
        position: relative;
      }

      .menu-panel {
        display: flex;
        flex-direction: column;
        background: rgba(20, 20, 35, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 6px;
        gap: 4px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
        opacity: 0;
        visibility: hidden;
        transform: translateY(10px);
        transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
        width: 120px;
      }

      /* Hover container to reveal menu panel when active */
      .menu-container:hover .menu-panel.active-state {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
        pointer-events: auto;
      }

      .menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        background: none;
        border: none;
        color: #8888aa;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 12px;
        font-weight: 500;
        text-align: left;
        transition: all 0.2s;
        width: 100%;
        position: relative;
        outline: none;
      }

      .menu-item:hover {
        background: rgba(255, 255, 255, 0.06);
        color: #e8e8f0;
      }

      .menu-item.selected {
        color: #7c8cf8;
        background: rgba(124, 140, 248, 0.1);
      }

      .menu-icon {
        width: 14px;
        height: 14px;
        stroke: currentColor;
        stroke-width: 2.5;
        fill: none;
      }

      .active-dot {
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: #7c8cf8;
        position: absolute;
        right: 10px;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .menu-item.selected .active-dot {
        opacity: 1;
      }

      .toggle-btn {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
        position: relative;
        border: none;
        outline: none;
        padding: 0;
      }
      
      .toggle-btn.inactive {
        background: rgba(20, 20, 35, 0.85);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #8888aa;
      }
      .toggle-btn.inactive:hover {
        background: rgba(28, 28, 48, 0.95);
        color: #b0b0e8;
        transform: scale(1.08);
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
      }
      
      .toggle-btn.active {
        background: linear-gradient(135deg, #7c8cf8, #5a6ae8);
        color: #ffffff;
        transform: scale(1.0);
        border: none;
      }
      .toggle-btn.active:hover {
        transform: scale(1.08);
        box-shadow: 0 0 15px rgba(124, 140, 248, 0.6), 0 6px 20px rgba(0, 0, 0, 0.5);
      }
      .toggle-btn.active::after {
        content: '';
        position: absolute;
        width: 100%;
        height: 100%;
        border-radius: 50%;
        background: inherit;
        top: 0;
        left: 0;
        z-index: -1;
        opacity: 0.4;
        animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
      }
      
      @keyframes pulse-ring {
        0% { transform: scale(0.95); opacity: 0.5; }
        50% { transform: scale(1.25); opacity: 0; }
        100% { transform: scale(1.25); opacity: 0; }
      }

      .tooltip {
        position: absolute;
        bottom: 58px;
        right: 0;
        background: #13131f;
        color: #e8e8f0;
        padding: 6px 12px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 11px;
        font-weight: 500;
        white-space: nowrap;
        border: 1px solid #2a2a42;
        box-shadow: 0 6px 20px rgba(0,0,0,0.6);
        opacity: 0;
        visibility: hidden;
        transform: translateY(6px);
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        pointer-events: none;
      }
      
      .menu-container:hover .tooltip {
        opacity: 0 !important;
        visibility: hidden !important;
      }
      
      .toggle-btn:hover + .tooltip {
        opacity: 1;
        visibility: visible;
        transform: translateY(0);
      }

      svg.toggle-icon {
        width: 22px;
        height: 22px;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .toggle-btn:hover svg.toggle-icon {
        transform: rotate(5deg);
      }
    `;

    toggleShadowRoot.innerHTML = `
      <style>${TOGGLE_CSS}</style>
      <div class="menu-container">
        <div class="menu-panel" id="vocab-menu-panel">
          <button class="menu-item" id="mode-word-btn">
            <svg class="menu-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path d="M4 7V4h16v3M9 20h6M12 4v16"/>
            </svg>
            <span>Palavra</span>
            <span class="active-dot"></span>
          </button>
          <button class="menu-item" id="mode-sentence-btn">
            <svg class="menu-icon" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <line x1="4" y1="9" x2="20" y2="9"></line>
              <line x1="4" y1="15" x2="14" y2="15"></line>
            </svg>
            <span>Frase</span>
            <span class="active-dot"></span>
          </button>
        </div>
        
        <button class="toggle-btn inactive" id="vocab-toggle-btn">
          <svg class="toggle-icon" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </button>
        <div class="tooltip" id="vocab-toggle-tooltip">Ativar Vocab Saver</div>
      </div>
    `;

    const button = toggleShadowRoot.getElementById('vocab-toggle-btn');
    button.addEventListener('click', () => {
      const newState = !vocabSaverActive;
      chrome.storage.local.set({ vocabSaverActive: newState });
    });

    const wordBtn = toggleShadowRoot.getElementById('mode-word-btn');
    const sentenceBtn = toggleShadowRoot.getElementById('mode-sentence-btn');

    if (wordBtn) wordBtn.addEventListener('click', () => {
      chrome.storage.local.set({ vocabSelectionMode: 'word' });
    });
    if (sentenceBtn) sentenceBtn.addEventListener('click', () => {
      chrome.storage.local.set({ vocabSelectionMode: 'sentence' });
    });
  }

  function updateToggleButtonState() {
    if (!toggleShadowRoot) return;
    const button = toggleShadowRoot.getElementById('vocab-toggle-btn');
    const tooltip = toggleShadowRoot.getElementById('vocab-toggle-tooltip');
    const menuPanel = toggleShadowRoot.getElementById('vocab-menu-panel');
    if (!button) return;

    if (vocabSaverActive) {
      button.className = 'toggle-btn active';
      tooltip.textContent = 'Desativar Vocab Saver (Ativo)';
      if (menuPanel) menuPanel.classList.add('active-state');
    } else {
      button.className = 'toggle-btn inactive';
      tooltip.textContent = 'Ativar Vocab Saver (Inativo)';
      if (menuPanel) menuPanel.classList.remove('active-state');
    }

    // Update selection items Selected style
    const wordBtn = toggleShadowRoot.getElementById('mode-word-btn');
    const sentenceBtn = toggleShadowRoot.getElementById('mode-sentence-btn');
    if (wordBtn && sentenceBtn) {
      if (settings.vocabSelectionMode === 'sentence') {
        wordBtn.classList.remove('selected');
        sentenceBtn.classList.add('selected');
      } else {
        wordBtn.classList.add('selected');
        sentenceBtn.classList.remove('selected');
      }
    }
  }

  function toggleExtensionBehavior() {
    if (vocabSaverActive) {
      document.body.classList.add('vocab-saver-active');
      document.addEventListener('click', handleDocumentClick, true);
      document.addEventListener('mousemove', handleDocumentMouseMove);
    } else {
      document.body.classList.remove('vocab-saver-active');
      document.removeEventListener('click', handleDocumentClick, true);
      document.removeEventListener('mousemove', handleDocumentMouseMove);
      if (highlightOverlay) highlightOverlay.style.display = 'none';
    }
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

  function showPopup(anchorOrCoords, word, captionText, videoCtx) {
    closePopup();

    popupContainer = document.createElement('div');
    document.body.appendChild(popupContainer);
    shadowRoot = popupContainer.attachShadow({ mode: 'closed' });

    let top, left;
    if (anchorOrCoords && typeof anchorOrCoords.getBoundingClientRect === 'function') {
      const rect = anchorOrCoords.getBoundingClientRect();
      top = Math.max(8, rect.top - 210);
      left = Math.min(rect.left, window.innerWidth - 356);
    } else if (anchorOrCoords && typeof anchorOrCoords.x === 'number' && typeof anchorOrCoords.y === 'number') {
      top = Math.max(8, anchorOrCoords.y - 220);
      left = Math.min(anchorOrCoords.x, window.innerWidth - 356);
    } else {
      top = 100;
      left = 100;
    }

    const isSentence = word.includes(' ');
    const tagText = isSentence ? 'frase' : 'inglês';

    shadowRoot.innerHTML = `
      <style>${POPUP_CSS}</style>
      <div class="popup" style="top:${top}px;left:${left}px;">
        <div class="header">
          <span class="word-title" title="${word}">${word.length > 25 ? word.slice(0, 22) + '...' : word}</span>
          <span class="tag">${tagText}</span>
          <button class="close-btn">✕</button>
        </div>
        <div class="divider"></div>
        <div class="loading">Consultando Llama…</div>
      </div>
    `;

    shadowRoot.querySelector('.close-btn').addEventListener('click', closePopup);
    document.addEventListener('keydown', handleEsc);

    const cleanCaption = captionText
      .replace(/([,.!?;:])([^\s])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();

    const startTime = performance.now();
    chrome.runtime.sendMessage(
      {
        type: 'GET_DEFINITION',
        word,
        captionText: cleanCaption,
        videoTitle: videoCtx.videoTitle,
        channel: videoCtx.channel,
        mode: settings.vocabSelectionMode || 'word'
      },
      response => {
        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`[Vocab Saver] Tempo de resposta para "${word.length > 20 ? word.slice(0, 18) + '...' : word}": ${duration}s`);
        
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
    const isSentence = word.includes(' ');

    const clozeTarget = isSentence ? hint : word;
    const clozeExample = exampleEn.replace(
      new RegExp(`\\b${clozeTarget}\\b`, 'i'),
      `==${clozeTarget}==`
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
"${clozeExample}" :: ${clozeTarget} — ${examplePt}
`;

    // Sanitize and truncate the note file name if in sentence mode to avoid OS filesystem issues
    let noteName = word;
    if (isSentence) {
      noteName = word.replace(/[\\/:*?"<>|]/g, '').trim();
      if (noteName.length > 35) {
        noteName = noteName.slice(0, 35).trim() + '...';
      }
    }

    const notePath = `${settings.targetFolder}/${noteName}`;
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
