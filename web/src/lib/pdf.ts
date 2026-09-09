import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.mjs",
  import.meta.url
).toString();

export type BlocoTextoPDF = {
  texto: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  fonte: string | null;
  negrito: boolean;
  quebraLinha: boolean;
};

export type PaginaExtraida = {
  numero: number;
  texto: string;
  largura: number;
  altura: number;
  imagemDataUrl: string;
  imagemLargura: number;
  imagemAltura: number;
  blocosTexto: BlocoTextoPDF[];
};

export type PDFExtraido = {
  totalPaginas: number;
  textoCompleto: string;
  paginas: PaginaExtraida[];
};

type ItemTexto = {
  str: string;
  hasEOL?: boolean;
  width?: number;
  height?: number;
  fontName?: string;
  transform?: number[];
};

type EstiloFontePDF = {
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
};

type EstatisticaFonte = {
  itens: number;
  caracteres: number;
  larguraTotal: number;
  alturaTotal: number;
};

type CanvasCriado = {
  canvas: HTMLCanvasElement;
  contexto: CanvasRenderingContext2D;
};

type Retangulo = {
  x: number;
  y: number;
  largura: number;
  altura: number;
};

type ComponenteVisual = Retangulo & {
  quantidade: number;
  densidade: number;
  area: number;
};

type GrupoVisual = Retangulo & {
  componentes: ComponenteVisual[];
  pontuacao: number;
};

const ESCALA_RENDERIZACAO = 2;
const QUALIDADE_JPEG = 0.9;
const LIMIAR_BRANCO = 246;
const PASSO_ANALISE = 4;
const PADDING_TEXTO = 5;
const PADDING_RECORTE = 18;
const AREA_MINIMA = 1400;
const DIMENSAO_MINIMA = 34;
const DENSIDADE_MINIMA = 0.03;
const DISTANCIA_MAXIMA_AGRUPAMENTO = 42;
const COBERTURA_MAXIMA_PAGINA = 0.72;
const PROPORCAO_EXTREMA = 14;
const DISTANCIA_TEXTO_DIAGRAMA = 150;
const TAMANHO_MAXIMO_ROTULO = 48;
const PADDING_ROTULO = 18;

function possuiTexto(item: unknown): item is ItemTexto {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as ItemTexto).str === "string"
  );
}

function numeroSeguro(valor: unknown, padrao = 0): number {
  return typeof valor === "number" && Number.isFinite(valor)
    ? valor
    : padrao;
}

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

function organizarTexto(items: unknown[]): string {
  let texto = "";

  for (const item of items) {
    if (!possuiTexto(item)) continue;

    const trecho = item.str.trim();
    if (trecho) texto += trecho;

    if (item.hasEOL) texto += "\n";
    else if (trecho) texto += " ";
  }

  return texto
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}


function normalizarTextoFonte(valor: unknown): string {
  return typeof valor === "string"
    ? valor
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function estiloIndicaNegrito(
  nomeFonte: string | null,
  estilo: EstiloFontePDF | undefined
): boolean {
  const peso = estilo?.fontWeight;

  if (
    typeof peso === "number" &&
    Number.isFinite(peso) &&
    peso >= 600
  ) {
    return true;
  }

  if (
    typeof peso === "string" &&
    (
      /\b(6|7|8|9)00\b/.test(peso) ||
      /\b(bold|semibold|demibold|black|heavy)\b/i.test(peso)
    )
  ) {
    return true;
  }

  const descricao = normalizarTextoFonte(
    [
      nomeFonte,
      estilo?.fontFamily,
      estilo?.fontStyle,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return /\b(bold|semibold|demibold|black|heavy)\b/.test(
    descricao
  );
}

function calcularEstatisticasFontes(
  items: unknown[]
): Map<string, EstatisticaFonte> {
  const estatisticas = new Map<string, EstatisticaFonte>();

  for (const item of items) {
    if (!possuiTexto(item)) {
      continue;
    }

    const nomeFonte =
      typeof item.fontName === "string"
        ? item.fontName
        : "";

    const texto = item.str.trim();

    if (!nomeFonte || !texto) {
      continue;
    }

    const atual = estatisticas.get(nomeFonte) ?? {
      itens: 0,
      caracteres: 0,
      larguraTotal: 0,
      alturaTotal: 0,
    };

    atual.itens += 1;
    atual.caracteres += texto.length;
    atual.larguraTotal += Math.abs(
      numeroSeguro(item.width, 0)
    );
    atual.alturaTotal += Math.abs(
      numeroSeguro(
        item.height,
        Array.isArray(item.transform)
          ? numeroSeguro(item.transform[3], 0)
          : 0
      )
    );

    estatisticas.set(nomeFonte, atual);
  }

  return estatisticas;
}

function obterIndiceNumericoFonte(
  nomeFonte: string
): number | null {
  const correspondencia = nomeFonte.match(/(\d+)$/);

  if (!correspondencia) {
    return null;
  }

  const numero = Number(correspondencia[1]);

  return Number.isFinite(numero) ? numero : null;
}

function obterFamiliaFonteNormalizada(
  nomeFonte: string,
  estilo: EstiloFontePDF | undefined
): string {
  return normalizarTextoFonte(
    [
      estilo?.fontFamily,
      estilo?.fontStyle,
      nomeFonte.replace(/\d+$/g, ""),
    ]
      .filter(Boolean)
      .join(" ")
  )
    .replace(
      /\b(bold|semibold|demibold|black|heavy|regular|normal|italic|oblique)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function inferirFontesNegrito(
  items: unknown[],
  estilos: Record<string, EstiloFontePDF>
): Set<string> {
  const resultado = new Set<string>();
  const estatisticas = calcularEstatisticasFontes(items);

  for (const nomeFonte of estatisticas.keys()) {
    if (estiloIndicaNegrito(nomeFonte, estilos[nomeFonte])) {
      resultado.add(nomeFonte);
    }
  }

  const fontes = Array.from(estatisticas.entries());

  for (const [nomeCandidata, candidata] of fontes) {
    if (resultado.has(nomeCandidata)) {
      continue;
    }

    const larguraMediaCandidata =
      candidata.larguraTotal /
      Math.max(1, candidata.caracteres);

    const alturaMediaCandidata =
      candidata.alturaTotal /
      Math.max(1, candidata.itens);

    const familiaCandidata = obterFamiliaFonteNormalizada(
      nomeCandidata,
      estilos[nomeCandidata]
    );

    for (const [nomeBase, base] of fontes) {
      if (
        nomeBase === nomeCandidata ||
        resultado.has(nomeBase)
      ) {
        continue;
      }

      const larguraMediaBase =
        base.larguraTotal /
        Math.max(1, base.caracteres);

      const alturaMediaBase =
        base.alturaTotal /
        Math.max(1, base.itens);

      const familiaBase = obterFamiliaFonteNormalizada(
        nomeBase,
        estilos[nomeBase]
      );

      const mesmaFamilia =
        familiaCandidata === familiaBase ||
        !familiaCandidata ||
        !familiaBase;

      const proporcaoAltura =
        alturaMediaBase > 0
          ? alturaMediaCandidata / alturaMediaBase
          : 0;

      const proporcaoLargura =
        larguraMediaBase > 0
          ? larguraMediaCandidata / larguraMediaBase
          : 0;

      const candidataMenosFrequente =
        candidata.caracteres <=
          base.caracteres * 0.9 &&
        candidata.itens <=
          Math.max(base.itens, 2);

      const mesmaFaixaAltura =
        proporcaoAltura >= 0.94 &&
        proporcaoAltura <= 1.06;

      const discretamenteMaisLarga =
        proporcaoLargura >= 1.015 &&
        proporcaoLargura <= 1.45;

      if (
        mesmaFamilia &&
        candidataMenosFrequente &&
        mesmaFaixaAltura &&
        discretamenteMaisLarga
      ) {
        resultado.add(nomeCandidata);
        break;
      }
    }
  }

  let alterou = true;

  while (alterou) {
    alterou = false;

    for (const [nomeCandidata, candidata] of fontes) {
      if (resultado.has(nomeCandidata)) {
        continue;
      }

      const larguraMediaCandidata =
        candidata.larguraTotal /
        Math.max(1, candidata.caracteres);

      const alturaMediaCandidata =
        candidata.alturaTotal /
        Math.max(1, candidata.itens);

      const familiaCandidata = obterFamiliaFonteNormalizada(
        nomeCandidata,
        estilos[nomeCandidata]
      );

      for (const nomeNegrito of resultado) {
        const negrito = estatisticas.get(nomeNegrito);

        if (!negrito) {
          continue;
        }

        const larguraMediaNegrito =
          negrito.larguraTotal /
          Math.max(1, negrito.caracteres);

        const alturaMediaNegrito =
          negrito.alturaTotal /
          Math.max(1, negrito.itens);

        const familiaNegrito = obterFamiliaFonteNormalizada(
          nomeNegrito,
          estilos[nomeNegrito]
        );

        const mesmaFamilia =
          familiaCandidata === familiaNegrito ||
          !familiaCandidata ||
          !familiaNegrito;

        const proporcaoAltura =
          alturaMediaNegrito > 0
            ? alturaMediaCandidata / alturaMediaNegrito
            : 0;

        const proporcaoLargura =
          larguraMediaNegrito > 0
            ? larguraMediaCandidata / larguraMediaNegrito
            : 0;

        if (
          mesmaFamilia &&
          proporcaoAltura >= 0.97 &&
          proporcaoAltura <= 1.03 &&
          proporcaoLargura >= 0.97 &&
          proporcaoLargura <= 1.03
        ) {
          resultado.add(nomeCandidata);
          alterou = true;
          break;
        }
      }
    }
  }

  return resultado;
}

function extrairBlocosTexto(
  items: unknown[],
  alturaPagina: number,
  estilos: Record<string, EstiloFontePDF>
): BlocoTextoPDF[] {
  const blocos: BlocoTextoPDF[] = [];
  const fontesNegrito = inferirFontesNegrito(
    items,
    estilos
  );

  for (const item of items) {
    if (!possuiTexto(item)) continue;

    const texto = item.str.trim();
    if (!texto) continue;

    const transform = Array.isArray(item.transform)
      ? item.transform
      : [];

    const x = numeroSeguro(transform[4]);
    const yBase = numeroSeguro(transform[5]);
    const altura = Math.max(
      1,
      Math.abs(
        numeroSeguro(item.height, numeroSeguro(transform[3], 10))
      )
    );
    const largura = Math.max(
      1,
      Math.abs(numeroSeguro(item.width, texto.length * 5))
    );

    blocos.push({
      texto,
      x,
      y: Math.max(0, alturaPagina - yBase - altura),
      largura,
      altura,
      fonte:
        typeof item.fontName === "string" ? item.fontName : null,
      negrito:
        typeof item.fontName === "string" &&
        fontesNegrito.has(item.fontName),
      quebraLinha: Boolean(item.hasEOL),
    });
  }

  return blocos;
}

function criarCanvas(largura: number, altura: number): CanvasCriado {
  if (typeof document === "undefined") {
    throw new Error(
      "A renderização visual do PDF precisa ser executada no navegador."
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(largura));
  canvas.height = Math.max(1, Math.ceil(altura));

  const contexto = canvas.getContext("2d", {
    alpha: false,
    willReadFrequently: true,
  });

  if (!contexto) {
    throw new Error(
      "Não foi possível preparar a área de renderização do PDF."
    );
  }

  contexto.fillStyle = "#ffffff";
  contexto.fillRect(0, 0, canvas.width, canvas.height);

  return { canvas, contexto };
}

function apagarTexto(
  contexto: CanvasRenderingContext2D,
  blocos: BlocoTextoPDF[],
  escala: number,
  larguraCanvas: number,
  alturaCanvas: number
): void {
  contexto.save();
  contexto.fillStyle = "#ffffff";

  for (const bloco of blocos) {
    const x = limitar(
      Math.floor(bloco.x * escala) - PADDING_TEXTO,
      0,
      larguraCanvas
    );
    const y = limitar(
      Math.floor(bloco.y * escala) - PADDING_TEXTO,
      0,
      alturaCanvas
    );
    const largura = limitar(
      Math.ceil(bloco.largura * escala) + PADDING_TEXTO * 2,
      1,
      larguraCanvas - x
    );
    const altura = limitar(
      Math.ceil(bloco.altura * escala) + PADDING_TEXTO * 2,
      1,
      alturaCanvas - y
    );

    contexto.fillRect(x, y, largura, altura);
  }

  contexto.restore();
}

function pixelEscuro(
  pixels: Uint8ClampedArray,
  indice: number
): boolean {
  return (
    pixels[indice] < LIMIAR_BRANCO ||
    pixels[indice + 1] < LIMIAR_BRANCO ||
    pixels[indice + 2] < LIMIAR_BRANCO
  );
}

function distanciaEntreRetangulos(
  a: Retangulo,
  b: Retangulo
): number {
  const distanciaX = Math.max(
    0,
    Math.max(a.x, b.x) -
      Math.min(a.x + a.largura, b.x + b.largura)
  );
  const distanciaY = Math.max(
    0,
    Math.max(a.y, b.y) -
      Math.min(a.y + a.altura, b.y + b.altura)
  );

  return Math.hypot(distanciaX, distanciaY);
}

function unirRetangulos(
  retangulos: Retangulo[]
): Retangulo {
  const minX = Math.min(...retangulos.map((item) => item.x));
  const minY = Math.min(...retangulos.map((item) => item.y));
  const maxX = Math.max(
    ...retangulos.map((item) => item.x + item.largura)
  );
  const maxY = Math.max(
    ...retangulos.map((item) => item.y + item.altura)
  );

  return {
    x: minX,
    y: minY,
    largura: maxX - minX,
    altura: maxY - minY,
  };
}

function componentePareceLinha(
  componente: ComponenteVisual
): boolean {
  const maior = Math.max(
    componente.largura,
    componente.altura
  );
  const menor = Math.max(
    1,
    Math.min(componente.largura, componente.altura)
  );

  return maior / menor >= PROPORCAO_EXTREMA;
}

function pontuarGrupo(
  grupo: Retangulo,
  componentes: ComponenteVisual[],
  larguraPagina: number,
  alturaPagina: number
): number {
  const areaGrupo = grupo.largura * grupo.altura;
  const areaPagina = larguraPagina * alturaPagina;
  const cobertura = areaPagina > 0
    ? areaGrupo / areaPagina
    : 1;

  const areaConteudo = componentes.reduce(
    (soma, componente) => soma + componente.area,
    0
  );
  const densidadeMedia = componentes.reduce(
    (soma, componente) =>
      soma + componente.densidade * componente.area,
    0
  ) / Math.max(1, areaConteudo);

  const penalidadeEspacoVazio =
    areaGrupo > 0
      ? areaConteudo / areaGrupo
      : 0;

  const penalidadeCobertura =
    cobertura > COBERTURA_MAXIMA_PAGINA
      ? 0.15
      : 1;

  return (
    areaConteudo *
    Math.max(0.05, densidadeMedia) *
    Math.max(0.1, penalidadeEspacoVazio) *
    penalidadeCobertura
  );
}

function localizarComponentesVisuais(
  contexto: CanvasRenderingContext2D,
  largura: number,
  altura: number
): ComponenteVisual[] {
  const dados = contexto.getImageData(0, 0, largura, altura).data;
  const gradeLargura = Math.ceil(largura / PASSO_ANALISE);
  const gradeAltura = Math.ceil(altura / PASSO_ANALISE);
  const ativo = new Uint8Array(gradeLargura * gradeAltura);
  const visitado = new Uint8Array(ativo.length);

  for (let gy = 0; gy < gradeAltura; gy += 1) {
    for (let gx = 0; gx < gradeLargura; gx += 1) {
      let encontrou = false;

      for (
        let dy = 0;
        dy < PASSO_ANALISE && !encontrou;
        dy += 1
      ) {
        const y = gy * PASSO_ANALISE + dy;

        if (y >= altura) {
          break;
        }

        for (let dx = 0; dx < PASSO_ANALISE; dx += 1) {
          const x = gx * PASSO_ANALISE + dx;

          if (x >= largura) {
            break;
          }

          if (pixelEscuro(dados, (y * largura + x) * 4)) {
            encontrou = true;
            break;
          }
        }
      }

      if (encontrou) {
        ativo[gy * gradeLargura + gx] = 1;
      }
    }
  }

  const componentes: ComponenteVisual[] = [];
  const fila: number[] = [];

  for (let gy = 0; gy < gradeAltura; gy += 1) {
    for (let gx = 0; gx < gradeLargura; gx += 1) {
      const inicio = gy * gradeLargura + gx;

      if (!ativo[inicio] || visitado[inicio]) {
        continue;
      }

      fila.length = 0;
      fila.push(inicio);
      visitado[inicio] = 1;

      let cursor = 0;
      let minX = gx;
      let maxX = gx;
      let minY = gy;
      let maxY = gy;
      let quantidade = 0;

      while (cursor < fila.length) {
        const atual = fila[cursor];
        cursor += 1;

        const atualX = atual % gradeLargura;
        const atualY = Math.floor(atual / gradeLargura);
        quantidade += 1;

        minX = Math.min(minX, atualX);
        maxX = Math.max(maxX, atualX);
        minY = Math.min(minY, atualY);
        maxY = Math.max(maxY, atualY);

        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) {
              continue;
            }

            const nx = atualX + ox;
            const ny = atualY + oy;

            if (
              nx < 0 ||
              ny < 0 ||
              nx >= gradeLargura ||
              ny >= gradeAltura
            ) {
              continue;
            }

            const vizinho = ny * gradeLargura + nx;

            if (ativo[vizinho] && !visitado[vizinho]) {
              visitado[vizinho] = 1;
              fila.push(vizinho);
            }
          }
        }
      }

      const x = minX * PASSO_ANALISE;
      const y = minY * PASSO_ANALISE;
      const larguraComponente = Math.min(
        largura - x,
        (maxX - minX + 1) * PASSO_ANALISE
      );
      const alturaComponente = Math.min(
        altura - y,
        (maxY - minY + 1) * PASSO_ANALISE
      );
      const area = larguraComponente * alturaComponente;
      const densidade =
        area > 0
          ? (
              quantidade *
              PASSO_ANALISE *
              PASSO_ANALISE
            ) / area
          : 0;

      const componente: ComponenteVisual = {
        x,
        y,
        largura: larguraComponente,
        altura: alturaComponente,
        quantidade,
        densidade,
        area,
      };

      if (
        area >= AREA_MINIMA &&
        larguraComponente >= DIMENSAO_MINIMA &&
        alturaComponente >= DIMENSAO_MINIMA &&
        densidade >= DENSIDADE_MINIMA &&
        !componentePareceLinha(componente)
      ) {
        componentes.push(componente);
      }
    }
  }

  return componentes;
}

function agruparComponentes(
  componentes: ComponenteVisual[],
  larguraPagina: number,
  alturaPagina: number
): GrupoVisual[] {
  const restantes = new Set(
    componentes.map((_, indice) => indice)
  );
  const grupos: GrupoVisual[] = [];

  while (restantes.size > 0) {
    const primeiro = restantes.values().next().value as number;
    restantes.delete(primeiro);

    const indicesGrupo = [primeiro];
    let alterou = true;

    while (alterou) {
      alterou = false;
      const retanguloAtual = unirRetangulos(
        indicesGrupo.map((indice) => componentes[indice])
      );

      for (const indice of [...restantes]) {
        const distancia = distanciaEntreRetangulos(
          retanguloAtual,
          componentes[indice]
        );

        if (distancia <= DISTANCIA_MAXIMA_AGRUPAMENTO) {
          indicesGrupo.push(indice);
          restantes.delete(indice);
          alterou = true;
        }
      }
    }

    const componentesGrupo = indicesGrupo.map(
      (indice) => componentes[indice]
    );
    const retangulo = unirRetangulos(componentesGrupo);

    grupos.push({
      ...retangulo,
      componentes: componentesGrupo,
      pontuacao: pontuarGrupo(
        retangulo,
        componentesGrupo,
        larguraPagina,
        alturaPagina
      ),
    });
  }

  return grupos.sort(
    (a, b) => b.pontuacao - a.pontuacao
  );
}

function distanciaTextoAoRecorte(
  texto: Retangulo,
  recorte: Retangulo
): number {
  return distanciaEntreRetangulos(texto, recorte);
}

function expandirRecorteComRotulos(
  recorte: Retangulo,
  blocosTexto: BlocoTextoPDF[],
  escala: number,
  larguraPagina: number,
  alturaPagina: number
): Retangulo {
  const rotulosProximos = blocosTexto
    .filter((bloco) => {
      const texto = bloco.texto.trim();

      if (
        !texto ||
        texto.length > TAMANHO_MAXIMO_ROTULO
      ) {
        return false;
      }

      const retanguloTexto: Retangulo = {
        x: bloco.x * escala,
        y: bloco.y * escala,
        largura: Math.max(1, bloco.largura * escala),
        altura: Math.max(1, bloco.altura * escala),
      };

      return (
        distanciaTextoAoRecorte(
          retanguloTexto,
          recorte
        ) <= DISTANCIA_TEXTO_DIAGRAMA
      );
    })
    .map((bloco) => ({
      x: bloco.x * escala,
      y: bloco.y * escala,
      largura: Math.max(1, bloco.largura * escala),
      altura: Math.max(1, bloco.altura * escala),
    }));

  if (rotulosProximos.length === 0) {
    return recorte;
  }

  const unido = unirRetangulos([
    recorte,
    ...rotulosProximos,
  ]);

  const x = limitar(
    unido.x - PADDING_ROTULO,
    0,
    larguraPagina
  );
  const y = limitar(
    unido.y - PADDING_ROTULO,
    0,
    alturaPagina
  );

  return {
    x,
    y,
    largura: limitar(
      unido.largura + PADDING_ROTULO * 2,
      1,
      larguraPagina - x
    ),
    altura: limitar(
      unido.altura + PADDING_ROTULO * 2,
      1,
      alturaPagina - y
    ),
  };
}

function localizarRecorteVisual(
  contexto: CanvasRenderingContext2D,
  largura: number,
  altura: number,
  blocosTexto: BlocoTextoPDF[]
): Retangulo | null {
  const componentes = localizarComponentesVisuais(
    contexto,
    largura,
    altura
  );

  if (componentes.length === 0) {
    return null;
  }

  const grupos = agruparComponentes(
    componentes,
    largura,
    altura
  );
  const melhorGrupo = grupos[0];

  if (!melhorGrupo || melhorGrupo.pontuacao <= 0) {
    return null;
  }

  const x = limitar(
    melhorGrupo.x - PADDING_RECORTE,
    0,
    largura
  );
  const y = limitar(
    melhorGrupo.y - PADDING_RECORTE,
    0,
    altura
  );

  const recorteBase: Retangulo = {
    x,
    y,
    largura: limitar(
      melhorGrupo.largura + PADDING_RECORTE * 2,
      1,
      largura - x
    ),
    altura: limitar(
      melhorGrupo.altura + PADDING_RECORTE * 2,
      1,
      altura - y
    ),
  };

  return expandirRecorteComRotulos(
    recorteBase,
    blocosTexto,
    ESCALA_RENDERIZACAO,
    largura,
    altura
  );
}

function recortarCanvas(
  origem: HTMLCanvasElement,
  recorte: Retangulo
): HTMLCanvasElement {
  const { canvas, contexto } = criarCanvas(
    recorte.largura,
    recorte.altura
  );

  contexto.drawImage(
    origem,
    recorte.x,
    recorte.y,
    recorte.largura,
    recorte.altura,
    0,
    0,
    recorte.largura,
    recorte.altura
  );

  return canvas;
}

type PDFDocumentProxyLike = Awaited<
  ReturnType<typeof pdfjs.getDocument>
>["promise"] extends Promise<infer T>
  ? T
  : never;


function ehPaginaFinalCFS2024ComDuasImagens(
  blocosTexto: BlocoTextoPDF[]
): boolean {
  const texto = blocosTexto
    .map((bloco) => bloco.texto)
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const possuiWord =
    texto.includes("microsoft word 2016");

  const possuiExcel =
    texto.includes("microsoft excel 2016");

  const possuiQuestao58 =
    /(^|[^0-9])58[.)-]/.test(texto);

  const possuiQuestao59 =
    /(^|[^0-9])59[.)-]/.test(texto);

  return (
    possuiWord &&
    possuiExcel &&
    possuiQuestao58 &&
    possuiQuestao59
  );
}

async function renderizarPaginaComoImagem(
  pagina: Awaited<ReturnType<PDFDocumentProxyLike["getPage"]>>,
  blocosTexto: BlocoTextoPDF[]
): Promise<{
  dataUrl: string;
  largura: number;
  altura: number;
}> {
  const viewport = pagina.getViewport({
    scale: ESCALA_RENDERIZACAO,
  });

  const {
    canvas: canvasOriginal,
    contexto: contextoOriginal,
  } = criarCanvas(viewport.width, viewport.height);

  await pagina.render({
    canvas: canvasOriginal,
    canvasContext: contextoOriginal,
    viewport,
  }).promise;

  /*
   * Exceção dedicada à página final da prova CFS PMESP 2024.
   *
   * Essa página contém duas imagens independentes:
   * - questão 58: captura do Word, na coluna esquerda;
   * - questão 59: planilha do Excel, na coluna direita.
   *
   * O processamento visual geral seleciona apenas o grupo
   * visual de maior pontuação e, por isso, descarta uma das
   * duas imagens antes de o parserImagens.ts receber a página.
   *
   * Somente nesse caso preservamos a página renderizada inteira.
   * O parserImagens.ts fará depois os dois recortes dedicados.
   */
  if (ehPaginaFinalCFS2024ComDuasImagens(blocosTexto)) {
    const dataUrl = canvasOriginal.toDataURL(
      "image/jpeg",
      QUALIDADE_JPEG
    );
    const largura = canvasOriginal.width;
    const altura = canvasOriginal.height;

    canvasOriginal.width = 1;
    canvasOriginal.height = 1;

    return {
      dataUrl,
      largura,
      altura,
    };
  }

  /*
   * O canvas de análise é uma cópia temporária usada apenas para
   * localizar a região visual. O texto é apagado somente nessa cópia.
   *
   * O recorte final é feito no canvas original, preservando:
   * - textos dentro de tabelas;
   * - valores e cabeçalhos;
   * - letras e medidas de figuras geométricas;
   * - legendas de gráficos, mapas e diagramas;
   * - falas e textos de tirinhas.
   */
  const {
    canvas: canvasAnalise,
    contexto: contextoAnalise,
  } = criarCanvas(viewport.width, viewport.height);

  contextoAnalise.drawImage(canvasOriginal, 0, 0);

  apagarTexto(
    contextoAnalise,
    blocosTexto,
    ESCALA_RENDERIZACAO,
    canvasAnalise.width,
    canvasAnalise.height
  );

  const recorte = localizarRecorteVisual(
    contextoAnalise,
    canvasAnalise.width,
    canvasAnalise.height,
    blocosTexto
  );

  if (!recorte) {
    canvasOriginal.width = 1;
    canvasOriginal.height = 1;
    canvasAnalise.width = 1;
    canvasAnalise.height = 1;

    return {
      dataUrl: "",
      largura: 0,
      altura: 0,
    };
  }

  const canvasRecortado = recortarCanvas(
    canvasOriginal,
    recorte
  );

  const dataUrl = canvasRecortado.toDataURL(
    "image/jpeg",
    QUALIDADE_JPEG
  );
  const largura = canvasRecortado.width;
  const altura = canvasRecortado.height;

  canvasOriginal.width = 1;
  canvasOriginal.height = 1;
  canvasAnalise.width = 1;
  canvasAnalise.height = 1;
  canvasRecortado.width = 1;
  canvasRecortado.height = 1;

  return {
    dataUrl,
    largura,
    altura,
  };
}

export async function extrairTextoPDF(
  arquivo: File
): Promise<PDFExtraido> {
  if (!arquivo) {
    throw new Error("Nenhum arquivo foi informado.");
  }

  const ehPDF =
    arquivo.type === "application/pdf" ||
    arquivo.name.toLowerCase().endsWith(".pdf");

  if (!ehPDF) {
    throw new Error("O arquivo selecionado não é um PDF.");
  }

  const buffer = await arquivo.arrayBuffer();
  const tarefaCarregamento = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
  });

  const documento = await tarefaCarregamento.promise;
  const paginas: PaginaExtraida[] = [];

  try {
    for (
      let numero = 1;
      numero <= documento.numPages;
      numero += 1
    ) {
      const pagina = await documento.getPage(numero);

      try {
        const conteudo = await pagina.getTextContent();
        const viewport = pagina.getViewport({ scale: 1 });
        const blocosTexto = extrairBlocosTexto(
          conteudo.items,
          viewport.height,
          conteudo.styles as Record<string, EstiloFontePDF>
        );
        const imagem = await renderizarPaginaComoImagem(
          pagina,
          blocosTexto
        );

        paginas.push({
          numero,
          texto: organizarTexto(conteudo.items),
          largura: viewport.width,
          altura: viewport.height,
          imagemDataUrl: imagem.dataUrl,
          imagemLargura: imagem.largura,
          imagemAltura: imagem.altura,
          blocosTexto,
        });
      } finally {
        pagina.cleanup();
      }
    }
  } finally {
    await tarefaCarregamento.destroy();
  }

  const textoCompleto = paginas
    .map(
      (pagina) =>
        `--- PÁGINA ${pagina.numero} ---\n${pagina.texto}`
    )
    .join("\n\n");

  return {
    totalPaginas: paginas.length,
    textoCompleto,
    paginas,
  };
}