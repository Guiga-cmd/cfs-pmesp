import type {
  PaginaExtraida,
  PDFExtraido,
} from "@/lib/pdf";
import type { Questao } from "@/types/questao";

export type TipoImagemDetectada =
  | "pagina"
  | "questao"
  | "continuidade";

export interface RecorteImagemPDF {
  id: string;
  tipo: TipoImagemDetectada;
  pagina: number;
  questaoNumero: number | null;
  dataUrl: string;
  largura: number;
  altura: number;
  xOriginal: number;
  yOriginal: number;
  larguraOriginal: number;
  alturaOriginal: number;
  descricao: string;
  ordem: number;
}

export interface ResultadoParserImagens {
  imagens: RecorteImagemPDF[];
  imagensPorQuestao: Record<number, RecorteImagemPDF[]>;
  paginasSemQuestao: number[];
  avisos: string[];
}

const QUALIDADE_JPEG = 0.9;
const LIMIAR_BRANCO = 248;
const MARGEM_RECORTE = 12;
const LARGURA_MAXIMA_SAIDA = 1100;
const ALTURA_MAXIMA_SAIDA = 900;

/**
 * Correção estritamente dedicada à página final da prova
 * CFS PMESP 2024.
 *
 * Nessa página existem duas imagens independentes em colunas:
 * - questão 58: captura do Microsoft Word;
 * - questão 59: captura do Microsoft Excel.
 *
 * As coordenadas são proporcionais ao tamanho da página para
 * preservar o funcionamento mesmo quando o PDF for renderizado
 * em escalas diferentes.
 */
interface RecorteRelativoDedicado {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

const RECORTE_CFS_2024_QUESTAO_58: RecorteRelativoDedicado = {
  x: 0.11,
  y: 0.625,
  largura: 0.4,
  altura: 0.145,
};

const RECORTE_CFS_2024_QUESTAO_59: RecorteRelativoDedicado = {
  x: 0.545,
  y: 0.065,
  largura: 0.39,
  altura: 0.115,
};

const TERMOS_VISUAIS_FORTES = [
  "quadrinho",
  "quadrinhos",
  "tira",
  "tirinha",
  "charge",
  "cartum",
  "imagem",
  "figura",
  "ilustração",
  "ilustracao",
  "mapa",
  "gráfico",
  "grafico",
  "tabela",
  "quadro",
  "diagrama",
  "esquema",
  "fluxograma",
  "fotografia",
  "foto",
  "logotipo",
  "ícone",
  "icone",
  "print",
  "captura de tela",
  "planilha",
  "célula",
  "celula",
  "excel",
  "word",
  "powerpoint",
  "texto editado",
  "formatação",
  "formatacao",
  "alça de preenchimento",
  "alca de preenchimento",
];

const TERMOS_VISUAIS_REFERENCIA = [
  "acima",
  "abaixo",
  "ao lado",
  "representado",
  "representada",
  "mostrado",
  "mostrada",
  "apresentado",
  "apresentada",
  "observe",
  "analise a imagem",
  "de acordo com a figura",
  "conforme a figura",
];

function gerarId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `imagem-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

function possuiImagemValida(
  pagina: PaginaExtraida
): boolean {
  return (
    typeof pagina.imagemDataUrl === "string" &&
    pagina.imagemDataUrl.startsWith("data:image/") &&
    pagina.imagemDataUrl.includes(";base64,") &&
    pagina.imagemLargura > 0 &&
    pagina.imagemAltura > 0
  );
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function contemTermoVisual(
  textoNormalizado: string,
  termo: string
): boolean {
  const termoNormalizado = normalizarTexto(termo);
  const expressao = new RegExp(
    `(^|[^a-z0-9])${escaparRegex(termoNormalizado)}(?=$|[^a-z0-9])`
  );

  return expressao.test(textoNormalizado);
}

function obterTextoQuestao(questao: Questao): string {
  return normalizarTexto(
    [
      questao.enunciado ?? "",
      questao.alternativaA ?? "",
      questao.alternativaB ?? "",
      questao.alternativaC ?? "",
      questao.alternativaD ?? "",
      questao.alternativaE ?? "",
    ].join(" ")
  );
}

function pontuarReferenciaVisual(
  questao: Questao
): number {
  const texto = obterTextoQuestao(questao);
  let pontos = 0;

  for (const termo of TERMOS_VISUAIS_FORTES) {
    const termoNormalizado = normalizarTexto(termo);

    if (contemTermoVisual(texto, termoNormalizado)) {
      pontos += 10;
    }
  }

  for (const termo of TERMOS_VISUAIS_REFERENCIA) {
    const termoNormalizado = normalizarTexto(termo);

    if (contemTermoVisual(texto, termoNormalizado)) {
      pontos += 4;
    }
  }

  if (
    texto.includes("1 o quadrinho") ||
    texto.includes("2 o quadrinho") ||
    texto.includes("3 o quadrinho") ||
    texto.includes("4 o quadrinho")
  ) {
    pontos += 12;
  }

  return pontos;
}

function ehPaginaInstitucionalSemConteudoUtil(
  pagina: PaginaExtraida
): boolean {
  /*
   * Ignora somente a capa institucional da primeira página.
   *
   * A versão anterior também exigia ausência de início de
   * questão e ausência de chamada visual. No PDF de 2024,
   * ruídos da extração faziam essas verificações falharem e a
   * capa acabava vinculada indevidamente à questão 01.
   *
   * Agora a decisão depende apenas de uma combinação forte de
   * marcadores institucionais na página 1. Isso preserva as
   * imagens úteis das demais páginas, incluindo a tirinha da
   * página 3 e as figuras da prova de 2026.
   */
  if (pagina.numero !== 1) {
    return false;
  }

  const texto = normalizarTexto(pagina.texto);

  const possuiPoliciaMilitar = texto.includes(
    "policia militar do estado de sao paulo"
  );
  const possuiDiretoriaEducacao = texto.includes(
    "diretoria de educacao e cultura"
  );
  const possuiConcursoInterno = texto.includes(
    "concurso interno de selecao"
  );
  const possuiProvaObjetiva = texto.includes(
    "prova objetiva"
  );
  const possuiCursoFormacao = texto.includes(
    "curso de formacao de sargentos"
  );

  const quantidadeMarcadores = [
    possuiPoliciaMilitar,
    possuiDiretoriaEducacao,
    possuiConcursoInterno,
    possuiProvaObjetiva,
    possuiCursoFormacao,
  ].filter(Boolean).length;

  const combinacaoInstitucionalForte =
    possuiPoliciaMilitar &&
    possuiDiretoriaEducacao &&
    (possuiConcursoInterno ||
      possuiProvaObjetiva ||
      possuiCursoFormacao);

  return (
    combinacaoInstitucionalForte ||
    quantidadeMarcadores >= 4
  );
}

function questoesDaPagina(
  questoes: Questao[],
  numeroPagina: number
): Questao[] {
  return questoes
    .filter(
      (questao) =>
        numeroPagina >= questao.paginaInicial &&
        numeroPagina <= questao.paginaFinal
    )
    .sort((a, b) => a.numero - b.numero);
}

function escolherQuestaoResponsavel(
  questoesRelacionadas: Questao[],
  numeroPagina: number
): Questao | null {
  if (questoesRelacionadas.length === 0) {
    return null;
  }

  const candidatas = questoesRelacionadas
    .map((questao) => {
      const pontosVisuais =
        pontuarReferenciaVisual(questao);
      const iniciaNaPagina =
        questao.paginaInicial === numeroPagina;

      /*
       * Uma questão que começa exatamente nesta página recebe
       * prioridade forte. Isso evita que uma imagem da questão
       * seguinte seja atribuída como "continuação" da questão
       * anterior apenas porque os intervalos de páginas se cruzam.
       *
       * Exemplo real:
       * - questão 30 termina na página 8;
       * - questão 31 começa na página 8 e contém a figura;
       * - a imagem da página 8 deve pertencer à questão 31.
       */
      const pontuacaoFinal =
        pontosVisuais + (iniciaNaPagina ? 100 : 0);

      return {
        questao,
        pontosVisuais,
        pontuacaoFinal,
        iniciaNaPagina,
      };
    })
    .sort((a, b) => {
      if (b.pontuacaoFinal !== a.pontuacaoFinal) {
        return b.pontuacaoFinal - a.pontuacaoFinal;
      }

      if (b.pontosVisuais !== a.pontosVisuais) {
        return b.pontosVisuais - a.pontosVisuais;
      }

      return a.questao.numero - b.questao.numero;
    });

  const melhor = candidatas[0];

  if (melhor.pontosVisuais > 0) {
    return melhor.questao;
  }

  const iniciadaNaPagina = candidatas.find(
    (candidata) => candidata.iniciaNaPagina
  );

  return (
    iniciadaNaPagina?.questao ??
    questoesRelacionadas[0]
  );
}

function extrairNumerosDeQuestoesDaPagina(
  textoPagina: string
): number[] {
  const numeros = new Set<number>();
  const regex =
    /(?:^|\n)[^\S\r\n]*(\d{1,3})\s*[.)-][^\S\r\n]+(?=\S)/g;

  let resultado: RegExpExecArray | null;

  while ((resultado = regex.exec(textoPagina)) !== null) {
    const numero = Number(resultado[1]);

    if (numero > 0 && numero <= 999) {
      numeros.add(numero);
    }
  }

  return Array.from(numeros).sort((a, b) => a - b);
}

function extrairIntervalosVisuaisDeclarados(
  textoPagina: string
): number[][] {
  const texto = normalizarTexto(textoPagina);
  const intervalos: number[][] = [];

  /*
   * Só considera intervalos que aparecem dentro de uma chamada
   * explicitamente visual. Isso evita que um texto-base como
   * "questões 01 a 10" receba uma tirinha existente mais abaixo
   * na mesma página.
   */
  const padroes = [
    /(?:considere|observe|analise|leia)[^.]{0,240}?(?:figura|imagem|grafico|tabela|tira|tirinha|quadrinho|diagrama|mapa)[^.]{0,240}?quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
    /(?:considere|observe|analise|leia)[^.]{0,240}?(?:figura|imagem|grafico|tabela|tira|tirinha|quadrinho|diagrama|mapa)[^.]{0,240}?quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+e\s+(\d{1,3})/g,
    /(?:figura|imagem|grafico|tabela|tira|tirinha|quadrinho|diagrama|mapa)[^.]{0,320}?(?:para\s+)?responder(?:\s+as)?\s+quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
    /leia\s+(?:a|o)\s+(?:tira|tirinha|charge|cartum|figura|imagem|grafico|tabela|diagrama|mapa)[^.]{0,320}?quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
    /(?:figura|imagem|grafico|tabela|tira|tirinha|quadrinho|diagrama|mapa)[^.]{0,240}?(?:para\s+)?responder(?:\s+as)?\s+quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+e\s+(\d{1,3})/g,
  ];

  for (const padrao of padroes) {
    let resultado: RegExpExecArray | null;

    while ((resultado = padrao.exec(texto)) !== null) {
      const inicio = Number(resultado[1]);
      const fim = Number(resultado[2]);

      if (
        !Number.isInteger(inicio) ||
        !Number.isInteger(fim) ||
        inicio <= 0 ||
        fim <= 0
      ) {
        continue;
      }

      const menor = Math.min(inicio, fim);
      const maior = Math.max(inicio, fim);

      if (maior - menor > 100) {
        continue;
      }

      const numeros: number[] = [];

      for (let numero = menor; numero <= maior; numero += 1) {
        numeros.push(numero);
      }

      intervalos.push(numeros);
    }
  }

  return intervalos;
}

function extrairIntervalosCompartilhados(
  textoPagina: string
): number[][] {
  const texto = normalizarTexto(textoPagina);
  const intervalos: number[][] = [];

  const padroes = [
    /quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
    /quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+e\s+(\d{1,3})/g,
    /responder(?:\s+as)?\s+quest(?:ao|oes)(?:\s+de)?(?:\s+numeros?)?\s+(\d{1,3})\s+(?:a|ate)\s+(\d{1,3})/g,
  ];

  for (const padrao of padroes) {
    let resultado: RegExpExecArray | null;

    while ((resultado = padrao.exec(texto)) !== null) {
      const inicio = Number(resultado[1]);
      const fim = Number(resultado[2]);

      if (
        !Number.isInteger(inicio) ||
        !Number.isInteger(fim) ||
        inicio <= 0 ||
        fim <= 0
      ) {
        continue;
      }

      const menor = Math.min(inicio, fim);
      const maior = Math.max(inicio, fim);
      const numeros: number[] = [];

      for (let numero = menor; numero <= maior; numero += 1) {
        numeros.push(numero);
      }

      intervalos.push(numeros);
    }
  }

  return intervalos;
}

function escolherQuestoesResponsaveis(
  pagina: PaginaExtraida,
  questoes: Questao[]
): Questao[] {
  const relacionadas = questoesDaPagina(
    questoes,
    pagina.numero
  );

  const responsaveis = new Map<number, Questao>();

  /*
   * Intervalos visuais explícitos têm prioridade absoluta.
   *
   * Exemplo:
   * "Considere a figura e as informações para responder
   * às questões 31 e 32".
   *
   * Quando esse intervalo existe, a imagem da página deve
   * pertencer somente às questões 31 e 32. Nenhuma questão
   * anterior pode receber a imagem por proximidade ou porque
   * sua paginaFinal foi calculada como a página atual.
   */
  const intervalosVisuais =
    extrairIntervalosVisuaisDeclarados(
      pagina.texto
    );

  const intervalos =
    intervalosVisuais.length > 0
      ? intervalosVisuais
      : extrairIntervalosCompartilhados(
          pagina.texto
        );

  const questoesDeIntervalosVisuais = new Map<
    number,
    Questao
  >();

  for (const intervalo of intervalos) {
    const questoesDoIntervalo = intervalo
      .map((numero) =>
        questoes.find((item) => item.numero === numero)
      )
      .filter(
        (questao): questao is Questao =>
          questao !== undefined
      );

    const intervaloFoiDeclaradoComoVisual =
      intervalosVisuais.some(
        (intervaloVisual) =>
          intervaloVisual.length === intervalo.length &&
          intervaloVisual.every(
            (numero, indice) =>
              numero === intervalo[indice]
          )
      );

    const intervaloPossuiReferenciaVisual =
      intervaloFoiDeclaradoComoVisual ||
      questoesDoIntervalo.some(
        (questao) =>
          pontuarReferenciaVisual(questao) >= 10
      );

    if (!intervaloPossuiReferenciaVisual) {
      continue;
    }

    for (const questao of questoesDoIntervalo) {
      questoesDeIntervalosVisuais.set(
        questao.numero,
        questao
      );
    }
  }

  /*
   * Retorno imediato: impede que a questão 30 receba a
   * figura declarada exclusivamente para 31 e 32.
   */
  if (questoesDeIntervalosVisuais.size > 0) {
    return Array.from(
      questoesDeIntervalosVisuais.values()
    ).sort((a, b) => a.numero - b.numero);
  }

  /*
   * Sem intervalo explícito, aceitamos apenas questões que
   * realmente aparecem na página e possuem referência visual
   * forte, usando comparação por palavras inteiras.
   */
  const numerosNaPagina = new Set(
    extrairNumerosDeQuestoesDaPagina(pagina.texto)
  );

  for (const questao of questoes) {
    if (
      numerosNaPagina.has(questao.numero) &&
      pontuarReferenciaVisual(questao) >= 10
    ) {
      responsaveis.set(questao.numero, questao);
    }
  }

  if (responsaveis.size > 0) {
    return Array.from(responsaveis.values()).sort(
      (a, b) => a.numero - b.numero
    );
  }

  /*
   * Último fallback para imagens individuais sem chamada
   * explícita. Ele só considera questões da própria página.
   */
  const candidatasDaPagina = relacionadas.filter(
    (questao) =>
      questao.paginaInicial === pagina.numero
  );

  const principal = escolherQuestaoResponsavel(
    candidatasDaPagina,
    pagina.numero
  );

  if (principal) {
    responsaveis.set(principal.numero, principal);
  }

  return Array.from(responsaveis.values()).sort(
    (a, b) => a.numero - b.numero
  );
}


function ehQuestaoDaProvaCFS2024(
  questao: Questao | undefined,
  numero: number
): questao is Questao {
  if (!questao || questao.numero !== numero) {
    return false;
  }

  const provaNormalizada = normalizarTexto(
    String(questao.prova ?? "")
  );

  return (
    questao.ano === 2024 &&
    provaNormalizada.includes("cfs") &&
    provaNormalizada.includes("pmesp")
  );
}

function ehPaginaDedicadaQuestoes58e59CFS2024(
  pagina: PaginaExtraida,
  questoes: Questao[]
): {
  questao58: Questao;
  questao59: Questao;
} | null {
  const questao58 = questoes.find(
    (questao) => questao.numero === 58
  );
  const questao59 = questoes.find(
    (questao) => questao.numero === 59
  );

  if (
    !ehQuestaoDaProvaCFS2024(questao58, 58) ||
    !ehQuestaoDaProvaCFS2024(questao59, 59)
  ) {
    return null;
  }

  const textoPagina = normalizarTexto(pagina.texto);

  const possuiQuestao58 =
    /(^|[^0-9])58[.)-]/.test(textoPagina) ||
    textoPagina.includes("microsoft word 2016");

  const possuiQuestao59 =
    /(^|[^0-9])59[.)-]/.test(textoPagina) ||
    textoPagina.includes("microsoft excel 2016");

  const possuiIndicadoresVisuais =
    textoPagina.includes("microsoft word 2016") &&
    textoPagina.includes("microsoft excel 2016");

  if (
    !possuiQuestao58 ||
    !possuiQuestao59 ||
    !possuiIndicadoresVisuais
  ) {
    return null;
  }

  return {
    questao58,
    questao59,
  };
}

async function recortarImagemRelativaDedicada(
  pagina: PaginaExtraida,
  recorte: RecorteRelativoDedicado
): Promise<{
  dataUrl: string;
  largura: number;
  altura: number;
  xOriginal: number;
  yOriginal: number;
  larguraOriginal: number;
  alturaOriginal: number;
}> {
  if (typeof document === "undefined") {
    throw new Error(
      "O recorte dedicado das imagens precisa ser executado no navegador."
    );
  }

  const imagem = await carregarImagem(
    pagina.imagemDataUrl
  );

  const origemX = Math.max(
    0,
    Math.floor(imagem.naturalWidth * recorte.x)
  );
  const origemY = Math.max(
    0,
    Math.floor(imagem.naturalHeight * recorte.y)
  );
  const origemLargura = Math.max(
    1,
    Math.min(
      imagem.naturalWidth - origemX,
      Math.ceil(
        imagem.naturalWidth * recorte.largura
      )
    )
  );
  const origemAltura = Math.max(
    1,
    Math.min(
      imagem.naturalHeight - origemY,
      Math.ceil(
        imagem.naturalHeight * recorte.altura
      )
    )
  );

  const escala = Math.min(
    1,
    LARGURA_MAXIMA_SAIDA / origemLargura,
    ALTURA_MAXIMA_SAIDA / origemAltura
  );

  const larguraSaida = Math.max(
    1,
    Math.round(origemLargura * escala)
  );
  const alturaSaida = Math.max(
    1,
    Math.round(origemAltura * escala)
  );

  const canvas = document.createElement("canvas");
  canvas.width = larguraSaida;
  canvas.height = alturaSaida;

  const contexto = canvas.getContext("2d", {
    alpha: false,
  });

  if (!contexto) {
    throw new Error(
      "Não foi possível preparar o recorte dedicado."
    );
  }

  contexto.fillStyle = "#ffffff";
  contexto.fillRect(
    0,
    0,
    larguraSaida,
    alturaSaida
  );

  contexto.drawImage(
    imagem,
    origemX,
    origemY,
    origemLargura,
    origemAltura,
    0,
    0,
    larguraSaida,
    alturaSaida
  );

  const dataUrl = canvas.toDataURL(
    "image/jpeg",
    QUALIDADE_JPEG
  );

  canvas.width = 1;
  canvas.height = 1;

  return {
    dataUrl,
    largura: larguraSaida,
    altura: alturaSaida,
    xOriginal: pagina.largura * recorte.x,
    yOriginal: pagina.altura * recorte.y,
    larguraOriginal:
      pagina.largura * recorte.largura,
    alturaOriginal:
      pagina.altura * recorte.altura,
  };
}

async function criarImagemDedicadaCFS2024(
  pagina: PaginaExtraida,
  questao: Questao,
  ordem: number,
  recorte: RecorteRelativoDedicado,
  descricaoConteudo: string
): Promise<RecorteImagemPDF> {
  const imagemRecortada =
    await recortarImagemRelativaDedicada(
      pagina,
      recorte
    );

  return {
    id: gerarId(),
    tipo: "questao",
    pagina: pagina.numero,
    questaoNumero: questao.numero,
    dataUrl: imagemRecortada.dataUrl,
    largura: imagemRecortada.largura,
    altura: imagemRecortada.altura,
    xOriginal: imagemRecortada.xOriginal,
    yOriginal: imagemRecortada.yOriginal,
    larguraOriginal:
      imagemRecortada.larguraOriginal,
    alturaOriginal:
      imagemRecortada.alturaOriginal,
    descricao: `${descricaoConteudo} da questão ${String(
      questao.numero
    ).padStart(2, "0")} — CFS PMESP 2024.`,
    ordem,
  };
}

function carregarImagem(
  dataUrl: string
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined") {
      reject(
        new Error(
          "A extração das imagens precisa ser executada no navegador."
        )
      );
      return;
    }

    const imagem = new Image();

    imagem.onload = () => resolve(imagem);
    imagem.onerror = () =>
      reject(
        new Error(
          "Não foi possível carregar a imagem extraída."
        )
      );
    imagem.src = dataUrl;
  });
}

function pixelNaoBranco(
  dados: Uint8ClampedArray,
  indice: number
): boolean {
  return (
    dados[indice] < LIMIAR_BRANCO ||
    dados[indice + 1] < LIMIAR_BRANCO ||
    dados[indice + 2] < LIMIAR_BRANCO
  );
}

async function limparECompactarImagem(
  pagina: PaginaExtraida
): Promise<{
  dataUrl: string;
  largura: number;
  altura: number;
}> {
  if (typeof document === "undefined") {
    throw new Error(
      "O tratamento das imagens precisa ser executado no navegador."
    );
  }

  const imagem = await carregarImagem(
    pagina.imagemDataUrl
  );

  const canvasOrigem = document.createElement("canvas");
  canvasOrigem.width = Math.max(1, imagem.naturalWidth);
  canvasOrigem.height = Math.max(1, imagem.naturalHeight);

  const contextoOrigem = canvasOrigem.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  if (!contextoOrigem) {
    throw new Error(
      "Não foi possível preparar a imagem extraída."
    );
  }

  contextoOrigem.fillStyle = "#ffffff";
  contextoOrigem.fillRect(
    0,
    0,
    canvasOrigem.width,
    canvasOrigem.height
  );
  contextoOrigem.drawImage(imagem, 0, 0);

  const dados = contextoOrigem.getImageData(
    0,
    0,
    canvasOrigem.width,
    canvasOrigem.height
  ).data;

  let minX = canvasOrigem.width;
  let minY = canvasOrigem.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < canvasOrigem.height; y += 1) {
    for (let x = 0; x < canvasOrigem.width; x += 1) {
      const indice = (y * canvasOrigem.width + x) * 4;

      if (pixelNaoBranco(dados, indice)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    canvasOrigem.width = 1;
    canvasOrigem.height = 1;

    throw new Error(
      "A imagem extraída não possui conteúdo visual útil."
    );
  }

  minX = Math.max(0, minX - MARGEM_RECORTE);
  minY = Math.max(0, minY - MARGEM_RECORTE);
  maxX = Math.min(
    canvasOrigem.width - 1,
    maxX + MARGEM_RECORTE
  );
  maxY = Math.min(
    canvasOrigem.height - 1,
    maxY + MARGEM_RECORTE
  );

  const larguraRecorte = maxX - minX + 1;
  const alturaRecorte = maxY - minY + 1;

  const escala = Math.min(
    1,
    LARGURA_MAXIMA_SAIDA / larguraRecorte,
    ALTURA_MAXIMA_SAIDA / alturaRecorte
  );

  const larguraSaida = Math.max(
    1,
    Math.round(larguraRecorte * escala)
  );
  const alturaSaida = Math.max(
    1,
    Math.round(alturaRecorte * escala)
  );

  const canvasSaida = document.createElement("canvas");
  canvasSaida.width = larguraSaida;
  canvasSaida.height = alturaSaida;

  const contextoSaida = canvasSaida.getContext("2d", {
    alpha: false,
  });

  if (!contextoSaida) {
    throw new Error(
      "Não foi possível preparar a imagem compactada."
    );
  }

  contextoSaida.fillStyle = "#ffffff";
  contextoSaida.fillRect(
    0,
    0,
    larguraSaida,
    alturaSaida
  );

  contextoSaida.drawImage(
    canvasOrigem,
    minX,
    minY,
    larguraRecorte,
    alturaRecorte,
    0,
    0,
    larguraSaida,
    alturaSaida
  );

  const dataUrl = canvasSaida.toDataURL(
    "image/jpeg",
    QUALIDADE_JPEG
  );

  canvasOrigem.width = 1;
  canvasOrigem.height = 1;
  canvasSaida.width = 1;
  canvasSaida.height = 1;

  return {
    dataUrl,
    largura: larguraSaida,
    altura: alturaSaida,
  };
}

function criarImagemVisual(
  pagina: PaginaExtraida,
  questao: Questao | null,
  ordem: number,
  imagemTratada: {
    dataUrl: string;
    largura: number;
    altura: number;
  }
): RecorteImagemPDF {
  const primeiraPaginaDaQuestao =
    questao !== null &&
    pagina.numero === questao.paginaInicial;

  const tipo: TipoImagemDetectada =
    questao === null
      ? "pagina"
      : primeiraPaginaDaQuestao
        ? "questao"
        : "continuidade";

  return {
    id: gerarId(),
    tipo,
    pagina: pagina.numero,
    questaoNumero: questao?.numero ?? null,
    dataUrl: imagemTratada.dataUrl,
    largura: imagemTratada.largura,
    altura: imagemTratada.altura,
    xOriginal: 0,
    yOriginal: 0,
    larguraOriginal: pagina.largura,
    alturaOriginal: pagina.altura,
    descricao:
      questao === null
        ? `Conteúdo visual da página ${pagina.numero}.`
        : tipo === "questao"
          ? `Conteúdo visual associado à questão ${String(
              questao.numero
            ).padStart(2, "0")} na página ${pagina.numero}.`
          : `Continuação visual associada à questão ${String(
              questao.numero
            ).padStart(2, "0")} na página ${pagina.numero}.`,
    ordem,
  };
}

function completarAssociacoesDeIntervalosVisuais(
  pdf: PDFExtraido,
  questoes: Questao[],
  imagens: RecorteImagemPDF[],
  imagensPorQuestao: Record<number, RecorteImagemPDF[]>,
  avisos: string[],
  ordemInicial: number
): number {
  let ordem = ordemInicial;

  /*
   * Pós-processamento estritamente conservador:
   * só replica uma imagem quando a própria página declara
   * expressamente que a tira, figura, tabela ou imagem serve
   * para um intervalo de questões.
   *
   * Isso corrige casos como:
   * "Leia a tira para responder às questões de números 01 a 03."
   *
   * Não cria associações por proximidade e não afeta imagens
   * individuais da prova de 2026.
   */
  for (const pagina of pdf.paginas) {
    const intervalosVisuais =
      extrairIntervalosVisuaisDeclarados(pagina.texto);

    if (intervalosVisuais.length === 0) {
      continue;
    }

    for (const intervalo of intervalosVisuais) {
      const questoesDoIntervalo = intervalo
        .map((numero) =>
          questoes.find((questao) => questao.numero === numero)
        )
        .filter(
          (questao): questao is Questao =>
            questao !== undefined
        );

      if (questoesDoIntervalo.length === 0) {
        continue;
      }

      const imagensDaPaginaNoIntervalo =
        questoesDoIntervalo.flatMap((questao) =>
          (imagensPorQuestao[questao.numero] ?? []).filter(
            (imagem) => imagem.pagina === pagina.numero
          )
        );

      if (imagensDaPaginaNoIntervalo.length === 0) {
        continue;
      }

      const imagemBase = imagensDaPaginaNoIntervalo[0];

      for (const questao of questoesDoIntervalo) {
        const jaPossuiImagemDaPagina = (
          imagensPorQuestao[questao.numero] ?? []
        ).some((imagem) => imagem.pagina === pagina.numero);

        if (jaPossuiImagemDaPagina) {
          continue;
        }

        const imagemCompartilhada: RecorteImagemPDF = {
          ...imagemBase,
          id: gerarId(),
          tipo:
            pagina.numero === questao.paginaInicial
              ? "questao"
              : "continuidade",
          questaoNumero: questao.numero,
          descricao:
            pagina.numero === questao.paginaInicial
              ? `Conteúdo visual associado à questão ${String(
                  questao.numero
                ).padStart(2, "0")} na página ${pagina.numero}.`
              : `Continuação visual associada à questão ${String(
                  questao.numero
                ).padStart(2, "0")} na página ${pagina.numero}.`,
          ordem,
        };

        ordem += 1;
        imagens.push(imagemCompartilhada);

        if (!imagensPorQuestao[questao.numero]) {
          imagensPorQuestao[questao.numero] = [];
        }

        imagensPorQuestao[questao.numero].push(
          imagemCompartilhada
        );

        avisos.push(
          `A imagem da página ${pagina.numero} também foi associada à questão ${String(
            questao.numero
          ).padStart(
            2,
            "0"
          )} porque a própria página declara um conteúdo visual compartilhado entre as questões ${intervalo
            .map((numero) =>
              String(numero).padStart(2, "0")
            )
            .join(", ")}.`
        );
      }
    }
  }

  return ordem;
}

export async function extrairImagensDoPDF(
  pdf: PDFExtraido,
  questoes: Questao[]
): Promise<ResultadoParserImagens> {
  const imagens: RecorteImagemPDF[] = [];
  const imagensPorQuestao: Record<
    number,
    RecorteImagemPDF[]
  > = {};
  const paginasSemQuestao: number[] = [];
  const avisos: string[] = [];

  let ordem = 0;

  for (const pagina of pdf.paginas) {
    if (!possuiImagemValida(pagina)) {
      continue;
    }

    if (ehPaginaInstitucionalSemConteudoUtil(pagina)) {
      avisos.push(
        `Imagem institucional da página ${pagina.numero} ignorada por não conter conteúdo necessário para resolver questões.`
      );
      continue;
    }

    const paginaDedicadaCFS2024 =
      ehPaginaDedicadaQuestoes58e59CFS2024(
        pagina,
        questoes
      );

    if (paginaDedicadaCFS2024) {
      try {
        const imagemQuestao58 =
          await criarImagemDedicadaCFS2024(
            pagina,
            paginaDedicadaCFS2024.questao58,
            ordem,
            RECORTE_CFS_2024_QUESTAO_58,
            "Captura do Microsoft Word"
          );

        ordem += 1;

        const imagemQuestao59 =
          await criarImagemDedicadaCFS2024(
            pagina,
            paginaDedicadaCFS2024.questao59,
            ordem,
            RECORTE_CFS_2024_QUESTAO_59,
            "Captura da planilha do Microsoft Excel"
          );

        ordem += 1;

        imagens.push(
          imagemQuestao58,
          imagemQuestao59
        );

        imagensPorQuestao[58] = [
          imagemQuestao58,
        ];
        imagensPorQuestao[59] = [
          imagemQuestao59,
        ];

        avisos.push(
          `Aplicada correção visual dedicada na página ${pagina.numero}: imagem do Word vinculada somente à questão 58 e imagem do Excel vinculada somente à questão 59.`
        );
      } catch (erro) {
        const mensagem =
          erro instanceof Error
            ? erro.message
            : "Erro desconhecido.";

        avisos.push(
          `Não foi possível aplicar a correção dedicada das questões 58 e 59 na página ${pagina.numero}: ${mensagem}`
        );
      }

      /*
       * A página inteira não passa pelo processamento geral.
       * Isso impede associação indevida às questões 56, 57 ou
       * 60 e evita duplicar os dois recortes dedicados.
       */
      continue;
    }

    try {
      const imagemTratada =
        await limparECompactarImagem(pagina);

      const questoesResponsaveis =
        escolherQuestoesResponsaveis(
          pagina,
          questoes
        );

      if (questoesResponsaveis.length === 0) {
        paginasSemQuestao.push(pagina.numero);

        const imagemPagina = criarImagemVisual(
          pagina,
          null,
          ordem,
          imagemTratada
        );

        ordem += 1;
        imagens.push(imagemPagina);
        continue;
      }

      for (const questaoResponsavel of questoesResponsaveis) {
        const imagemQuestao = criarImagemVisual(
          pagina,
          questaoResponsavel,
          ordem,
          imagemTratada
        );

        ordem += 1;
        imagens.push(imagemQuestao);

        if (
          !imagensPorQuestao[questaoResponsavel.numero]
        ) {
          imagensPorQuestao[
            questaoResponsavel.numero
          ] = [];
        }

        imagensPorQuestao[
          questaoResponsavel.numero
        ].push(imagemQuestao);
      }

      if (questoesResponsaveis.length > 1) {
        avisos.push(
          `A imagem da página ${pagina.numero} foi compartilhada entre as questões ${questoesResponsaveis
            .map((questao) =>
              String(questao.numero).padStart(2, "0")
            )
            .join(", ")} para preservar o contexto visual.`
        );
      }
    } catch (erro) {
      const mensagem =
        erro instanceof Error
          ? erro.message
          : "Erro desconhecido.";

      avisos.push(
        `Imagem da página ${pagina.numero} ignorada: ${mensagem}`
      );
    }
  }

  ordem = completarAssociacoesDeIntervalosVisuais(
    pdf,
    questoes,
    imagens,
    imagensPorQuestao,
    avisos,
    ordem
  );

  return {
    imagens,
    imagensPorQuestao,
    paginasSemQuestao,
    avisos,
  };
}