# Efeito de scroll "baralho" nos cards de Cases

## Contexto
Seção `#cases` (3 cards, `.case-card`), cada um hoje mostra Antes/Depois em duas
colunas lado a lado (`.case-shots`, `.case-shot-col`). Pedido: efeito de scroll
parecido com o do Hero (contínuo, reversível), mas em vez de crossfade plano,
os dois prints ficam sobrepostos como um baralho — o de trás visível em
perspectiva, com menor destaque — e o scroll troca qual está na frente.

## Decisões
- Layout: Antes/Depois passam a ocupar a **mesma área**, sobrepostos
  (`.case-stack`), não mais colunas lado a lado.
- Mecânica de scroll: **por card, sem travar a página** — cada `.case-stack`
  calcula seu progresso pela posição na viewport, reaproveitando o loop de
  `requestAnimationFrame` que já existe em `script.js` (`onFrame()`, junto de
  `applyHero()`/`fitConst()`). Sem scroll-jack, sem nova dependência.
- Identificação: cada print carrega um **selo fixo no canto** ("ANTES" /
  "DEPOIS"), não um rótulo dinâmico único — assim dá pra saber qual é qual
  independente de estar na frente ou atrás.
- Abordagens descartadas: CSS `animation-timeline` puro (suporte de browser
  ainda inconsistente pra um site de captação de lead); swap binário via
  IntersectionObserver (não dá o efeito contínuo/flutuante pedido).

## Mecânica visual
- **Frente:** `scale(1)`, sem deslocamento, opacidade 1, sombra forte, `z-index` maior.
- **Fundo:** `scale(~0.9)`, deslocado (leve translação, tipo baralho aberto),
  opacidade `~0.55`, sem sombra, `z-index` menor.
- Progresso `p` (0→1) interpola escala/deslocamento/opacidade continuamente
  entre os dois estados; o `z-index` troca no meio do trajeto (~p=0.5), ponto
  em que os dois cards estão visualmente quase do mesmo tamanho — a troca não
  salta aos olhos.
- Easing: mesma curva smoothstep do Hero (`p*p*(3-2p)`).

## Cálculo do progresso
Por `.case-stack`, via `getBoundingClientRect()`:
- `p = 0` quando o topo do card está perto do fundo da viewport (~85% da altura).
- `p = 1` quando o card já subiu bastante (~30% da altura da viewport).
- Contínuo e reversível (rolar pra cima desfaz), recalculado a cada frame de
  scroll/resize, sem pin/scroll-jack.

## Onde muda
- `index.html`: troca `.case-shots` (grid 2 colunas) por `.case-stack`
  contendo os dois `.case-shot` absolutamente posicionados + selo de canto.
  Proporção do stack: `9/16` (mesma da coluna antiga), agora ocupando a
  largura cheia do card em vez de metade — imagens maiores.
- `style.css`: novo bloco `.case-stack` / `.case-shot` (estados frente/fundo)
  substituindo `.case-shots` / `.case-shot-col`.
- `script.js`: nova função `applyCaseStacks()`, chamada dentro do `onFrame()`
  existente.
- Responsivo: sem mudança de mecânica no mobile — os cards já empilham em 1
  coluna (`data-r="g900-1"`, existente); cada `.case-stack` continua
  calculando seu progresso individualmente do mesmo jeito.

## Fora de escopo
Nada além da seção Cases. Sem novas dependências, sem alterar dados dos
cases (`casesData` na cópia estática já embutida no HTML).
