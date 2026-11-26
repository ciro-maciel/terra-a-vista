# Terra à Vista

**O Brasil desenhado como mapa de jogo de estratégia por turnos, feito de dados públicos reais.**
Procure a sua cidade: o estandarte mostra o PIB dela, os distritos vêm do que as pessoas de lá fazem
para trabalhar, e o chão é o relevo e a cobertura do solo de verdade. Cada número leva à fonte.

[Read in English](README.md)

> **Estado: em construção (fase 0).** O código aqui ainda é a versão dos Estados Unidos de onde ele
> partiu. O pipeline do Brasil está sendo escrito fonte por fonte; o plano está em
> [docs/PLAN.pt-BR.md](docs/PLAN.pt-BR.md).

## De onde vem

O Terra à Vista parte do [usaciv](https://karpathy.ai/usaciv/), de Andrej Karpathy (MIT), que
desenha os Estados Unidos do mesmo jeito a partir de 31 fontes federais. Fica o aplicativo do
navegador (a grade de hexágonos, o terreno pintado, a tela da cidade, os conselheiros, o gerador de
trailer) e o pipeline de dados é reescrito para o Brasil: IBGE (Censo 2022, PIB dos Municípios),
empregos formais da RAIS, cobertura do solo do MapBiomas, ANEEL, ANP, ANM, ANTAQ, ANAC, ICMBio e
outras. O README original dele está em [docs/upstream/README.md](docs/upstream/README.md).

O visual é inspirado em jogos de estratégia 4X por turnos. Todo desenho, ícone e textura é original
e feito em código. Este projeto não tem vínculo com nenhuma editora de jogos.

## Rodar

Precisa só do [uv](https://docs.astral.sh/uv/).

```bash
uv run python -m pipeline serve        # http://127.0.0.1:8765
uv run python -m unittest discover -s tests
```

Refazer os dados baixa centenas de megabytes dos publicadores (`uv run python -m pipeline all`).

## Como ler o mapa

- Os rendimentos são nomes dados a números reais. Ouro é o PIB.
- Os distritos medem o emprego **formal** (RAIS). Perto de 4 em 10 trabalhadores brasileiros são
  informais, e a legenda diz isso.
- Dado que falta continua faltando: `null`, nunca `0`.
- O que é escolhido (maravilhas, distritos, rotas) segue regras publicadas dentro dos arquivos de dados.

## Licença

Código: MIT, ver [LICENSE](LICENSE) e [NOTICE](NOTICE). Os dados são dos publicadores e mantêm os
termos deles; o Almanaque do aplicativo lista cada um.

Feito por [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-terra-a-vista).
