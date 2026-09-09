import { supabase } from "@/lib/supabase";
import type { ApoioImportado } from "@/services/apoios";
import type { QuestaoImportada } from "@/services/questoes";

interface QuestaoOriginal {
  numero: number;
}

interface ApoioOriginal {
  questoes: number[];
}

interface QuestaoApoioImportado {
  questao_id: number;
  apoio_id: number;
}

export async function importarQuestaoApoios(
  questoesImportadas: QuestaoImportada[],
  apoiosImportados: ApoioImportado[],
  questoesOriginais: QuestaoOriginal[],
  apoiosOriginais: ApoioOriginal[]
): Promise<number> {
  if (
    questoesImportadas.length === 0 ||
    apoiosImportados.length === 0 ||
    apoiosOriginais.length === 0
  ) {
    return 0;
  }

  const questaoIdPorNumero = new Map<number, number>();

  questoesOriginais.forEach((questao, indice) => {
    const questaoImportada = questoesImportadas[indice];

    if (questaoImportada) {
      questaoIdPorNumero.set(questao.numero, questaoImportada.id);
    }
  });

  const relacionamentos: QuestaoApoioImportado[] = [];
  const chaves = new Set<string>();

  apoiosOriginais.forEach((apoio, indice) => {
    const apoioImportado = apoiosImportados[indice];

    if (!apoioImportado) {
      return;
    }

    apoio.questoes.forEach((numeroQuestao) => {
      const questaoId = questaoIdPorNumero.get(numeroQuestao);

      if (!questaoId) {
        return;
      }

      const chave = `${questaoId}:${apoioImportado.id}`;

      if (chaves.has(chave)) {
        return;
      }

      chaves.add(chave);
      relacionamentos.push({
        questao_id: questaoId,
        apoio_id: apoioImportado.id,
      });
    });
  });

  if (relacionamentos.length === 0) {
    return 0;
  }

  const { error } = await supabase
    .from("questao_apoios")
    .insert(relacionamentos);

  if (error) {
    throw new Error(
      `Erro ao relacionar questões e apoios: ${error.message}`
    );
  }

  return relacionamentos.length;
}
