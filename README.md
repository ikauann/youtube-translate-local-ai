# YouTube Vocab Saver

Extensão Chrome que torna cada palavra das legendas do YouTube individualmente clicável. Ao clicar, o [Ollama](https://ollama.com) (rodando localmente) gera definição, tradução direta, exemplo com áudio e flashcards prontos para o Obsidian.

## Como funciona

1. Abra um vídeo no YouTube e ative as legendas
2. Passe o mouse sobre qualquer palavra — ela ficará sublinhada
3. Clique na palavra → popup aparece com definição em PT-BR, exemplo em inglês com tradução e botão de áudio 🔊
4. Clique em **Salvar no Obsidian** → nota criada automaticamente com 3 flashcards prontos para revisão espaçada (SRS)

## Pré-requisitos

- [Ollama](https://ollama.com) instalado e rodando localmente
- Modelo baixado: `ollama pull llama3.2`
- [Obsidian](https://obsidian.md) aberto com seu vault

## Instalação

1. Clone ou baixe este repositório
2. Abra `chrome://extensions` no Chrome
3. Ative o **Modo desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta do projeto
5. Configure vault e pasta destino clicando no ícone da extensão

## Flashcards gerados

Cada palavra salva gera 3 cards compatíveis com o plugin **Spaced Repetition** do Obsidian:

```
O que significa "already"? :: Já; indica que algo aconteceu antes do esperado.
Como se diz "anteriormente / antes" em inglês? :: already
"She had ==already== left when I arrived." :: already — Ela já tinha saído quando cheguei.
```

---

## Próximos Passos

### Gramática e Dicas Morfológicas

Detectar padrões morfológicos da palavra e exibir uma dica gramatical contextual no popup.

| Sufixo | Classe gramatical | Dica | Exemplo |
|--------|-------------------|------|---------|
| `-tely`, `-ly` | Advérbio | "Palavras com -ly são advérbios. Em PT-BR costumam terminar em -mente." | *completely → completamente* |
| `-ing` | Gerúndio / particípio presente | "Indica ação em progresso ou substantivo verbal." | *running, learning* |
| `-tion`, `-sion` | Substantivo abstrato | "Sufixo -tion forma substantivos. Equivale a -ção em PT-BR." | *connection → conexão* |
| `-ness` | Substantivo de qualidade | "Transforma adjetivo em substantivo." | *happiness, darkness* |
| `-er`, `-or` | Agente / comparativo | "Quem faz a ação (teacher) ou comparativo (faster)." | *teacher, bigger* |
| `-ed` | Passado / adjetivo | "Passado simples ou adjetivo participial." | *excited, finished* |
| `-able`, `-ible` | Adjetivo de possibilidade | "Indica que algo pode ser feito. Equivale a -ável/-ível." | *incredible → incrível* |
| `-ful` | Adjetivo positivo | "Cheio de. Equivale a -oso em PT-BR." | *powerful, beautiful* |
| `-less` | Adjetivo de ausência | "Ausência de algo. Oposto de -ful." | *endless, hopeless* |

**Abordagem planejada:** detecção local de sufixo (rápida, offline) + Llama como fallback para casos não cobertos pela regra.

### Outras Melhorias

- [ ] Suporte a outras plataformas (Netflix, Coursera, etc.)
- [ ] Histórico de palavras salvas acessível pelo popup
- [ ] Contador de palavras aprendidas (gamificação)
- [ ] Suporte a outros idiomas além de EN → PT-BR
