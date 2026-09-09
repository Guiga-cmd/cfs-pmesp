import type { PDFExtraido } from "@/lib/pdf";

import {
  interpretarEstruturaDoPDF,
  type BlocoEstrutural,
  type TipoBlocoEstrutural,
} from "@/lib/parserEstrutura";

export type TipoApoio =
  | "texto"
  | "imagem"
  | "grafico"
  | "tabela"
  | "mapa"
  | "legislacao"
  | "formula";

export interface ApoioDetectado {
  id: string;

  tipo: TipoApoio;

  titulo?: string;

  conteudo: string;

  paginaInicial: number;

  paginaFinal: number;

  questoes: number[];
}

export interface ResultadoParserApoios {
  textoSemApoios: string;

  apoios: ApoioDetectado[];
}

interface PaginaTemporaria {
  numero: number;
  texto: string;
}

interface IntervaloRemocao {
  inicio: number;
  fim: number;
}

const TIPOS_ESTRUTURAIS_DE_APOIO: TipoBlocoEstrutural[] = [
  "texto_apoio",
  "imagem",
  "grafico",
  "tabela",
  "mapa",
  "legislacao",
  "formula",
];

function normalizarTexto(texto: string): string {
  return texto
    .replace(/\[\[PAGINA:\d+]]/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}


function normalizarParaComparacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function localizarInicioDeQuestaoNoTrecho(
  trecho: string
): number | null {
  const regex =
    /(?:^|\n)[^\S\r\n]*(\d{1,3})\s*[.)-][^\S\r\n]+(?=\S)/g;

  const resultado = regex.exec(trecho);

  if (!resultado) {
    return null;
  }

  return (
    resultado.index +
    (resultado[0].startsWith("\n") ? 1 : 0)
  );
}

function contemInstrucaoGeralDeProva(
  conteudo: string
): boolean {
  const texto = normalizarParaComparacao(conteudo);

  const sinais = [
    "folha de respostas",
    "duracao da prova",
    "nome do candidato",
    "aguarde a ordem do fiscal",
    "so sera permitida a saida",
    "confidencial ate o momento da aplicacao",
  ];

  return sinais.filter((sinal) => texto.includes(sinal)).length >= 2;
}

function possuiChamadaExplicitaDeApoio(
  conteudo: string
): boolean {
  const texto = normalizarParaComparacao(conteudo);

  return [
    "leia o texto",
    "leia a tira",
    "considere a figura",
    "considere o grafico",
    "considere o gráfico",
    "observe a figura",
    "observe o grafico",
    "observe o gráfico",
    "para responder as questoes",
    "para responder às questões",
  ].some((expressao) =>
    texto.includes(normalizarParaComparacao(expressao))
  );
}

function conteudoPareceQuestao(
  conteudo: string
): boolean {
  const inicio = localizarInicioDeQuestaoNoTrecho(conteudo);

  if (inicio === null) {
    return false;
  }

  const trechoAnterior = conteudo.slice(0, inicio).trim();

  return trechoAnterior.length < 120;
}

function limitarConteudoAntesDaPrimeiraQuestao(
  texto: string,
  inicio: number,
  fimProposto: number
): number {
  const trecho = texto.slice(inicio, fimProposto);
  const inicioQuestao =
    localizarInicioDeQuestaoNoTrecho(trecho);

  if (inicioQuestao === null) {
    return fimProposto;
  }

  return Math.max(inicio, inicio + inicioQuestao);
}

function criarPaginasTemporarias(
  texto: string
): PaginaTemporaria[] {
  const regexMarcador = /\[\[PAGINA:(\d+)]]/g;

  const marcadores: Array<{
    numero: number;
    inicio: number;
    fim: number;
  }> = [];

  let resultado: RegExpExecArray | null;

  while (
    (resultado = regexMarcador.exec(texto)) !== null
  ) {
    marcadores.push({
      numero: Number(resultado[1]),
      inicio: resultado.index,
      fim: regexMarcador.lastIndex,
    });
  }

  if (marcadores.length === 0) {
    return [
      {
        numero: 1,
        texto,
      },
    ];
  }

  return marcadores.map((marcador, indice) => {
    const proximoMarcador = marcadores[indice + 1];

    const fim = proximoMarcador
      ? proximoMarcador.inicio
      : texto.length;

    return {
      numero: marcador.numero,
      texto: texto
        .slice(marcador.fim, fim)
        .trim(),
    };
  });
}

function criarPDFTemporario(
  texto: string
): PDFExtraido {
  const paginas = criarPaginasTemporarias(texto).map(
    (pagina) => ({
      numero: pagina.numero,
      texto: pagina.texto,
    })
  );

  /*
   * O motor estrutural utiliza apenas:
   *
   * - pdf.paginas
   * - pagina.numero
   * - pagina.texto
   *
   * Por isso, o texto já extraído pode ser convertido
   * temporariamente para o formato esperado pelo parser.
   */
  return {
    paginas,
  } as PDFExtraido;
}

function converterTipoEstrutural(
  tipo: TipoBlocoEstrutural
): TipoApoio | undefined {
  switch (tipo) {
    case "texto_apoio":
      return "texto";

    case "imagem":
      return "imagem";

    case "grafico":
      return "grafico";

    case "tabela":
      return "tabela";

    case "mapa":
      return "mapa";

    case "legislacao":
      return "legislacao";

    case "formula":
      return "formula";

    default:
      return undefined;
  }
}

function criarTitulo(
  tipo: TipoApoio,
  questoes: number[]
): string {
  const primeiroNumero = questoes[0];
  const ultimoNumero =
    questoes[questoes.length - 1];

  let descricaoQuestoes = "";

  if (
    typeof primeiroNumero === "number" &&
    typeof ultimoNumero === "number"
  ) {
    if (primeiroNumero === ultimoNumero) {
      descricaoQuestoes = ` da questão ${String(
        primeiroNumero
      ).padStart(2, "0")}`;
    } else {
      descricaoQuestoes = ` das questões ${String(
        primeiroNumero
      ).padStart(2, "0")} a ${String(
        ultimoNumero
      ).padStart(2, "0")}`;
    }
  }

  switch (tipo) {
    case "texto":
      return `Texto de apoio${descricaoQuestoes}`;

    case "imagem":
      return `Imagem de apoio${descricaoQuestoes}`;

    case "grafico":
      return `Gráfico de apoio${descricaoQuestoes}`;

    case "tabela":
      return `Tabela de apoio${descricaoQuestoes}`;

    case "mapa":
      return `Mapa de apoio${descricaoQuestoes}`;

    case "legislacao":
      return `Trecho legislativo${descricaoQuestoes}`;

    case "formula":
      return `Fórmula de apoio${descricaoQuestoes}`;
  }
}

function ordenarQuestoes(
  questoes: number[]
): number[] {
  return [...new Set(questoes)]
    .filter(
      (numero) =>
        Number.isInteger(numero) &&
        numero > 0
    )
    .sort((a, b) => a - b);
}

function extrairQuestoesDeclaradasNoConteudo(
  conteudo: string
): number[] {
  const texto = normalizarParaComparacao(conteudo);
  const numeros = new Set<number>();

  const adicionarIntervalo = (
    inicio: number,
    fim: number
  ): void => {
    if (
      !Number.isInteger(inicio) ||
      !Number.isInteger(fim) ||
      inicio <= 0 ||
      fim <= 0
    ) {
      return;
    }

    const menor = Math.min(inicio, fim);
    const maior = Math.max(inicio, fim);

    /*
     * Limite conservador para evitar que números grandes
     * encontrados por engano gerem centenas de associações.
     */
    if (maior - menor > 100) {
      return;
    }

    for (let numero = menor; numero <= maior; numero += 1) {
      numeros.add(numero);
    }
  };

  const padroesIntervalo = [
    /quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
    /responder(?:\s+as)?\s+quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
  ];

  for (const padrao of padroesIntervalo) {
    let resultado: RegExpExecArray | null;

    while ((resultado = padrao.exec(texto)) !== null) {
      adicionarIntervalo(
        Number(resultado[1]),
        Number(resultado[2])
      );
    }
  }

  const padroesDupla = [
    /quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+e\s+(\d{1,3})/g,
    /responder(?:\s+as)?\s+quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+e\s+(\d{1,3})/g,
  ];

  for (const padrao of padroesDupla) {
    let resultado: RegExpExecArray | null;

    while ((resultado = padrao.exec(texto)) !== null) {
      numeros.add(Number(resultado[1]));
      numeros.add(Number(resultado[2]));
    }
  }

  return ordenarQuestoes(Array.from(numeros));
}

function localizarPrimeiraQuestaoVinculada(
  blocoApoio: BlocoEstrutural,
  blocosQuestoes: BlocoEstrutural[]
): BlocoEstrutural | undefined {
  const questoes =
    blocoApoio.intervaloQuestoes?.questoes ?? [];

  if (questoes.length === 0) {
    return blocosQuestoes.find(
      (questao) =>
        questao.posicaoInicial >
        blocoApoio.posicaoFinal
    );
  }

  return blocosQuestoes.find(
    (questao) =>
      typeof questao.numeroQuestao === "number" &&
      questoes.includes(questao.numeroQuestao) &&
      questao.posicaoInicial >
        blocoApoio.posicaoInicial
  );
}

function localizarProximoApoio(
  blocoAtual: BlocoEstrutural,
  blocosApoio: BlocoEstrutural[]
): BlocoEstrutural | undefined {
  return blocosApoio.find(
    (bloco) =>
      bloco.posicaoInicial >
      blocoAtual.posicaoInicial
  );
}

function calcularFimDoConteudo(
  blocoApoio: BlocoEstrutural,
  blocosQuestoes: BlocoEstrutural[],
  blocosApoio: BlocoEstrutural[],
  tamanhoTexto: number
): number {
  const primeiraQuestao =
    localizarPrimeiraQuestaoVinculada(
      blocoApoio,
      blocosQuestoes
    );

  const proximoApoio = localizarProximoApoio(
    blocoApoio,
    blocosApoio
  );

  const candidatos: number[] = [tamanhoTexto];

  if (primeiraQuestao) {
    candidatos.push(
      primeiraQuestao.posicaoInicial
    );
  }

  if (proximoApoio) {
    candidatos.push(
      proximoApoio.posicaoInicial
    );
  }

  return Math.max(
    blocoApoio.posicaoFinal,
    Math.min(...candidatos)
  );
}

function obterPaginaFinalDoConteudo(
  blocoApoio: BlocoEstrutural,
  primeiraQuestao: BlocoEstrutural | undefined
): number {
  if (!primeiraQuestao) {
    return blocoApoio.paginaFinal;
  }

  return Math.max(
    blocoApoio.paginaFinal,
    primeiraQuestao.paginaInicial
  );
}

function completarQuestoesSemIntervalo(
  blocoApoio: BlocoEstrutural,
  blocosQuestoes: BlocoEstrutural[]
): number[] {
  const questoesDoIntervalo =
    blocoApoio.intervaloQuestoes?.questoes;

  if (
    questoesDoIntervalo &&
    questoesDoIntervalo.length > 0
  ) {
    return ordenarQuestoes(questoesDoIntervalo);
  }

  const proximaQuestao = blocosQuestoes.find(
    (questao) =>
      questao.posicaoInicial >
        blocoApoio.posicaoFinal &&
      typeof questao.numeroQuestao === "number"
  );

  if (
    typeof proximaQuestao?.numeroQuestao !==
    "number"
  ) {
    return [];
  }

  return [proximaQuestao.numeroQuestao];
}

function criarApoios(
  texto: string,
  blocos: BlocoEstrutural[]
): {
  apoios: ApoioDetectado[];
  intervalosRemocao: IntervaloRemocao[];
} {
  const blocosQuestoes = blocos
    .filter(
      (bloco) => bloco.tipo === "questao"
    )
    .sort(
      (a, b) =>
        a.posicaoInicial - b.posicaoInicial
    );

  const blocosApoio = blocos
    .filter((bloco) =>
      TIPOS_ESTRUTURAIS_DE_APOIO.includes(
        bloco.tipo
      )
    )
    .sort(
      (a, b) =>
        a.posicaoInicial - b.posicaoInicial
    );

  const apoios: ApoioDetectado[] = [];
  const intervalosRemocao: IntervaloRemocao[] =
    [];

  for (const blocoApoio of blocosApoio) {
    const tipo = converterTipoEstrutural(
      blocoApoio.tipo
    );

    if (!tipo) {
      continue;
    }

    const questoesEstruturais =
      completarQuestoesSemIntervalo(
        blocoApoio,
        blocosQuestoes
      );

    const primeiraQuestao =
      localizarPrimeiraQuestaoVinculada(
        blocoApoio,
        blocosQuestoes
      );

    const fimCalculado = calcularFimDoConteudo(
      blocoApoio,
      blocosQuestoes,
      blocosApoio,
      texto.length
    );

    const fimConteudo =
      limitarConteudoAntesDaPrimeiraQuestao(
        texto,
        blocoApoio.posicaoInicial,
        fimCalculado
      );

    const conteudoExtraido = normalizarTexto(
      texto.slice(
        blocoApoio.posicaoInicial,
        fimConteudo
      )
    );

    if (!conteudoExtraido) {
      continue;
    }

    /*
     * Alguns PDFs declaram intervalos como:
     * "questões 31 e 32".
     *
     * O motor estrutural pode reconhecer apenas a primeira
     * questão. Quando o próprio conteúdo do apoio contém uma
     * declaração explícita, ela tem prioridade sobre a
     * associação estrutural incompleta.
     *
     * Isso também preserva os intervalos já funcionais, como
     * "questões 01 a 10" e "questões 11 a 14".
     */
    const questoesDeclaradas =
      extrairQuestoesDeclaradasNoConteudo(
        conteudoExtraido
      );

    const questoes =
      questoesDeclaradas.length > 0
        ? questoesDeclaradas
        : questoesEstruturais;

    /*
     * Evita transformar a própria questão, instruções gerais
     * da prova ou cabeçalhos em material de apoio.
     */
    if (conteudoPareceQuestao(conteudoExtraido)) {
      continue;
    }

    if (
      contemInstrucaoGeralDeProva(conteudoExtraido) &&
      !possuiChamadaExplicitaDeApoio(conteudoExtraido)
    ) {
      continue;
    }

    /*
     * Blocos visuais são preservados pelo parser de imagens.
     * Aqui só mantemos o texto quando há chamada explícita ou
     * conteúdo textual realmente útil.
     */
    if (
      tipo !== "texto" &&
      tipo !== "legislacao" &&
      tipo !== "formula" &&
      !possuiChamadaExplicitaDeApoio(conteudoExtraido)
    ) {
      continue;
    }

    apoios.push({
      id: blocoApoio.id,
      tipo,
      titulo: criarTitulo(tipo, questoes),
      conteudo: conteudoExtraido,
      paginaInicial: blocoApoio.paginaInicial,
      paginaFinal: blocoApoio.paginaFinal,
      questoes,
    });

    intervalosRemocao.push({
      inicio: blocoApoio.posicaoInicial,
      fim: fimConteudo,
    });
  }

  return {
    apoios,
    intervalosRemocao,
  };
}

function protegerQuestoesNosIntervalos(
  texto: string,
  intervalos: IntervaloRemocao[]
): IntervaloRemocao[] {
  const regexQuestao =
    /(?:^|\n)[^\S\r\n]*\d{1,3}\s*[.)-][^\S\r\n]+(?=\S)/m;

  const protegidos: IntervaloRemocao[] = [];

  for (const intervalo of intervalos) {
    const trecho = texto.slice(
      intervalo.inicio,
      intervalo.fim
    );
    const marcadorQuestao = regexQuestao.exec(trecho);

    if (!marcadorQuestao) {
      protegidos.push(intervalo);
      continue;
    }

    const deslocamento =
      marcadorQuestao.index +
      (marcadorQuestao[0].startsWith("\n") ? 1 : 0);

    /*
     * Se o bloco classificado como apoio começa exatamente
     * sobre uma questão, ele não deve ser removido.
     */
    if (deslocamento <= 2) {
      continue;
    }

    /*
     * Quando um apoio termina junto do início de uma questão,
     * remove-se somente o conteúdo anterior ao marcador.
     * Todo o texto da questão permanece disponível para o
     * parser de questões.
     */
    protegidos.push({
      inicio: intervalo.inicio,
      fim: intervalo.inicio + deslocamento,
    });
  }

  return protegidos;
}

function unirIntervalos(
  intervalos: IntervaloRemocao[]
): IntervaloRemocao[] {
  const ordenados = [...intervalos]
    .filter(
      (intervalo) =>
        intervalo.inicio >= 0 &&
        intervalo.fim > intervalo.inicio
    )
    .sort((a, b) => a.inicio - b.inicio);

  if (ordenados.length === 0) {
    return [];
  }

  const unidos: IntervaloRemocao[] = [
    {
      inicio: ordenados[0].inicio,
      fim: ordenados[0].fim,
    },
  ];

  for (
    let indice = 1;
    indice < ordenados.length;
    indice += 1
  ) {
    const atual = ordenados[indice];
    const ultimo = unidos[unidos.length - 1];

    if (atual.inicio <= ultimo.fim) {
      ultimo.fim = Math.max(
        ultimo.fim,
        atual.fim
      );
      continue;
    }

    unidos.push({
      inicio: atual.inicio,
      fim: atual.fim,
    });
  }

  return unidos;
}

function preservarMarcadoresDePagina(
  trecho: string
): string {
  const marcadores =
    trecho.match(/\[\[PAGINA:\d+]]/g) ?? [];

  if (marcadores.length === 0) {
    return "\n";
  }

  return `\n${marcadores.join("\n")}\n`;
}

function removerConteudosDeApoio(
  texto: string,
  intervalos: IntervaloRemocao[]
): string {
  const intervalosProtegidos =
    protegerQuestoesNosIntervalos(
      texto,
      intervalos
    );

  const intervalosUnidos =
    unirIntervalos(intervalosProtegidos);

  if (intervalosUnidos.length === 0) {
    return texto;
  }

  let resultado = "";
  let cursor = 0;

  for (const intervalo of intervalosUnidos) {
    resultado += texto.slice(
      cursor,
      intervalo.inicio
    );

    const trechoRemovido = texto.slice(
      intervalo.inicio,
      intervalo.fim
    );

    resultado +=
      preservarMarcadoresDePagina(
        trechoRemovido
      );

    cursor = intervalo.fim;
  }

  resultado += texto.slice(cursor);

  return resultado
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function removerApoiosDuplicados(
  apoios: ApoioDetectado[]
): ApoioDetectado[] {
  const unicos = new Map<
    string,
    ApoioDetectado
  >();

  for (const apoio of apoios) {
    const chave = [
      apoio.tipo,
      apoio.paginaInicial,
      apoio.paginaFinal,
      apoio.questoes.join(","),
      apoio.conteudo
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    ].join("|");

    if (!unicos.has(chave)) {
      unicos.set(chave, apoio);
    }
  }

  return Array.from(unicos.values());
}

export function detectarApoios(
  texto: string
): ResultadoParserApoios {
  if (!texto.trim()) {
    return {
      textoSemApoios: texto,
      apoios: [],
    };
  }

  const pdfTemporario =
    criarPDFTemporario(texto);

  const resultadoEstrutura =
    interpretarEstruturaDoPDF(pdfTemporario);

  const {
    apoios,
    intervalosRemocao,
  } = criarApoios(
    resultadoEstrutura.textoCompleto,
    resultadoEstrutura.blocos
  );

  const apoiosUnicos =
    removerApoiosDuplicados(apoios);

  const textoSemApoios =
    removerConteudosDeApoio(
      resultadoEstrutura.textoCompleto,
      intervalosRemocao
    );

  return {
    textoSemApoios,
    apoios: apoiosUnicos,
  };
}