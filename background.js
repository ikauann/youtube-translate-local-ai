const DEFAULT_MODEL = 'llama3.2';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_DEFINITION') {
    const { word, captionText, videoTitle, channel } = msg;
    getDefinition(word, captionText, videoTitle, channel)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function getDefinition(word, captionText, videoTitle, channel) {
  const { ollamaModel = DEFAULT_MODEL } = await chrome.storage.local.get('ollamaModel');

  const prompt = `Você é um assistente de vocabulário para aprendizes de inglês.

Palavra alvo: "${word}"
Contexto do vídeo: "${videoTitle}"${channel ? ` (canal: ${channel})` : ''}
Trecho da legenda onde a palavra apareceu: "${captionText}"

Regras obrigatórias:
1. Defina APENAS a palavra "${word}" isoladamente — não defina a frase nem o contexto.
2. O campo "example_en" deve ser uma frase NOVA criada por você. NÃO copie nem adapte o trecho da legenda.
3. A frase de exemplo deve conter a palavra "${word}" de forma clara e natural.
4. A frase de exemplo deve ser temáticamente relacionada ao vídeo quando possível.

Responda APENAS com JSON válido, sem texto extra:
{
  "translation_pt_br": "tradução direta e curta da palavra (1 a 3 palavras), considerando o contexto do vídeo",
  "definition_pt_br": "definição da palavra '${word}' em português brasileiro (máximo 2 frases)",
  "hint_pt_br": "dica curta em português (3 a 5 palavras) para lembrar o significado, sem revelar a palavra",
  "example_en": "frase nova em inglês que usa '${word}' claramente (não copiar da legenda)",
  "example_pt_br": "tradução da frase de exemplo para português brasileiro"
}`;

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
      format: 'json'
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama retornou status ${response.status}. Verifique se está rodando.`);
  }

  const data = await response.json();
  const parsed = JSON.parse(data.response);

  const exampleEn = parsed.example_en || '';
  const wordRegex = new RegExp(`\\b${word}\\b`, 'i');
  if (exampleEn && !wordRegex.test(exampleEn)) {
    // LLM forgot to include the word — append it explicitly so cloze works
    parsed.example_en = `${exampleEn} (${word})`;
  }

  return {
    translation_pt_br: parsed.translation_pt_br || '',
    definition_pt_br:  parsed.definition_pt_br  || 'Definição não disponível',
    hint_pt_br:        parsed.hint_pt_br        || word,
    example_en:        parsed.example_en        || 'Exemplo não disponível',
    example_pt_br:     parsed.example_pt_br     || ''
  };
}
