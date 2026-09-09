import { supabase } from "@/lib/supabase";
import type { Apoio } from "@/types/apoio";

export interface ApoioImportado {
  id: number;
  prova_id: number;
  tipo: string;
  titulo: string | null;
  conteudo: string;
  pagina_inicial: number;
  pagina_final: number;
}

export async function importarApoios(
  provaId: number,
  apoios: Apoio[]
): Promise<ApoioImportado[]> {
  if (apoios.length === 0) {
    return [];
  }

  const registros = apoios.map((apoio) => ({
    prova_id: provaId,
    tipo: apoio.tipo,
    titulo: apoio.titulo ?? null,
    conteudo: apoio.conteudo,
    pagina_inicial: apoio.paginaInicial,
    pagina_final: apoio.paginaFinal,
  }));

  const { data, error } = await supabase
    .from("apoios")
    .insert(registros)
    .select("*");

  if (error) {
    throw new Error(`Erro ao importar apoios: ${error.message}`);
  }

  return (data ?? []) as ApoioImportado[];
}

export async function listarApoiosDaProva(
  provaId: number
): Promise<ApoioImportado[]> {
  const { data, error } = await supabase
    .from("apoios")
    .select("*")
    .eq("prova_id", provaId)
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Erro ao listar apoios: ${error.message}`);
  }

  return (data ?? []) as ApoioImportado[];
}

export async function excluirApoiosDaProva(
  provaId: number
): Promise<void> {
  const { error } = await supabase
    .from("apoios")
    .delete()
    .eq("prova_id", provaId);

  if (error) {
    throw new Error(`Erro ao excluir apoios: ${error.message}`);
  }
}
