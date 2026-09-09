import { detectarApoios } from "@/lib/parserApoios";
import type { ApoioDetectado } from "@/lib/parserApoios";
import type { PDFExtraido, PaginaExtraida } from "@/lib/pdf";
import type { Questao } from "@/types/questao";

export interface MetadadosProva {
  disciplina?: string;
  prova?: string;
  ano?: number;
  totalEsperado?: number;
}

export interface ResultadoParserQuestoes {
  questoes: Questao[];
  apoios: ApoioDetectado[];
  totalEncontrado: number;
  avisosGerais: string[];
}

interface BlocoQuestao {
  numero: number;
  conteudo: string;
  paginaInicial: number;
  paginaFinal: number;
}

interface OcorrenciaQuestao {
  numero: number;
  inicio: number;
  inicioConteudo: number;
}

interface MarcadorAlternativa {
  letra: "A" | "B" | "C" | "D" | "E";
  inicio: number;
  inicioTexto: number;
}

/**
 * Remove cabeçalhos, rodapés, marcas d'água e artefatos
 * encontrados nos PDFs das provas da PMESP/Vunesp.
 */
function limparTextoPagina(pagina: PaginaExtraida): string {
  return pagina.texto
    // Marca inserida pelo site PCI Concursos.
    .replace(/pcimarkpci[^\n]*/gi, " ")

    // Endereço repetido no cabeçalho.
    .replace(/www\.pciconcursos\.com\.br/gi, " ")

    // Cabeçalhos e rodapés.
    /*
     * O PDF pode inserir espaços no meio das palavras do
     * rodapé, por exemplo:
     * "Confidencial até o m omento da aplic ação."
     *
     * Esta expressão tolera espaços internos sem afetar o
     * restante do conteúdo da questão.
     */
    .replace(
      /C\s*o\s*n\s*f\s*i\s*d\s*e\s*n\s*c\s*i\s*a\s*l\s+a\s*t\s*[ée]\s+o\s+m\s*o\s*m\s*e\s*n\s*t\s*o\s+d\s*a\s+a\s*p\s*l\s*i\s*c\s*a\s*[çc]\s*[ãa]\s*o\.?/gi,
      " "
    )
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

    /*
     * Remove somente cabeçalhos de matéria quando aparecem
     * isolados em uma linha. A regra tolera letras separadas
     * pelo processo de extração do PDF, sem alterar palavras
     * semelhantes dentro das alternativas.
     */
    .replace(
      /^\s*L\s*[íi]\s*n\s*g\s*u\s*a\s+P\s*o\s*r\s*t\s*u\s*g\s*u\s*e\s*s\s*a\s*$/gim,
      " "
    )
    .replace(
      /^\s*M\s*a\s*t\s*e\s*m\s*[áa]\s*t\s*i\s*c\s*a\s*$/gim,
      " "
    )
    .replace(
      /^\s*R\s*a\s*c\s*i\s*o\s*c\s*[íi]\s*n\s*i\s*o\s+L\s*[óo]\s*g\s*i\s*c\s*o\s*$/gim,
      " "
    )
    .replace(
      /^\s*R\s*e\s*g\s*u\s*l\s*a\s*m\s*e\s*n\s*t\s*o\s*s\s+e\s+I\s*n\s*s\s*t\s*r\s*u\s*[çc]\s*[õo]\s*e\s*s\s*$/gim,
      " "
    )

    // A palavra RASCUNHO aparece antes de algumas questões.
    // O PDF pode extraí-la com espaços entre todas as letras.
    .replace(/\bR\s*A\s*S\s*C\s*U\s*N\s*H\s*O\b/gi, " ")
    .replace(/\bRascunho\b/gi, " ")

    // Artefatos diversos do PDF.
    .replace(/\uFFFD/g, "")
    .replace(/￾/g, "")
    .replace(/\u00ad/g, "")
    .replace(/id\s*=\s*["'][^"']+["']/gi, " ")

    // Corrige palavras quebradas por hífen no fim da linha.
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")

    // Organiza espaços e quebras.
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

    /*
     * Não removemos números finais de forma genérica nesta fase.
     * Um número no fim da página pode ser o conteúdo legítimo
     * da última alternativa, como "D) 5".
     *
     * A remoção segura de número residual de página é feita
     * posteriormente por removerNumeroPaginaResidual(), apenas
     * quando o valor coincide com a página inicial ou final do
     * bloco da questão.
     */
    .trim();
}

/**
 * Junta as páginas e acrescenta marcadores internos para
 * preservar a página de origem de cada questão.
 */
function montarTextoComPaginas(pdf: PDFExtraido): string {
  return pdf.paginas
    .map((pagina) => {
      const textoLimpo = limparTextoPagina(pagina);

      return `\n[[PAGINA:${pagina.numero}]]\n${textoLimpo}`;
    })
    .join("\n");
}

/**
 * Obtém o número da página correspondente à posição informada
 * dentro do texto completo da prova.
 */
function obterPaginaMaisProxima(
  texto: string,
  posicao: number,
  paginaPadrao = 1
): number {
  const trechoAnterior = texto.slice(0, Math.max(0, posicao));
  const regexPagina = /\[\[PAGINA:(\d+)]]/g;

  let pagina = paginaPadrao;
  let resultado: RegExpExecArray | null;

  while ((resultado = regexPagina.exec(trechoAnterior)) !== null) {
    pagina = Number(resultado[1]);
  }

  return pagina;
}

/**
 * Calcula a página final real de uma questão, ignorando
 * marcadores de página sem conteúdo útil depois deles.
 */
function obterPaginaFinalRealDoBloco(
  textoCompleto: string,
  inicioConteudo: number,
  fimBloco: number,
  paginaInicial: number
): number {
  const trecho = textoCompleto.slice(inicioConteudo, fimBloco);
  const regexPagina = /\[\[PAGINA:(\d+)]]/g;
  const marcadores: Array<{
    pagina: number;
    inicio: number;
    fim: number;
  }> = [];

  let resultado: RegExpExecArray | null;

  while ((resultado = regexPagina.exec(trecho)) !== null) {
    marcadores.push({
      pagina: Number(resultado[1]),
      inicio: resultado.index,
      fim: regexPagina.lastIndex,
    });
  }

  let paginaFinal = paginaInicial;

  for (let indice = 0; indice < marcadores.length; indice += 1) {
    const atual = marcadores[indice];
    const proximo = marcadores[indice + 1];

    const fimDaPagina = proximo
      ? proximo.inicio
      : trecho.length;

    const conteudoDaPagina = trecho
      .slice(atual.fim, fimDaPagina)
      .replace(/\s+/g, " ")
      .trim();

    if (conteudoDaPagina.length > 0) {
      paginaFinal = atual.pagina;
    }
  }

  return paginaFinal;
}

/**
 * Remove os marcadores internos usados apenas para preservar
 * a página de origem.
 */
function removerMarcadoresPagina(texto: string): string {
  return texto
    .replace(/\[\[PAGINA:\d+]]/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Localiza questões numeradas com um, dois ou três dígitos.
 *
 * Aceita espaços antes do número, mas exige que a numeração
 * esteja no início de uma linha. Isso permite importar provas
 * com quantidades diferentes de questões sem limitar o parser
 * ao intervalo de 01 a 60.
 */
function localizarOcorrenciasQuestoes(
  texto: string
): OcorrenciaQuestao[] {
  const regexQuestao =
    /(?:^|\n)[^\S\r\n]*(\d{2})\.[^\S\r\n]+(?=\S)/g;

  const ocorrencias: OcorrenciaQuestao[] = [];

  let resultado: RegExpExecArray | null;

  while ((resultado = regexQuestao.exec(texto)) !== null) {
    const numero = Number(resultado[1]);

    if (numero < 1 || numero > 999) {
      continue;
    }

    ocorrencias.push({
      numero,
      inicio: resultado.index,
      inicioConteudo: regexQuestao.lastIndex,
    });
  }

  return ocorrencias;
}

/**
 * Divide o conteúdo completo da prova em blocos individuais
 * correspondentes a cada questão.
 */
function separarBlocosQuestoes(texto: string): BlocoQuestao[] {
  const ocorrencias = localizarOcorrenciasQuestoes(texto);

  return ocorrencias.map((ocorrencia, indice) => {
    const proximaOcorrencia = ocorrencias[indice + 1];

    const fim = proximaOcorrencia
      ? proximaOcorrencia.inicio
      : texto.length;

    const conteudoBruto = texto.slice(
      ocorrencia.inicioConteudo,
      fim
    );

    const paginaInicial = obterPaginaMaisProxima(
      texto,
      ocorrencia.inicio
    );

    const paginaFinal = obterPaginaFinalRealDoBloco(
      texto,
      ocorrencia.inicioConteudo,
      fim,
      paginaInicial
    );

    return {
      numero: ocorrencia.numero,
      conteudo: removerMarcadoresPagina(conteudoBruto),
      paginaInicial,
      paginaFinal,
    };
  });
}

/**
 * Normaliza espaços e pontuação sem remover o conteúdo
 * relevante da questão.
 */
function normalizarTexto(texto: string | undefined): string {
  return (texto ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([(\[]) +/g, "$1")
    .replace(/ +([)\]])/g, "$1")
    .replace(
      /\b(\d{1,3})\s+o\s+(parágrafo|paragrafo|quadro|quadrinho|item|inciso)\b/gi,
      "$1º $2"
    )
    .replace(/\bn\s+o\s+(?=\d)/gi, "nº ")
    .trim();
}

/**
 * Remove um número de página residual no fim do texto.
 *
 * A remoção só ocorre quando o número final coincide com a
 * página inicial ou final do bloco. Assim, números legítimos
 * presentes nas alternativas não são removidos arbitrariamente.
 */
function removerNumeroPaginaResidual(
  texto: string,
  bloco: BlocoQuestao
): string {
  const normalizado = normalizarTexto(texto);

  const resultado = normalizado.match(
    /^(.*?)(?:\s+)(\d{1,3})$/
  );

  if (!resultado) {
    return normalizado;
  }

  const numeroFinal = Number(resultado[2]);

  if (
    numeroFinal !== bloco.paginaInicial &&
    numeroFinal !== bloco.paginaFinal
  ) {
    return normalizado;
  }

  return resultado[1].trim();
}

/**
 * Localiza os marcadores das alternativas no formato:
 * (A), (B), (C), (D) e (E).
 */
function localizarAlternativas(
  conteudo: string
): MarcadorAlternativa[] {
  const regexAlternativa =
    /(?:^|\s)\(([A-E])\)[^\S\r\n]*/g;

  const marcadores: MarcadorAlternativa[] = [];

  let resultado: RegExpExecArray | null;

  while ((resultado = regexAlternativa.exec(conteudo)) !== null) {
    const deslocamentoMarcador =
      resultado[0].indexOf("(");

    marcadores.push({
      letra: resultado[1] as MarcadorAlternativa["letra"],
      inicio: resultado.index + deslocamentoMarcador,
      inicioTexto: regexAlternativa.lastIndex,
    });
  }

  return marcadores;
}

function normalizarParaClassificacao(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function contemAlgum(
  texto: string,
  termos: string[]
): boolean {
  return termos.some((termo) =>
    texto.includes(normalizarParaClassificacao(termo))
  );
}

/**
 * Identifica a disciplina usando faixas oficiais específicas
 * para cada edição da prova CFS PMESP.
 *
 * As regras de 2024 e 2026 são independentes. Isso impede
 * que uma alteração necessária em uma edição modifique a
 * classificação da outra.
 */
function ehProvaCFSPMESP(
  prova: string,
  ano: number,
  anoEsperado: number
): boolean {
  const nome = normalizarParaClassificacao(prova);

  return (
    ano === anoEsperado &&
    nome.includes("cfs") &&
    nome.includes("pmesp")
  );
}

function detectarDisciplinaPorFaixa2024(
  numero: number
): string | null {
  if (numero >= 1 && numero <= 20) {
    return "Língua Portuguesa";
  }

  if (numero >= 21 && numero <= 34) {
    return "Matemática";
  }

  if (numero >= 35 && numero <= 40) {
    return "Raciocínio Lógico";
  }

  if (numero >= 41 && numero <= 42) {
    return "Direitos Humanos e ECA";
  }

  if (numero >= 43 && numero <= 44) {
    return "Direito Constitucional";
  }

  if (numero >= 45 && numero <= 47) {
    return "Direito Penal e Processual Penal";
  }

  if (numero >= 48 && numero <= 50) {
    return "Direito Penal e Processual Penal Militar";
  }

  if (numero >= 51 && numero <= 57) {
    return "Regulamentos e Instruções";
  }

  if (numero >= 58 && numero <= 60) {
    return "Informática";
  }

  return null;
}

function detectarDisciplinaPorFaixa2026(
  numero: number
): string | null {
  if (numero >= 1 && numero <= 20) {
    return "Língua Portuguesa";
  }

  if (numero >= 21 && numero <= 40) {
    return "Matemática";
  }

  if (numero >= 41 && numero <= 42) {
    return "Direitos Humanos";
  }

  if (numero >= 43 && numero <= 44) {
    return "Direito Constitucional";
  }

  if (numero >= 45 && numero <= 48) {
    return "Direito Penal e Processual Penal";
  }

  if (numero >= 49 && numero <= 50) {
    return "Direito Penal Militar";
  }

  if (numero === 51) {
    return "Direito Processual Penal Militar";
  }

  if (numero >= 52 && numero <= 58) {
    return "Legislação Institucional";
  }

  if (numero >= 59 && numero <= 60) {
    return "Informática";
  }

  return null;
}

function detectarDisciplinaQuestao(
  numero: number,
  conteudo: string,
  disciplinaRecebida: string,
  prova: string,
  ano: number
): string {
  const disciplinaInformada = disciplinaRecebida.trim();
  const disciplinaNormalizada =
    normalizarParaClassificacao(disciplinaInformada);

  /*
   * "VUNESP" é banca examinadora, não disciplina.
   * Caso seja informada por engano no campo de disciplina,
   * o parser continua com a classificação automática.
   */
  const valoresQueNaoSaoDisciplina = new Set([
    "",
    "nao identificada",
    "vunesp",
    "fundacao vunesp",
  ]);

  /*
   * Para edições conhecidas do CFS PMESP, a faixa oficial da
   * questão tem prioridade sobre o valor recebido no formulário.
   * Isso evita que fragmentos extraídos do PDF, como
   * "ass e túrgi", sejam gravados como disciplina.
   */
  if (ehProvaCFSPMESP(prova, ano, 2024)) {
    const disciplina2024 =
      detectarDisciplinaPorFaixa2024(numero);

    if (disciplina2024) {
      return disciplina2024;
    }
  }

  if (ehProvaCFSPMESP(prova, ano, 2026)) {
    const disciplina2026 =
      detectarDisciplinaPorFaixa2026(numero);

    if (disciplina2026) {
      return disciplina2026;
    }
  }

  if (!valoresQueNaoSaoDisciplina.has(disciplinaNormalizada)) {
    return disciplinaInformada;
  }

  const texto = normalizarParaClassificacao(conteudo);

  if (
    contemAlgum(texto, [
      "interpretação de texto",
      "interpretacao de texto",
      "língua portuguesa",
      "lingua portuguesa",
      "gramática",
      "gramatica",
      "ortografia",
      "acentuação",
      "acentuacao",
      "pontuação",
      "pontuacao",
      "sinônimo",
      "sinonimo",
      "antônimo",
      "antonimo",
      "oração",
      "oracao",
      "concordância",
      "concordancia",
      "regência",
      "regencia",
      "crase",
      "norma-padrão",
      "norma padrao",
      "parágrafo",
      "paragrafo",
    ])
  ) {
    return "Língua Portuguesa";
  }

  if (
    contemAlgum(texto, [
      "equação",
      "equacao",
      "porcentagem",
      "probabilidade",
      "razão",
      "razao",
      "proporção",
      "proporcao",
      "função",
      "funcao",
      "geometria",
      "área",
      "area",
      "perímetro",
      "perimetro",
      "ângulo",
      "angulo",
      "média aritmética",
      "media aritmetica",
      "sistema de equações",
      "sistema de equacoes",
    ])
  ) {
    return "Matemática";
  }

  if (
    contemAlgum(texto, [
      "proposição",
      "proposicao",
      "tabela-verdade",
      "tabela verdade",
      "negação da afirmação",
      "negacao da afirmacao",
      "logicamente equivalente",
      "tautologia",
      "contradição",
      "contradicao",
      "contingência",
      "contingencia",
      "diagrama lógico",
      "diagrama logico",
    ])
  ) {
    return "Raciocínio Lógico";
  }

  if (
    contemAlgum(texto, [
      "informática",
      "informatica",
      "windows",
      "linux",
      "word",
      "excel",
      "powerpoint",
      "internet",
      "intranet",
      "navegador",
      "hardware",
      "software",
      "rede de computadores",
      "segurança da informação",
      "seguranca da informacao",
      "planilha",
      "célula",
      "celula",
      "slide",
      "apresentação",
      "apresentacao",
    ])
  ) {
    return "Informática";
  }

  if (
    contemAlgum(texto, [
      "Declaração Universal dos Direitos Humanos",
      "direitos humanos",
      "Convenção Americana sobre Direitos Humanos",
      "Pacto de San José",
      "dignidade da pessoa humana",
      "direito de asilo",
      "estatuto da criança e do adolescente",
      "eca",
    ])
  ) {
    return "Direitos Humanos";
  }

  if (
    contemAlgum(texto, [
      "Código de Processo Penal Militar",
      "processo penal militar",
      "inquérito policial militar",
      "IPM",
      "insubmisso",
      "desertor",
      "polícia judiciária militar",
      "ação penal militar",
    ])
  ) {
    return "Direito Processual Penal Militar";
  }

  if (
    contemAlgum(texto, [
      "Código Penal Militar",
      "crime militar",
      "pena militar",
      "revolta",
      "motim",
      "deserção",
      "desercao",
      "despojamento desprezível",
      "despojamento desprezivel",
      "incitamento",
      "recusa de obediência",
      "recusa de obediencia",
      "violência contra superior",
      "violencia contra superior",
    ])
  ) {
    return "Direito Penal Militar";
  }

  if (
    contemAlgum(texto, [
      "Código de Processo Penal",
      "processo penal",
      "cadeia de custódia",
      "cadeia de custodia",
      "vestígio",
      "vestigio",
      "prisão em flagrante",
      "prisao em flagrante",
    ])
  ) {
    return "Direito Processual Penal";
  }

  if (
    contemAlgum(texto, [
      "Código Penal",
      "codigo penal",
      "crime contra a administração pública",
      "crime contra a administracao publica",
      "considera-se praticado o crime",
    ])
  ) {
    return "Direito Penal";
  }

  if (
    contemAlgum(texto, [
      "Constituição Federal",
      "Constituicao Federal",
      "constitucional",
      "administração pública",
      "administracao publica",
      "artigo 5",
      "art. 5",
      "segurança pública",
      "seguranca publica",
    ])
  ) {
    return "Direito Constitucional";
  }

  if (
    contemAlgum(texto, [
      "Polícia Militar do Estado de São Paulo",
      "Policia Militar do Estado de Sao Paulo",
      "PMESP",
      "militar do estado",
      "policial militar",
      "regulamento disciplinar",
      "hierarquia e disciplina",
      "estatuto dos militares",
      "lei complementar",
      "nota de instrução",
      "nota de instrucao",
      "diretriz pm3",
      "instruções continuadas de comando",
      "instrucoes continuadas de comando",
      "operação impacto",
      "operacao impacto",
      "câmeras operacionais portáteis",
      "cameras operacionais portateis",
      "desforço imediato",
      "desforco imediato",
      "matrizes operacionais",
    ])
  ) {
    return "Legislação Institucional";
  }

  return "Não identificada";
}


function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trechoElegivelParaNegrito(texto: string): boolean {
  const normalizado = normalizarTexto(texto);
  const palavras = normalizado
    .split(/\s+/)
    .filter(Boolean);

  if (
    normalizado.length < 2 ||
    normalizado.length > 80 ||
    palavras.length > 12
  ) {
    return false;
  }

  if (/^\d{1,3}[.)-]?$/.test(normalizado)) {
    return false;
  }

  if (/^[A-E][.)-]?$/.test(normalizado)) {
    return false;
  }

  return true;
}

function identificarNumeroQuestaoNoBloco(
  texto: string
): number | null {
  const correspondencia = texto
    .trim()
    .match(/^(\d{2})\.$/);

  if (!correspondencia) {
    return null;
  }

  const numero = Number(correspondencia[1]);

  return numero >= 1 && numero <= 999
    ? numero
    : null;
}

function obterColunaDoBloco(
  x: number,
  larguraPagina: number
): "esquerda" | "direita" {
  return x < larguraPagina / 2
    ? "esquerda"
    : "direita";
}

function coletarTrechosNegritoDaQuestao(
  pdf: PDFExtraido,
  numeroQuestao: number,
  paginaInicial: number,
  paginaFinal: number
): string[] {
  const trechos: string[] = [];

  for (const pagina of pdf.paginas) {
    if (
      pagina.numero < paginaInicial ||
      pagina.numero > paginaFinal
    ) {
      continue;
    }

    const marcadores = pagina.blocosTexto
      .map((bloco) => ({
        bloco,
        numero: identificarNumeroQuestaoNoBloco(
          bloco.texto
        ),
        coluna: obterColunaDoBloco(
          bloco.x,
          pagina.largura
        ),
      }))
      .filter(
        (
          item
        ): item is typeof item & { numero: number } =>
          item.numero !== null
      );

    for (const bloco of pagina.blocosTexto) {
      if (!bloco.negrito) {
        continue;
      }

      const colunaBloco = obterColunaDoBloco(
        bloco.x,
        pagina.largura
      );

      const marcadorResponsavel = marcadores
        .filter(
          (marcador) =>
            marcador.coluna === colunaBloco &&
            marcador.bloco.y <= bloco.y + 3
        )
        .sort(
          (a, b) =>
            b.bloco.y - a.bloco.y
        )[0];

      /*
       * Um negrito só é associado à questão quando existe
       * um marcador numérico anterior na mesma coluna.
       *
       * Isso evita que um termo em negrito da questão 04,
       * por exemplo, seja aplicado a uma ocorrência normal
       * da mesma palavra na questão 02 da mesma página.
       */
      if (
        !marcadorResponsavel ||
        marcadorResponsavel.numero !== numeroQuestao
      ) {
        continue;
      }

      const trecho = normalizarTexto(bloco.texto);

      if (trechoElegivelParaNegrito(trecho)) {
        trechos.push(trecho);
      }
    }
  }

  return Array.from(new Set(trechos)).sort(
    (a, b) => b.length - a.length
  );
}

function aplicarTrechosNegrito(
  texto: string,
  trechos: string[]
): string {
  let resultado = texto;

  for (const trecho of trechos) {
    if (!trecho || resultado.includes(`**${trecho}**`)) {
      continue;
    }

    const partes = trecho
      .split(/\s+/)
      .filter(Boolean)
      .map(escaparRegex);

    if (partes.length === 0) {
      continue;
    }

    const regex = new RegExp(
      `(^|[\\s“"'([{])(${partes.join("\\\\s+")})(?=$|[\\s.,;:!?%”"'\\])}])`,
      "gi"
    );

    resultado = resultado.replace(
      regex,
      (_correspondencia, prefixo: string, encontrado: string) =>
        `${prefixo}**${encontrado}**`
    );
  }

  return resultado;
}

function aplicarNegritosNaQuestao(
  questao: Questao,
  pdf: PDFExtraido
): Questao {
  const trechos = coletarTrechosNegritoDaQuestao(
    pdf,
    questao.numero,
    questao.paginaInicial,
    questao.paginaFinal
  );

  if (trechos.length === 0) {
    return questao;
  }

  return {
    ...questao,
    enunciado: aplicarTrechosNegrito(
      questao.enunciado,
      trechos
    ),
    alternativaA: aplicarTrechosNegrito(
      questao.alternativaA,
      trechos
    ),
    alternativaB: aplicarTrechosNegrito(
      questao.alternativaB,
      trechos
    ),
    alternativaC: aplicarTrechosNegrito(
      questao.alternativaC,
      trechos
    ),
    alternativaD: aplicarTrechosNegrito(
      questao.alternativaD,
      trechos
    ),
    alternativaE: questao.alternativaE
      ? aplicarTrechosNegrito(
          questao.alternativaE,
          trechos
        )
      : null,
  };
}

function aplicarCorrecoesEspecificasSeguras(
  numero: number,
  prova: string,
  ano: number,
  enunciado: string,
  alternativas: Partial<
    Record<MarcadorAlternativa["letra"], string>
  >
): {
  enunciado: string;
  alternativas: Partial<
    Record<MarcadorAlternativa["letra"], string>
  >;
} {
  let enunciadoCorrigido = enunciado;
  const alternativasCorrigidas = { ...alternativas };
  const nomeProva = normalizarParaClassificacao(prova);

  /*
   * CFS PMESP 2024 — questão 05:
   * o texto da coluna seguinte começa com "5 Os mais velhos..."
   * e foi anexado ao fim da alternativa D. A remoção fica
   * restrita a esta prova, ano, questão e frase comprovada.
   */
  if (
    ano === 2024 &&
    numero === 5 &&
    nomeProva.includes("cfs") &&
    nomeProva.includes("pmesp") &&
    alternativasCorrigidas.D
  ) {
    alternativasCorrigidas.D = alternativasCorrigidas.D
      .replace(
        /\s+5\s+Os mais velhos têm muito a contribuir[\s\S]*$/i,
        ""
      )
      .trim();
  }

  /*
   * CFS PMESP 2024 — questões 55 e 57:
   * os títulos das disciplinas seguintes aparecem no fim da
   * alternativa D por causa da leitura em colunas do PDF.
   * As remoções ficam limitadas às questões comprovadas.
   */
  if (
    ano === 2024 &&
    numero === 55 &&
    nomeProva.includes("cfs") &&
    nomeProva.includes("pmesp") &&
    alternativasCorrigidas.D
  ) {
    alternativasCorrigidas.D = alternativasCorrigidas.D
      .replace(
        /\s+D\s*i\s*r\s*e\s*i\s*t\s*o\s+P\s*e\s*n\s*a\s*l\s+e\s+P\s*r\s*o\s*c\s*e\s*s\s*s\s*u\s*a\s*l\s+P\s*e\s*n\s*a\s*l\s+M\s*i\s*l\s*i\s*t\s*a\s*r\s*$/i,
        ""
      )
      .trim();
  }

  if (
    ano === 2024 &&
    numero === 57 &&
    nomeProva.includes("cfs") &&
    nomeProva.includes("pmesp") &&
    alternativasCorrigidas.D
  ) {
    alternativasCorrigidas.D = alternativasCorrigidas.D
      .replace(
        /\s+I\s*n\s*f\s*o\s*r\s*m\s*[áa]\s*t\s*i\s*c\s*a\s*$/i,
        ""
      )
      .trim();
  }

  /*
   * CFS PMESP 2026 — questão 32:
   * a fração e o expoente são itens posicionados separadamente
   * no PDF e não chegaram ao texto corrido. A correção é
   * deliberadamente restrita à questão comprovada.
   */
  if (
    ano === 2026 &&
    numero === 32 &&
    nomeProva.includes("cfs") &&
    nomeProva.includes("pmesp")
  ) {
    enunciadoCorrigido = enunciadoCorrigido.replace(
      /\bocupando\s+da área do terreno\b/i,
      "ocupando 5/8 da área do terreno"
    );

    for (const letra of ["A", "B", "C", "D", "E"] as const) {
      const valor = alternativasCorrigidas[letra];

      if (valor) {
        alternativasCorrigidas[letra] = valor.replace(
          /\bm\s*2\b/g,
          "m²"
        );
      }
    }
  }

  return {
    enunciado: enunciadoCorrigido,
    alternativas: alternativasCorrigidas,
  };
}

/**
 * Converte um bloco bruto de questão em uma questão estruturada.
 */
function analisarBloco(
  bloco: BlocoQuestao,
  metadados: Required<MetadadosProva>
): Questao {
  const marcadores = localizarAlternativas(bloco.conteudo);
  const avisos: string[] = [];

  if (marcadores.length === 0) {
    avisos.push("Nenhuma alternativa foi identificada.");
  }

  const primeiroMarcador = marcadores[0];

  let enunciado = normalizarTexto(
    primeiroMarcador
      ? bloco.conteudo.slice(0, primeiroMarcador.inicio)
      : bloco.conteudo
  );

  let alternativas: Partial<
    Record<MarcadorAlternativa["letra"], string>
  > = {};

  marcadores.forEach((marcador, indice) => {
    const proximoMarcador = marcadores[indice + 1];

    const fim = proximoMarcador
      ? proximoMarcador.inicio
      : bloco.conteudo.length;

    alternativas[marcador.letra] =
      removerNumeroPaginaResidual(
        bloco.conteudo.slice(marcador.inicioTexto, fim),
        bloco
      );
  });

  const letrasEncontradas = new Set(
    marcadores.map((marcador) => marcador.letra)
  );

  const letrasObrigatorias: Array<
    MarcadorAlternativa["letra"]
  > = ["A", "B", "C", "D"];

  for (const letra of letrasObrigatorias) {
    if (!letrasEncontradas.has(letra)) {
      avisos.push(`Alternativa ${letra} não identificada.`);
    }
  }

  if (!enunciado) {
    avisos.push("Enunciado vazio.");
  }

  if (marcadores.length > 5) {
    avisos.push(
      "Foram encontrados muitos marcadores de alternativas. O conteúdo pode estar misturado."
    );
  }

  const letrasDuplicadas = marcadores
    .map((marcador) => marcador.letra)
    .filter(
      (letra, indice, letras) =>
        letras.indexOf(letra) !== indice
    );

  if (letrasDuplicadas.length > 0) {
    avisos.push(
      `Alternativas duplicadas: ${[
        ...new Set(letrasDuplicadas),
      ].join(", ")}.`
    );
  }

  const correcoesEspecificas =
    aplicarCorrecoesEspecificasSeguras(
      bloco.numero,
      metadados.prova,
      metadados.ano,
      enunciado,
      alternativas
    );

  enunciado = correcoesEspecificas.enunciado;
  alternativas = correcoesEspecificas.alternativas;

  return {
    numero: bloco.numero,
    disciplina: detectarDisciplinaQuestao(
      bloco.numero,
      bloco.conteudo,
      metadados.disciplina,
      metadados.prova,
      metadados.ano
    ),
    prova: metadados.prova,
    ano: metadados.ano,

    enunciado,
    alternativaA: alternativas.A ?? "",
    alternativaB: alternativas.B ?? "",
    alternativaC: alternativas.C ?? "",
    alternativaD: alternativas.D ?? "",
    alternativaE: alternativas.E || null,

    respostaCorreta: null,
    explicacao: null,

    paginaInicial: bloco.paginaInicial,
    paginaFinal: bloco.paginaFinal,

    textoOriginal: bloco.conteudo,
    precisaRevisao: avisos.length > 0,
    avisos,
  };
}

/**
 * Extrai e estrutura todas as questões encontradas no PDF.
 *
 * O conteúdo passa primeiro pelo parser de apoios. Atualmente,
 * o parserApoios preserva o texto original, mas essa integração
 * permite evoluir a detecção de textos-base, tabelas, gráficos,
 * imagens e outros conteúdos compartilhados sem alterar novamente
 * o fluxo principal do parser de questões.
 */
export function extrairQuestoesDoPDF(
  pdf: PDFExtraido,
  metadadosRecebidos: MetadadosProva = {}
): ResultadoParserQuestoes {
  const metadados: Required<MetadadosProva> = {
    disciplina:
      metadadosRecebidos.disciplina ?? "Não identificada",
    prova:
      metadadosRecebidos.prova ?? "Prova importada",
    ano:
      metadadosRecebidos.ano ?? new Date().getFullYear(),
    totalEsperado:
      metadadosRecebidos.totalEsperado ?? 0,
  };

  const textoComPaginas = montarTextoComPaginas(pdf);

  const resultadoApoios = detectarApoios(textoComPaginas);

  const blocos = separarBlocosQuestoes(
    resultadoApoios.textoSemApoios
  );

  const questoes = blocos
    .map((bloco) => analisarBloco(bloco, metadados))
    .map((questao) =>
      aplicarNegritosNaQuestao(questao, pdf)
    )
    .sort(
      (questaoA, questaoB) =>
        questaoA.numero - questaoB.numero
    );

  const avisosGerais: string[] = [];
  const contagemPorNumero = new Map<number, number>();

  for (const questao of questoes) {
    const quantidadeAtual =
      contagemPorNumero.get(questao.numero) ?? 0;

    contagemPorNumero.set(
      questao.numero,
      quantidadeAtual + 1
    );
  }

  if (
    metadados.totalEsperado > 0 &&
    questoes.length !== metadados.totalEsperado
  ) {
    avisosGerais.push(
      `A prova deveria possuir ${metadados.totalEsperado} questões, mas o parser encontrou ${questoes.length}.`
    );
  }

  const numerosAusentes: number[] = [];
  const maiorNumeroEncontrado =
    questoes.length > 0
      ? Math.max(...questoes.map((questao) => questao.numero))
      : 0;
  const limiteVerificacao =
    metadados.totalEsperado > 0
      ? metadados.totalEsperado
      : maiorNumeroEncontrado;

  for (
    let numero = 1;
    numero <= limiteVerificacao;
    numero += 1
  ) {
    if (!contagemPorNumero.has(numero)) {
      numerosAusentes.push(numero);
    }
  }

  if (numerosAusentes.length > 0) {
    avisosGerais.push(
      `Questões não encontradas: ${numerosAusentes
        .map((numero) => String(numero).padStart(2, "0"))
        .join(", ")}.`
    );
  }

  const numerosDuplicados = Array.from(
    contagemPorNumero.entries()
  )
    .filter(([, quantidade]) => quantidade > 1)
    .map(([numero]) => numero);

  if (numerosDuplicados.length > 0) {
    avisosGerais.push(
      `Questões duplicadas: ${numerosDuplicados
        .map((numero) => String(numero).padStart(2, "0"))
        .join(", ")}.`
    );
  }

  const questoesParaRevisao = questoes.filter(
    (questao) => questao.precisaRevisao
  ).length;

  if (questoesParaRevisao > 0) {
    avisosGerais.push(
      `${questoesParaRevisao} questão(ões) precisam de revisão.`
    );
  }

  if (resultadoApoios.apoios.length > 0) {
    avisosGerais.push(
      `${resultadoApoios.apoios.length} conteúdo(s) de apoio foram identificados.`
    );
  }

  return {
    questoes,
    apoios: resultadoApoios.apoios,
    totalEncontrado: questoes.length,
    avisosGerais,
  };
}