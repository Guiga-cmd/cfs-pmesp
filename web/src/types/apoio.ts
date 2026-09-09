export interface Apoio {
  id: string | number;

  provaId?: number;

  tipo: string;

  titulo?: string | null;

  conteudo: string;

  paginaInicial: number;

  paginaFinal: number;

  questoes: number[];

  criadoEm?: string;
}