export interface Questao {
  id?: number;

  numero: number;

  disciplina: string;

  prova: string;

  ano: number;

  enunciado: string;

  alternativaA: string;

  alternativaB: string;

  alternativaC: string;

  alternativaD: string;

  alternativaE: string | null;

  respostaCorreta: "A" | "B" | "C" | "D" | "E" | null;

  explicacao: string | null;

  paginaInicial: number;

  paginaFinal: number;

  textoOriginal: string;

  precisaRevisao: boolean;

  avisos: string[];

  criadoEm?: string;
}