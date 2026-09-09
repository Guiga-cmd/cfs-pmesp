import { supabase } from "@/lib/supabase";
import type { Questao } from "@/types/questao";

interface DadosDaProva {
  nome: string;
  ano: number;
}

export interface QuestaoImportada {
  id: number;
  prova_id: number;
  numero: number;
  enunciado: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  alternativa_e: string | null;
  resposta_correta: string;
  disciplina: string | null;
  prova: string;
  ano: number;
  explicacao: string | null;
}

export async function importarQuestoes(
  provaId: number,
  questoes: Questao[],
  dadosDaProva: DadosDaProva
): Promise<QuestaoImportada[]> {
  if (questoes.length === 0) {
    return [];
  }

  const registros = questoes.map((questao) => ({
    prova_id: provaId,
    numero: questao.numero,
    enunciado: questao.enunciado,
    alternativa_a: questao.alternativaA,
    alternativa_b: questao.alternativaB,
    alternativa_c: questao.alternativaC,
    alternativa_d: questao.alternativaD,
    alternativa_e: questao.alternativaE || null,
    resposta_correta: questao.respostaCorreta,
    disciplina: questao.disciplina || null,
    prova: questao.prova || dadosDaProva.nome,
    ano: questao.ano || dadosDaProva.ano,
    explicacao: questao.explicacao || null,
  }));

  const { data, error } = await supabase
    .from("questoes")
    .insert(registros)
    .select("*");

  if (error) {
    throw new Error(`Erro ao importar questões: ${error.message}`);
  }

  return (data ?? []) as QuestaoImportada[];
}

export async function excluirQuestoesDaProva(
  provaId: number
): Promise<void> {
  const { error } = await supabase
    .from("questoes")
    .delete()
    .eq("prova_id", provaId);

  if (error) {
    throw new Error(`Erro ao excluir questões da prova: ${error.message}`);
  }
}

export async function listarQuestoesDaProva(
  provaId: number
): Promise<QuestaoImportada[]> {
  const { data, error } = await supabase
    .from("questoes")
    .select("*")
    .eq("prova_id", provaId)
    .order("numero", { ascending: true })
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar questões da prova: ${error.message}`);
  }

  return (data ?? []) as QuestaoImportada[];
}

export async function contarQuestoesDaProva(
  provaId: number
): Promise<number> {
  const { count, error } = await supabase
    .from("questoes")
    .select("*", { count: "exact", head: true })
    .eq("prova_id", provaId);

  if (error) {
    throw new Error(`Erro ao contar questões da prova: ${error.message}`);
  }

  return count ?? 0;
}