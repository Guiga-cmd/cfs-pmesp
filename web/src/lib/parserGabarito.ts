import type { PDFExtraido } from "@/lib/pdf";
import type { Questao } from "@/types/questao";

export type LetraGabarito = "A" | "B" | "C" | "D" | "E";

export interface RespostaGabarito {
  numero: number;
  resposta: LetraGabarito;
}

export interface ResultadoParserGabarito {
  respostas: RespostaGabarito[];
  totalEncontrado: number;
  numerosAusentes: number[];
  numerosDuplicados: number[];
  avisos: string[];
}

function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00ad/g, "")
    .replace(/\uFFFD/g, "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function adicionarResposta(
  respostas: Map<number, LetraGabarito>,
  duplicados: Set<number>,
  numero: number,
  resposta: string
): void {
  if (numero < 1 || numero > 60) {
    return;
  }

  const letra = resposta.toUpperCase();

  if (!/^[A-E]$/.test(letra)) {
    return;
  }

  if (respostas.has(numero)) {
    if (respostas.get(numero) !== letra) {
      duplicados.add(numero);
    }

    return;
  }

  respostas.set(numero, letra as LetraGabarito);
}

function extrairPorPares(
  texto: string,
  respostas: Map<number, LetraGabarito>,
  duplicados: Set<number>
): void {
  const regex =
    /(?:^|[\s|;,:-])(\d{1,2})\s*(?:[.)\-–—:]|\s)\s*\(?([A-E])\)?(?=$|[\s|;,.])/gim;

  let resultado: RegExpExecArray | null;

  while ((resultado = regex.exec(texto)) !== null) {
    adicionarResposta(
      respostas,
      duplicados,
      Number(resultado[1]),
      resultado[2]
    );
  }
}

function extrairPorLinhasDeTabela(
  texto: string,
  respostas: Map<number, LetraGabarito>,
  duplicados: Set<number>
): void {
  const linhas = texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  for (const linha of linhas) {
    const numeros = Array.from(
      linha.matchAll(/\b(?:[1-9]|[1-5]\d|60)\b/g)
    ).map((item) => Number(item[0]));

    const letras = Array.from(
      linha.matchAll(/\b[A-E]\b/gi)
    ).map((item) => item[0].toUpperCase());

    if (
      numeros.length >= 2 &&
      numeros.length === letras.length
    ) {
      numeros.forEach((numero, indice) => {
        adicionarResposta(
          respostas,
          duplicados,
          numero,
          letras[indice]
        );
      });
    }
  }
}

function extrairPorSequencia(
  texto: string,
  respostas: Map<number, LetraGabarito>,
  duplicados: Set<number>
): void {
  const linhas = texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean);

  for (let indice = 0; indice < linhas.length - 1; indice += 1) {
    const numeros = Array.from(
      linhas[indice].matchAll(/\b(?:[1-9]|[1-5]\d|60)\b/g)
    ).map((item) => Number(item[0]));

    const letras = Array.from(
      linhas[indice + 1].matchAll(/\b[A-E]\b/gi)
    ).map((item) => item[0].toUpperCase());

    if (
      numeros.length >= 4 &&
      numeros.length === letras.length
    ) {
      numeros.forEach((numero, posicao) => {
        adicionarResposta(
          respostas,
          duplicados,
          numero,
          letras[posicao]
        );
      });
    }
  }
}

function textoDoPDF(pdf: PDFExtraido): string {
  return pdf.paginas
    .map((pagina) => pagina.texto)
    .join("\n");
}

export function extrairGabarito(
  origem: PDFExtraido | string
): ResultadoParserGabarito {
  const textoBruto =
    typeof origem === "string"
      ? origem
      : textoDoPDF(origem);

  const texto = normalizarTexto(textoBruto);
  const respostas = new Map<number, LetraGabarito>();
  const duplicados = new Set<number>();

  extrairPorPares(texto, respostas, duplicados);
  extrairPorLinhasDeTabela(texto, respostas, duplicados);
  extrairPorSequencia(texto, respostas, duplicados);

  const respostasOrdenadas = Array.from(
    respostas.entries()
  )
    .map(([numero, resposta]) => ({
      numero,
      resposta,
    }))
    .sort((a, b) => a.numero - b.numero);

  const numerosAusentes: number[] = [];

  for (let numero = 1; numero <= 60; numero += 1) {
    if (!respostas.has(numero)) {
      numerosAusentes.push(numero);
    }
  }

  const avisos: string[] = [];

  if (respostasOrdenadas.length === 0) {
    avisos.push(
      "Nenhuma resposta de gabarito foi identificada."
    );
  }

  if (
    respostasOrdenadas.length > 0 &&
    respostasOrdenadas.length < 60
  ) {
    avisos.push(
      `Foram identificadas ${respostasOrdenadas.length} de 60 respostas.`
    );
  }

  if (duplicados.size > 0) {
    avisos.push(
      `Há respostas conflitantes para as questões: ${Array.from(
        duplicados
      )
        .sort((a, b) => a - b)
        .map((numero) => String(numero).padStart(2, "0"))
        .join(", ")}.`
    );
  }

  return {
    respostas: respostasOrdenadas,
    totalEncontrado: respostasOrdenadas.length,
    numerosAusentes,
    numerosDuplicados: Array.from(duplicados).sort(
      (a, b) => a - b
    ),
    avisos,
  };
}

export function aplicarGabaritoNasQuestoes(
  questoes: Questao[],
  resultado: ResultadoParserGabarito
): Questao[] {
  const respostas = new Map(
    resultado.respostas.map((item) => [
      item.numero,
      item.resposta,
    ])
  );

  return questoes.map((questao) => ({
    ...questao,
    respostaCorreta:
      respostas.get(questao.numero) ??
      questao.respostaCorreta ??
      null,
  }));
}