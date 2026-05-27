# Universal Vocab Saver & Local AI Assistant

Extensão Chrome que transforma palavras e frases de qualquer site da internet em elementos interativos de estudo. Ao clicar, o [Ollama](https://ollama.com) (rodando localmente) gera definições, explicações gramaticais, dicas e flashcards contextualizados prontos para o Obsidian.

---

## 🌟 Funcionalidades Principais

* **🌍 Suporte Universal (Multi-Site):** Funciona em qualquer site da internet (Wikipedia, Medium, documentações técnicas, blogs) e integra-se nativamente com legendas do YouTube.
* **🫧 Botão Flutuante (Bubble UI):** Um controle elegante no canto inferior direito da tela com efeito *glassmorphic* para ativar/desativar a extensão de forma dinâmica.
* **📊 Dois Modos de Seleção:**
  * **🔤 Modo Palavra (Word Mode):** Destaca e traduz termos isolados na página, gerando pronúncia em áudio e definições.
  * **📝 Modo Frase (Sentence Mode):** Destaca a frase inteira sob o cursor com um algoritmo passivo seguro (sem quebrar layouts). Traduz a frase inteira e explica estruturas gramaticais, phrasal verbs ou expressões contidas nela.
* **💾 Integração Obsidian SRS:** Cria automaticamente notas com 3 flashcards estruturados compatíveis com o plugin **Spaced Repetition** do Obsidian.
  * *Nomes Sanitizados:* Sentenças longas com caracteres proibidos (ex: `?`, `:`) são limpas e truncadas automaticamente para evitar erros no sistema.
  * *Cloze Oculto Inteligente:* No modo frase, a IA identifica a expressão gramatical principal na dica (`hint`) e oculta apenas ela no card (ex: `==used to==`), criando revisões extremamente práticas.

---

## 🛠️ Como Funciona

1. **Ative a extensão:** Clique no botão flutuante circular no canto do site para ativá-lo (ele ganhará um gradiente brilhante e indicador pulsante).
2. **Escolha o modo:** Passe o mouse sobre o botão para expandir o menu vertical e selecione **Palavra** ou **Frase**.
3. **Selecione o texto:**
   * No modo **Palavra**, passe o mouse sobre qualquer palavra para destacá-la. Clique para abrir o popup de tradução.
   * No modo **Frase**, passe o mouse sobre o texto para ver a frase inteira ser contornada por uma marcação azul translúcida. Clique para ver a tradução e explicação contextual da gramática.
4. **Salve no Obsidian:** Clique em **Salvar no Obsidian** para abrir o URI e criar a nota de estudo no seu vault instantaneamente.

---

## 📋 Pré-requisitos

* [Ollama](https://ollama.com) instalado e rodando localmente.
* Modelos sugeridos:
  * **`ollama pull qwen2.5:1.5b` (Recomendado):** Ultra-rápido, respondendo em cerca de **2.5s a 3.0s** locais, ideal para estudos contínuos.
  * **`ollama pull llama3.2`:** Modelo padrão de 3B parâmetros com alta precisão e respostas em cerca de **4.0s**.
* [Obsidian](https://obsidian.md) aberto com seu vault configurado.

---

## 🚀 Instalação

1. Clone ou baixe este repositório.
2. Abra `chrome://extensions` no Chrome.
3. Ative o **Modo desenvolvedor** no canto superior direito.
4. Clique em **Carregar sem compactação** e selecione a pasta deste projeto.
5. Clique no ícone da extensão no navegador para configurar o nome do seu **Vault Obsidian** e a **Pasta Destino** das notas.

---

## 📓 Estrutura dos Flashcards Gerados

Cada salvamento gera notas compatíveis com o plugin de repetição espaçada do Obsidian.

### Exemplo de Card (Modo Palavra):
```markdown
O que significa "already"? :: Já; indica que algo aconteceu antes do esperado.
Como se diz "anteriormente / antes" em inglês? :: already
"She had ==already== left when I arrived." :: already — Ela já tinha saído quando cheguei.
```

### Exemplo de Card (Modo Frase):
*Nome do arquivo sanitizado:* `I used to play tennis...`
```markdown
O que significa "I used to play tennis when I was a kid"? :: Eu costumava jogar tênis quando era criança.
Como se diz "used to" em inglês? :: I used to play tennis when I was a kid
"She ==used to== live in London before moving here." :: used to — Ela costumava morar em Londres antes de se mudar para cá.
```
