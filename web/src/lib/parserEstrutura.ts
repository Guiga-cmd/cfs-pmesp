import type { PDFExtraido, PaginaExtraida } from "@/lib/pdf";

export type TipoBlocoEstrutural =
  | "cabecalho"
  | "instrucao"
  | "texto_apoio"
  | "questao"
  | "imagem"
  | "tabela"
  | "grafico"
  | "mapa"
  | "legislacao"
  | "formula"
  | "conteudo_nao_classificado";

export interface IntervaloQuestoes {
  inicio: number;
  fim: number;
  questoes: number[];
}

export interface BlocoEstrutural {
  id: string;
  tipo: TipoBlocoEstrutural;
  conteudo: string;
  paginaInicial: number;
  paginaFinal: number;
  posicaoInicial: number;
  posicaoFinal: number;
  numeroQuestao?: number;
  intervaloQuestoes?: IntervaloQuestoes;
  confianca: number;
  avisos: string[];
}

export interface ResultadoParserEstrutura {
  textoCompleto: string;
  blocos: BlocoEstrutural[];
  avisosGerais: string[];
}

interface MarcadorPagina {
  numero: number;
  inicio: number;
  fim: number;
}

interface OcorrenciaQuestao {
  numero: number;
  inicio: number;
  inicioConteudo: number;
}

interface OcorrenciaInstrucao {
  inicio: number;
  fim: number;
  texto: string;
  intervalo?: IntervaloQuestoes;
}

function criarIdBloco(
  tipo: TipoBlocoEstrutural,
  pagina: number,
  indice: number
): string {
  return `${tipo}-${pagina}-${indice}`;
}

function limparTextoPagina(pagina: PaginaExtraida): string {
  return pagina.texto
    .replace(/pcimarkpci[^\n]*/gi, " ")
    .replace(/www\.pciconcursos\.com\.br/gi, " ")
    .replace(/Confidencial até o momento da aplicação\.?/gi, " ")
    .replace(
      /PMSG\s*\d+\s*\/\s*\d+\s*-\s*Curso\s*Formação\s*Sargentos/gi,
      " "
    )
    .replace(/PMSG\d+\/\d+-CursoFormaçãoSargentos/gi, " ")
    .replace(
      /Curso de formação de sargentos(?:\s+de)?\s+2026\s*\(CFS\s*\/\s*26\)/gi,
      " "
    )
    .replace(/Polícia Militar do Estado de São Paulo/gi, " ")
    .replace(/Diretoria de Educação e Cultura/gi, " ")
    .replace(/Concurso Interno de Seleção/gi, " ")
    .replace(/001\.\s*Prova Objetiva/gi, " ")
    .replace(/\bR\s*A\s*S\s*C\s*U\s*N\s*H\s*O\b/gi, " ")
    .replace(/\bRascunho\b/gi, " ")
    .replace(/\uFFFD/g, "")
    .replace(/￾/g, "")
    .replace(/\u00ad/g, "")
    .replace(/id\s*=\s*["'][^"']+["']/gi, " ")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function montarTextoCompleto(pdf: PDFExtraido): string {
  return pdf.paginas
    .map((pagina) => {
      const textoLimpo = limparTextoPagina(pagina);

      return `\n[[PAGINA:${pagina.numero}]]\n${textoLimpo}`;
    })
    .join("\n");
}

function localizarMarcadoresPagina(
  texto: string
): MarcadorPagina[] {
  const regex = /\[\[PAGINA:(\d+)]]/g;
  const marcadores: MarcadorPagina[] = [];

  let resultado: RegExpExecArray | null;

  while ((resultado = regex.exec(texto)) !== null) {
    marcadores.push({
      numero: Number(resultado[1]),
      inicio: resultado.index,
      fim: regex.lastIndex,
    });
  }

  return marcadores;
}

function obterPaginaNaPosicao(
  marcadores: MarcadorPagina[],
  posicao: number,
  paginaPadrao = 1
): number {
  let pagina = paginaPadrao;

  for (const marcador of marcadores) {
    if (marcador.inicio > posicao) {
      break;
    }

    pagina = marcador.numero;
  }

  return pagina;
}

function removerMarcadoresPagina(texto: string): string {
  return texto
    .replace(/\[\[PAGINA:\d+]]/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizarTexto(texto: string): string {
  return texto
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function criarListaQuestoes(
  inicio: number,
  fim: number
): number[] {
  const primeiro = Math.min(inicio, fim);
  const ultimo = Math.max(inicio, fim);
  const questoes: number[] = [];

  for (let numero = primeiro; numero <= ultimo; numero += 1) {
    questoes.push(numero);
  }

  return questoes;
}

function extrairIntervaloQuestoes(
  texto: string
): IntervaloQuestoes | undefined {
  const padroes: RegExp[] = [
    /quest(?:ão|ões)\s+(?:de\s+|da\s+|das\s+)?0?(\d{1,2})\s+(?:a|até|à)\s+0?(\d{1,2})/i,
    /quest(?:ão|ões)\s+0?(\d{1,2})\s*[-–—]\s*0?(\d{1,2})/i,
    /para\s+responder\s+(?:às?|as)\s+quest(?:ão|ões)\s+0?(\d{1,2})\s+(?:a|até|à)\s+0?(\d{1,2})/i,
    /para\s+as\s+quest(?:ão|ões)\s+0?(\d{1,2})\s+(?:a|até|à)\s+0?(\d{1,2})/i,
    /das\s+quest(?:ão|ões)\s+0?(\d{1,2})\s+(?:a|até|à)\s+0?(\d{1,2})/i,
  ];

  for (const padrao of padroes) {
    const resultado = texto.match(padrao);

    if (!resultado) {
      continue;
    }

    const inicio = Number(resultado[1]);
    const fim = Number(resultado[2]);

    if (
      !Number.isInteger(inicio) ||
      !Number.isInteger(fim) ||
      inicio < 1 ||
      fim < 1 ||
      inicio > 999 ||
      fim > 999
    ) {
      continue;
    }

    return {
      inicio: Math.min(inicio, fim),
      fim: Math.max(inicio, fim),
      questoes: criarListaQuestoes(inicio, fim),
    };
  }

  return undefined;
}

function localizarQuestoes(
  texto: string
): OcorrenciaQuestao[] {
  const regex =
    /(?:^|\n)[^\S\r\n]*(\d{2})\.[^\S\r\n]+(?=\S)/g;

  const ocorrencias: OcorrenciaQuestao[] = [];
  let resultado: RegExpExecArray | null;

  while ((resultado = regex.exec(texto)) !== null) {
    const numero = Number(resultado[1]);

    if (numero < 1 || numero > 999) {
      continue;
    }

    ocorrencias.push({
      numero,
      inicio: resultado.index,
      inicioConteudo: regex.lastIndex,
    });
  }

  return ocorrencias;
}

function localizarInstrucoes(
  texto: string
): OcorrenciaInstrucao[] {
  const padroes: RegExp[] = [
    /(?:^|\n)([^\n]*(?:leia|considere|observe|analise|examine|atente|utilize)[^\n]*(?:quest(?:ão|ões)|texto|figura|imagem|gráfico|grafico|tabela|mapa|charge|tirinha|trecho|lei|artigo)[^\n]*)/gi,
    /(?:^|\n)([^\n]*quest(?:ão|ões)\s+(?:de\s+|da\s+|das\s+)?0?\d{1,2}\s+(?:a|até|à|-|–|—)\s+0?\d{1,2}[^\n]*)/gi,
    /(?:^|\n)([^\n]*para\s+responder\s+(?:às?|as)\s+quest(?:ão|ões)[^\n]*)/gi,
  ];

  const encontrados: OcorrenciaInstrucao[] = [];

  for (const padrao of padroes) {
    let resultado: RegExpExecArray | null;

    while ((resultado = padrao.exec(texto)) !== null) {
      const textoEncontrado = normalizarTexto(resultado[1] ?? "");

      if (!textoEncontrado) {
        continue;
      }

      const deslocamento =
        resultado[0].lastIndexOf(resultado[1] ?? "");

      const inicio =
        resultado.index + Math.max(0, deslocamento);

      encontrados.push({
        inicio,
        fim: inicio + (resultado[1]?.length ?? 0),
        texto: textoEncontrado,
        intervalo: extrairIntervaloQuestoes(textoEncontrado),
      });
    }
  }

  const unicos = new Map<string, OcorrenciaInstrucao>();

  for (const instrucao of encontrados) {
    const chave = `${instrucao.inicio}:${instrucao.fim}`;

    if (!unicos.has(chave)) {
      unicos.set(chave, instrucao);
    }
  }

  return Array.from(unicos.values()).sort(
    (a, b) => a.inicio - b.inicio
  );
}

function identificarTipoApoio(
  texto: string
): TipoBlocoEstrutural {
  const textoNormalizado = texto.toLowerCase();

  if (
    /\b(lei|decreto|constituição|constituicao|artigo|código|codigo|estatuto|resolução|resolucao)\b/i.test(
      textoNormalizado
    )
  ) {
    return "legislacao";
  }

  if (
    /\b(tabela|quadro)\b/i.test(textoNormalizado)
  ) {
    return "tabela";
  }

  if (
    /\b(gráfico|grafico)\b/i.test(textoNormalizado)
  ) {
    return "grafico";
  }

  if (
    /\b(mapa|cartograma)\b/i.test(textoNormalizado)
  ) {
    return "mapa";
  }

  if (
    /\b(figura|imagem|fotografia|charge|tirinha|ilustração|ilustracao)\b/i.test(
      textoNormalizado
    )
  ) {
    return "imagem";
  }

  if (
    /\b(fórmula|formula|equação|equacao|expressão matemática|expressao matematica)\b/i.test(
      textoNormalizado
    )
  ) {
    return "formula";
  }

  if (
    /\b(leia|texto|trecho|considere)\b/i.test(
      textoNormalizado
    )
  ) {
    return "texto_apoio";
  }

  return "instrucao";
}

function calcularConfiancaInstrucao(
  instrucao: OcorrenciaInstrucao
): number {
  let confianca = 0.5;

  if (instrucao.intervalo) {
    confianca += 0.3;
  }

  if (
    /\b(leia|observe|analise|considere|examine)\b/i.test(
      instrucao.texto
    )
  ) {
    confianca += 0.1;
  }

  if (
    /\b(texto|figura|imagem|gráfico|grafico|tabela|mapa|lei|trecho|charge|tirinha)\b/i.test(
      instrucao.texto
    )
  ) {
    confianca += 0.1;
  }

  return Math.min(1, confianca);
}

function criarBlocosQuestoes(
  texto: string,
  ocorrencias: OcorrenciaQuestao[],
  marcadoresPagina: MarcadorPagina[]
): BlocoEstrutural[] {
  return ocorrencias.map((ocorrencia, indice) => {
    const proxima = ocorrencias[indice + 1];
    const fim = proxima ? proxima.inicio : texto.length;

    const conteudo = removerMarcadoresPagina(
      texto.slice(ocorrencia.inicioConteudo, fim)
    );

    const paginaInicial = obterPaginaNaPosicao(
      marcadoresPagina,
      ocorrencia.inicio
    );

    const paginaFinal = obterPaginaNaPosicao(
      marcadoresPagina,
      Math.max(ocorrencia.inicio, fim - 1)
    );

    const avisos: string[] = [];

    if (!conteudo) {
      avisos.push("O bloco da questão está vazio.");
    }

    return {
      id: criarIdBloco(
        "questao",
        paginaInicial,
        indice + 1
      ),
      tipo: "questao",
      conteudo,
      paginaInicial,
      paginaFinal,
      posicaoInicial: ocorrencia.inicio,
      posicaoFinal: fim,
      numeroQuestao: ocorrencia.numero,
      confianca: conteudo ? 1 : 0.4,
      avisos,
    };
  });
}

function criarBlocosInstrucoes(
  instrucoes: OcorrenciaInstrucao[],
  marcadoresPagina: MarcadorPagina[]
): BlocoEstrutural[] {
  return instrucoes.map((instrucao, indice) => {
    const paginaInicial = obterPaginaNaPosicao(
      marcadoresPagina,
      instrucao.inicio
    );

    const paginaFinal = obterPaginaNaPosicao(
      marcadoresPagina,
      Math.max(instrucao.inicio, instrucao.fim - 1)
    );

    const tipo = identificarTipoApoio(instrucao.texto);
    const avisos: string[] = [];

    if (!instrucao.intervalo) {
      avisos.push(
        "A instrução foi identificada, mas não foi possível determinar automaticamente o intervalo de questões."
      );
    }

    return {
      id: criarIdBloco(
        tipo,
        paginaInicial,
        indice + 1
      ),
      tipo,
      conteudo: instrucao.texto,
      paginaInicial,
      paginaFinal,
      posicaoInicial: instrucao.inicio,
      posicaoFinal: instrucao.fim,
      intervaloQuestoes: instrucao.intervalo,
      confianca: calcularConfiancaInstrucao(instrucao),
      avisos,
    };
  });
}

function removerSobreposicoes(
  blocos: BlocoEstrutural[]
): BlocoEstrutural[] {
  const ordenados = [...blocos].sort((a, b) => {
    if (a.posicaoInicial !== b.posicaoInicial) {
      return a.posicaoInicial - b.posicaoInicial;
    }

    return b.confianca - a.confianca;
  });

  const resultado: BlocoEstrutural[] = [];

  for (const bloco of ordenados) {
    const duplicado = resultado.some(
      (existente) =>
        existente.tipo === bloco.tipo &&
        existente.posicaoInicial === bloco.posicaoInicial &&
        existente.posicaoFinal === bloco.posicaoFinal
    );

    if (!duplicado) {
      resultado.push(bloco);
    }
  }

  return resultado;
}

function validarResultado(
  blocos: BlocoEstrutural[]
): string[] {
  const avisos: string[] = [];

  const questoes = blocos.filter(
    (bloco) => bloco.tipo === "questao"
  );

  const apoios = blocos.filter(
    (bloco) =>
      bloco.tipo !== "questao" &&
      bloco.tipo !== "cabecalho" &&
      bloco.tipo !== "conteudo_nao_classificado"
  );

  if (questoes.length === 0) {
    avisos.push(
      "Nenhum bloco de questão foi identificado na prova."
    );
  }

  const numeros = questoes
    .map((bloco) => bloco.numeroQuestao)
    .filter(
      (numero): numero is number =>
        typeof numero === "number"
    );

  const duplicados = numeros.filter(
    (numero, indice) =>
      numeros.indexOf(numero) !== indice
  );

  if (duplicados.length > 0) {
    avisos.push(
      `Questões duplicadas na estrutura: ${[
        ...new Set(duplicados),
      ]
        .map((numero) =>
          String(numero).padStart(2, "0")
        )
        .join(", ")}.`
    );
  }

  const apoiosSemIntervalo = apoios.filter(
    (bloco) => !bloco.intervaloQuestoes
  );

  if (apoiosSemIntervalo.length > 0) {
    avisos.push(
      `${apoiosSemIntervalo.length} bloco(s) de apoio ou instrução foram identificados sem intervalo automático de questões.`
    );
  }

  return avisos;
}

export function interpretarEstruturaDoPDF(
  pdf: PDFExtraido
): ResultadoParserEstrutura {
  const textoCompleto = montarTextoCompleto(pdf);
  const marcadoresPagina =
    localizarMarcadoresPagina(textoCompleto);

  const ocorrenciasQuestoes =
    localizarQuestoes(textoCompleto);

  const ocorrenciasInstrucoes =
    localizarInstrucoes(textoCompleto);

  const blocosQuestoes = criarBlocosQuestoes(
    textoCompleto,
    ocorrenciasQuestoes,
    marcadoresPagina
  );

  const blocosInstrucoes = criarBlocosInstrucoes(
    ocorrenciasInstrucoes,
    marcadoresPagina
  );

  const blocos = removerSobreposicoes([
    ...blocosInstrucoes,
    ...blocosQuestoes,
  ]).sort(
    (a, b) => a.posicaoInicial - b.posicaoInicial
  );

  const avisosGerais = validarResultado(blocos);

  return {
    textoCompleto,
    blocos,
    avisosGerais,
  };
}