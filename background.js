const DEFAULT_MODEL = 'llama3.2';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_DEFINITION') {
    const { word, captionText, videoTitle, channel, mode } = msg;
    getDefinition(word, captionText, videoTitle, channel, mode)
      .then(result => sendResponse({ ok: true, ...result }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true; // keep channel open for async response
  }
});

async function getDefinition(word, captionText, videoTitle, channel, mode) {
  const { ollamaModel = DEFAULT_MODEL } = await chrome.storage.local.get('ollamaModel');

  let prompt = '';
  if (mode === 'sentence') {
    prompt = `Você é um professor de inglês especialista em gramática e tradução.
Analise a seguinte frase e gere explicações extremamente curtas, concisas e objetivas em português.

Frase alvo: "${word}"
Contexto da página: "${captionText}" (Título: "${videoTitle}")

Regras obrigatórias:
1. O campo "translation_pt_br" deve ser a tradução direta, fluida e natural da frase inteira para português brasileiro.
2. O campo "definition_pt_br" deve explicar a gramática da frase, phrasal verbs, gírias ou expressões idiomáticas contidas nela de forma muito simples (máximo 1 frase curta).
3. O campo "hint_pt_br" deve apontar a principal estrutura gramatical ou palavra-chave focada na frase (máximo 2 a 3 palavras), ex: "used to", "phrasal verb", "present perfect".
4. O campo "example_en" deve ser uma nova frase simples e curta em inglês (máximo 10 palavras) que aplique a mesma estrutura gramatical/expressão indicada na "hint_pt_br".
5. Responda estritamente com JSON válido.

JSON:
{
  "translation_pt_br": "tradução fluida da frase inteira",
  "definition_pt_br": "explicação gramatical curta de 1 frase",
  "hint_pt_br": "estrutura principal focada (2-3 palavras)",
  "example_en": "nova frase aplicando a mesma estrutura",
  "example_pt_br": "tradução da nova frase"
}`;
  } else {
    prompt = `Você é um dicionário inglês-português ultrarrápido para estudantes.
Gere respostas extremamente curtas, concisas e objetivas.

Palavra alvo: "${word}"
Contexto onde a palavra apareceu: "${captionText}" (Página/Vídeo: "${videoTitle}")

Regras obrigatórias:
1. Defina APENAS a palavra "${word}" isoladamente.
2. O campo "definition_pt_br" deve ser uma definição simples em português de no máximo 1 frase curta.
3. O campo "example_en" deve ser uma frase simples e curta em inglês (máximo 10 palavras) usando a palavra "${word}". NÃO copie do contexto.
4. Responda estritamente com JSON válido.

JSON:
{
  "translation_pt_br": "tradução direta (1 a 2 palavras)",
  "definition_pt_br": "definição curta de 1 frase simples",
  "hint_pt_br": "dica curta de 3 palavras sem revelar a palavra",
  "example_en": "frase curta nova em inglês",
  "example_pt_br": "tradução direta da frase curta"
}`;
  }

  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      prompt,
      stream: false,
      format: 'json',
      options: {
        temperature: 0.3,
        num_predict: 200
      },
      keep_alive: '60m'
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
