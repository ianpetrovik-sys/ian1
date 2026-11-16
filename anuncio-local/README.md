# Anúncio Local

Gera um anúncio em vídeo vertical (9:16) com jingle para um negócio local, a partir do nome dele.

**Fluxo:** nome do negócio → busca no Google (Places API) com nota e avaliações reais → estilo musical pela UF (`data/generos-uf.json`, que você pode editar) → Gemini escreve a letra (a partir das avaliações), o prompt da música e os prompts das cenas do Veo → você gera os clipes no **Google Flow** e a música no **app Gemini (Lyria)** com a sua assinatura → o app monta o vídeo com um dos 3 templates (Depoimento, Oferta, Karaokê) e exporta MP4/WebM em 1080×1920.

## Rodar
```bash
cp .env.example .env   # preencha as chaves (opcional: sem chave roda em modo demo)
node server.mjs        # Node 20+, sem dependências
# abra http://localhost:5180 no Chrome
```

## Por que o Flow é manual
A assinatura Google AI Pro/Ultra cobre o uso do Flow pela interface web, mas não cobre chamadas de API. Veo e Lyria pela Gemini API são cobrados à parte, no AI Studio ou no Cloud. Automatizar o site do Flow seria frágil e pode violar os termos de uso. Por isso o app entrega um pacote de prompts pronto para copiar e colar.

## Custos
- Places Text Search com `reviews`: SKU Enterprise + Atmosphere. Confira a franquia mensal gratuita e o preço em developers.google.com/maps/billing-and-pricing.
- Gemini Flash para texto: centavos por anúncio. Há um nível gratuito.
