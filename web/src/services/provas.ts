import { supabase } from "@/lib/supabase";

export interface NovaProva {
  nome: string;
  ano: number;
  banca: string;
  cargo: string;

  nomeArquivo: string;
  caminhoStorage: string;

  totalQuestoes: number;
}

export interface Prova {
  id: number;

  nome: string;
  ano: number;

  banca: string | null;
  cargo: string | null;

  nome_arquivo: string | null;
  caminho_storage: string | null;

  total_questoes: number;

  status: string;

  questoes_importadas: number;

  erro: string | null;

  criado_em?: string | null;
  atualizado_em?: string | null;
}

export interface ResultadoExclusaoProva {
  provaId: number;
  nome: string;
  ano: number;
  questoesExcluidas: number;
  imagensExcluidas: number;
  apoiosExcluidos: number;
  arquivoStorageRemovido: boolean;
}

interface RegistroQuestao {
  id: number;
}

interface RegistroApoioVinculado {
  apoio_id: number;
}

function mensagemErro(
  contexto: string,
  erro: { message?: string } | null
): Error {
  return new Error(
    erro?.message
      ? `${contexto}: ${erro.message}`
      : contexto
  );
}

export async function listarProvas(): Promise<Prova[]> {
  const { data, error } = await supabase
    .from("provas")
    .select("*")
    .order("ano", { ascending: false })
    .order("nome", { ascending: true });

  if (error) {
    throw mensagemErro(
      "Não foi possível listar as provas importadas",
      error
    );
  }

  return (data ?? []) as Prova[];
}

export async function buscarProva(
  nome: string,
  ano: number
): Promise<Prova | null> {
  const { data, error } = await supabase
    .from("provas")
    .select("*")
    .eq("nome", nome)
    .eq("ano", ano)
    .maybeSingle();

  if (error) {
    throw mensagemErro(
      "Não foi possível consultar a prova",
      error
    );
  }

  return data as Prova | null;
}

export async function criarProva(
  prova: NovaProva
): Promise<Prova> {
  const { data, error } = await supabase
    .from("provas")
    .insert({
      nome: prova.nome,
      ano: prova.ano,

      banca: prova.banca,
      cargo: prova.cargo,

      nome_arquivo: prova.nomeArquivo,
      caminho_storage: prova.caminhoStorage,

      total_questoes: prova.totalQuestoes,

      status: "importando",

      questoes_importadas: 0,

      erro: null,
    })
    .select()
    .single();

  if (error) {
    throw mensagemErro(
      "Não foi possível registrar a prova",
      error
    );
  }

  return data as Prova;
}

export async function atualizarStatusProva(
  provaId: number,
  status: string,
  questoesImportadas: number,
  erro: string | null = null
): Promise<void> {
  const { error } = await supabase
    .from("provas")
    .update({
      status,
      questoes_importadas: questoesImportadas,
      erro,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", provaId);

  if (error) {
    throw mensagemErro(
      "Não foi possível atualizar o status da prova",
      error
    );
  }
}

/**
 * Exclui uma prova e todos os registros relacionados.
 *
 * Ordem adotada:
 * 1. lê as questões da prova;
 * 2. guarda os apoios ligados a essas questões;
 * 3. remove vínculos questão-apoio;
 * 4. remove imagens;
 * 5. remove questões;
 * 6. remove apoios que ficaram sem uso;
 * 7. remove o PDF do Storage;
 * 8. remove o registro principal da prova.
 *
 * A exclusão é feita de forma conservadora: um apoio só é
 * apagado quando não estiver mais vinculado a nenhuma questão.
 */
export async function excluirProvaCompleta(
  provaId: number
): Promise<ResultadoExclusaoProva> {
  const { data: prova, error: erroProva } =
    await supabase
      .from("provas")
      .select("*")
      .eq("id", provaId)
      .maybeSingle();

  if (erroProva) {
    throw mensagemErro(
      "Não foi possível localizar a prova",
      erroProva
    );
  }

  if (!prova) {
    throw new Error(
      "A prova selecionada não existe ou já foi excluída."
    );
  }

  const provaAtual = prova as Prova;

  const { data: questoes, error: erroQuestoes } =
    await supabase
      .from("questoes")
      .select("id")
      .eq("prova_id", provaId);

  if (erroQuestoes) {
    throw mensagemErro(
      "Não foi possível consultar as questões da prova",
      erroQuestoes
    );
  }

  const idsQuestoes = (
    (questoes ?? []) as RegistroQuestao[]
  ).map((questao) => questao.id);

  let idsApoios: number[] = [];

  if (idsQuestoes.length > 0) {
    const {
      data: vinculosApoios,
      error: erroVinculosApoios,
    } = await supabase
      .from("questao_apoios")
      .select("apoio_id")
      .in("questao_id", idsQuestoes);

    if (erroVinculosApoios) {
      throw mensagemErro(
        "Não foi possível consultar os materiais de apoio vinculados",
        erroVinculosApoios
      );
    }

    idsApoios = Array.from(
      new Set(
        (
          (vinculosApoios ??
            []) as RegistroApoioVinculado[]
        ).map((vinculo) => vinculo.apoio_id)
      )
    );

    const { error: erroExcluirVinculos } =
      await supabase
        .from("questao_apoios")
        .delete()
        .in("questao_id", idsQuestoes);

    if (erroExcluirVinculos) {
      throw mensagemErro(
        "Não foi possível remover os vínculos com materiais de apoio",
        erroExcluirVinculos
      );
    }
  }

  const { count: imagensExcluidas, error: erroImagens } =
    await supabase
      .from("imagens")
      .delete({ count: "exact" })
      .eq("prova_id", provaId);

  if (erroImagens) {
    throw mensagemErro(
      "Não foi possível excluir as imagens da prova",
      erroImagens
    );
  }

  let questoesExcluidas = 0;

  if (idsQuestoes.length > 0) {
    const { count, error: erroExcluirQuestoes } =
      await supabase
        .from("questoes")
        .delete({ count: "exact" })
        .in("id", idsQuestoes);

    if (erroExcluirQuestoes) {
      throw mensagemErro(
        "Não foi possível excluir as questões da prova",
        erroExcluirQuestoes
      );
    }

    questoesExcluidas = count ?? idsQuestoes.length;
  }

  let apoiosExcluidos = 0;

  for (const apoioId of idsApoios) {
    const {
      count: quantidadeVinculosRestantes,
      error: erroContarVinculos,
    } = await supabase
      .from("questao_apoios")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("apoio_id", apoioId);

    if (erroContarVinculos) {
      throw mensagemErro(
        `Não foi possível verificar o uso do apoio ${apoioId}`,
        erroContarVinculos
      );
    }

    if ((quantidadeVinculosRestantes ?? 0) > 0) {
      continue;
    }

    const { count, error: erroExcluirApoio } =
      await supabase
        .from("apoios")
        .delete({ count: "exact" })
        .eq("id", apoioId);

    if (erroExcluirApoio) {
      throw mensagemErro(
        `Não foi possível excluir o apoio ${apoioId}`,
        erroExcluirApoio
      );
    }

    apoiosExcluidos += count ?? 0;
  }

  let arquivoStorageRemovido = false;

  if (provaAtual.caminho_storage) {
    const { error: erroStorage } =
      await supabase.storage
        .from("provas")
        .remove([provaAtual.caminho_storage]);

    if (erroStorage) {
      throw mensagemErro(
        "Os registros foram removidos, mas não foi possível excluir o PDF do armazenamento",
        erroStorage
      );
    }

    arquivoStorageRemovido = true;
  }

  const { error: erroExcluirProva } = await supabase
    .from("provas")
    .delete()
    .eq("id", provaId);

  if (erroExcluirProva) {
    throw mensagemErro(
      "Não foi possível excluir o registro principal da prova",
      erroExcluirProva
    );
  }

  return {
    provaId,
    nome: provaAtual.nome,
    ano: provaAtual.ano,
    questoesExcluidas,
    imagensExcluidas: imagensExcluidas ?? 0,
    apoiosExcluidos,
    arquivoStorageRemovido,
  };
}

/**
 * Mantém compatibilidade com chamadas antigas.
 */
export async function excluirProva(
  provaId: number
): Promise<void> {
  await excluirProvaCompleta(provaId);
}