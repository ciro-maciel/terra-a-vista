# Plano: do usaciv ao Terra à Vista

_26/11/2026. Fases 0 a 4 concluídas no mesmo dia; a 5 é o lançamento. Ficam para depois: os conselheiros refeitos com as fontes brasileiras e os cidadãos da tela da cidade._

## O que fica e o que muda

O aplicativo do navegador (`web/`) é quase todo independente de país: a grade, a câmera, a arte em
código, os painéis, a API de extensões e o gerador de trailer ficam. O pipeline (`pipeline/`) é quase
todo americano (FIPS, CBSA, NAICS, linhas da ACS): as fontes se reescrevem para o Brasil e os
construtores se adaptam. O contrato de dados (`docs/DATA_CONTRACTS.md`) muda primeiro, e os dois
lados depois.

## A grade

| | Estados Unidos (usaciv) | Brasil |
|---|---|---|
| Área | 8,1 milhões de km² (48 estados) | 8,5 milhões de km² |
| Hexágono | raio de 25 km, cerca de 1.600 km² | o mesmo |
| Hexágonos de terra | 4.807 | cerca de 5.300 (estimado pela área) |
| Unidade fina | 3.100 condados | 5.570 municípios |
| Unidade metropolitana | 524 CBSAs | Arranjos Populacionais (IBGE), com o porte da REGIC |
| Projeção | Albers USGS (29,5 e 45,5; meridiano −96) | Albers do IBGE (paralelos −2 e −22, origem −12, meridiano −54), a conferir |

## As fontes

**A confirmar** marca o que ainda não foi verificado (formato, ano ou acesso sem chave).

| Papel no mapa | Estados Unidos | Brasil |
|---|---|---|
| Limites, terra e água | Census boundaries | IBGE, Malha Municipal e de UFs |
| Posição das cidades | Gazetteer | IBGE, sedes municipais |
| Metrópoles | CBSA delineation | IBGE, Arranjos Populacionais; REGIC 2018 para o porte |
| População, idade, cor ou raça, alfabetização | ACS | Censo 2022 (SIDRA) |
| Crescimento | PEP | Estimativas de população do IBGE |
| Ouro (PIB) | BEA | IBGE, PIB dos Municípios, com valor adicionado por setor |
| Distritos | BLS QCEW | RAIS, empregos formais por CNAE e município (mesmo quociente locacional) |
| Relevo | ETOPO | O mesmo ETOPO, em outra janela |
| Cobertura do solo | NLCD | MapBiomas, Coleção 10. **Maior risco técnico:** achar um serviço que entregue o raster já reduzido |
| Rios, lagos, vizinhos | Natural Earth | O mesmo, mais a base hidrográfica da ANA |
| Usinas | EIA-860M | ANEEL, SIGA |
| Petróleo e gás | EIA | ANP, campos em produção, inclusive no mar |
| Minas | MSHA, EIA | ANM |
| Agro | (não tem) | IBGE, PAM e PPM: soja, milho, cana, café, laranja, rebanho |
| Portos e hidrovias | USACE | ANTAQ |
| Aeroportos | FAA | ANAC |
| Estradas e ferrovias | Natural Earth | DNIT (SNV) e ANTT |
| Rotas de comércio | FAF5 | IBGE, Ligações Rodoviárias e Hidroviárias, a confirmar |
| Maravilhas: parques | NPS | ICMBio, visitação por unidade de conservação |
| Maravilhas: universidades | NSF HERD | CAPES, programas de nota 6 e 7, a confirmar |
| Maravilhas: marcos | National Historic Landmarks | Patrimônio Mundial da UNESCO no Brasil e uma lista curta do IPHAN, marcada como curadoria |
| Desastres | OpenFEMA | S2iD, reconhecimentos federais por município |
| Lentes próprias | | Desmatamento (PRODES), queimadas (INPE), terras indígenas (FUNAI), banda larga (Anatel), esgoto |

Ficam fora do escopo: religião, eleições e o militar (sem fonte geográfica oficial aberta).

## As fases

Cada fase termina com o mapa no ar e o `check` sem FAIL.

| Fase | Entrega | Prova |
|---|---|---|
| 0. Fundação | Projeção, grade, malha municipal, relevo, cobertura do solo | Terreno e estados no mapa; teste de que Manaus fica acima de Porto Alegre e Recife à direita de Rio Branco |
| 1. Cidades e Ouro | Censo 2022, PIB dos Municípios, Arranjos Populacionais, estandartes | O PIB das 27 capitais bate com o SIDRA |
| 2. Distritos | RAIS e quociente locacional; tela da cidade com os cidadãos | Macaé sai "Cidade do petróleo" e Sorriso "Cidade do agro" pela regra |
| 3. Recursos e infraestrutura | ANEEL, ANP, ANM, PAM e PPM, portos, aeroportos, rodovias, ferrovias, hidrovias | Itaipu, Carajás e Santos no mapa, com número e fonte |
| 4. Maravilhas e lentes | ICMBio, UNESCO, CAPES; lentes do Censo e as próprias | Cada lente com a sua ressalva na legenda |
| 5. Lançamento | Interface em português, trailer, página | Trailer de 30 segundos gerado no navegador |
