# Script pra buscar fotos de perfil dos clientes

## Contexto
Seção `#clientes` (constelação de autoridades) tem 10 nós (`cliente-1` a
`cliente-10`), hoje todos com placeholder `.imgslot circle` ("Foto"). Cada um
corresponde a um handle público do Instagram já citado no HTML (nome/@handle
abaixo de cada avatar).

## Decisão sobre a fonte
Não é login/API oficial — é leitura da página pública de cada perfil. Isso
**viola os Termos de Uso do Instagram**; risco assumido conscientemente pelo
usuário (dado público, uso legítimo — fotos dos próprios clientes da
consultoria — sem login, sem escala). Método escolhido: **anônimo, melhor
esforço** — sem sessão logada, sem risco pra conta pessoal, mas sujeito a
bloqueio/falha por handle (aceitável; falhas ficam pra preenchimento manual).

## Abordagem
**B — script Python, só stdlib** (sem `pip install`), rodado manualmente e
localmente pelo usuário — não faz parte do site publicado.
Descartada: `instaloader` (dependência nova, comportamento mais opaco quando
quebra — e vai quebrar, é scraping não-oficial).

## Mapeamento handle → id
| id | handle | nome exibido |
|---|---|---|
| cliente-1 | @marcelogermanoeag | Marcelo Germano |
| cliente-2 | @cafecomferri | Café com Ferri |
| cliente-3 | @izabela.anholett | Izabela Anholett |
| cliente-4 | @felipedantasf | Felipe Dantas |
| cliente-5 | @lincolnfracari | Lincoln Fracari |
| cliente-6 | @caduneiva | Cadu Neiva |
| cliente-7 | @granvas | Lerry Granville |
| cliente-8 | @thiagofranco | Thiago Franco |
| cliente-9 | @marcospelozato.oficial | Marcos Pelozato |
| cliente-10 | @dilsonperesjr | Dilson Peres |

## Mecânica do script (`scripts/fetch-client-photos.py`)
**Atualizado após primeira tentativa:** o regex direto no HTML da página
pública (`"profile_pic_url_hd":"..."`) parou de funcionar — o Instagram não
embute mais a foto no HTML servido pra requisições anônimas, carrega via JS
depois. Resultado real do primeiro teste: 0/10.

Solução que funcionou: o endpoint interno `web_profile_info` que o próprio
site do Instagram chama por trás dos panos, acessado com o header
`X-IG-App-ID` (ID público/fixo usado pelo client web deles, não é chave
secreta) — sem login, sem sessão, JSON direto com `profile_pic_url_hd`.
Resultado real: **8/10** (`cafecomferri` e `caduneiva` bateram num erro
interno do backend do Instagram, possivelmente passageiro).

1. Pra cada handle: `GET https://i.instagram.com/api/v1/users/web_profile_info/?username=<handle>`
   com headers `User-Agent` (navegador real) e `X-IG-App-ID: 936619743392459`.
2. Extrai `data.user.profile_pic_url_hd` do JSON — stdlib puro
   (`urllib.request`, `json`).
3. Baixa a imagem e salva em `assets/img/clientes/cliente-N.jpg`.
4. Pausa aleatória de 3–6s entre handles — reduz (não elimina) a chance de
   bloqueio em rajada.
5. Falha em um handle (403/429/redirect pra login/regex não bate) **não para
   o script** — ele loga `FALHOU: <handle> (<motivo>)` e segue pro próximo.
   Resumo final: quantos deram certo, quais falharam.
6. Fotos de perfil do Instagram já são quadradas — sem crop/`object-position`
   especial. Um passo final com `sips -Z 400 -s formatOptions 80` normaliza
   tamanho/peso, mesmo padrão já usado nas fotos dos fundadores.

## Depois de rodar
Para cada `cliente-N.jpg` que existir em `assets/img/clientes/`, troco o
`.imgslot circle` correspondente no HTML por `<img src="assets/img/clientes/cliente-N.jpg">`
— mesmo padrão dos fundadores. Os que falharem continuam como placeholder até
preenchimento manual.

## Fora de escopo
Buscar contagem de seguidores ou outros dados atualizados — mencionado pelo
usuário como próximo passo futuro, não faz parte desta entrega. Sem
agendamento/automação recorrente (cron, GitHub Action) — rodado manualmente
quando necessário.
