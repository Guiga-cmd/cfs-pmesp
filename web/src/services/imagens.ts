import { supabase } from "@/lib/supabase";
import type { RecorteImagemPDF } from "@/lib/parserImagens";
import type { QuestaoImportada } from "@/services/questoes";
import type { Questao } from "@/types/questao";

const BUCKET_PROVAS = "provas";

export interface ImagemImportada {
  id: number;
  prova_id: number;
  questao_id: number | null;
  tipo: string;
  pagina: number;
  ordem: number;
  caminho_storage: string;
  descricao: string | null;
  largura: number | null;
  altura: number | null;
  x_original: number | null;
  y_original: number | null;
  largura_original: number | null;
  altura_original: number | null;
  criado_em?: string;
}

interface RegistroImagem {
  prova_id: number;
  questao_id: number | null;
  tipo: string;
  pagina: number;
  ordem: number;
  caminho_storage: string;
  descricao: string | null;
  largura: number;
  altura: number;
  x_original: number;
  y_original: number;
  largura_original: number;
  altura_original: number;
}

interface ArquivoPreparado {
  caminho: string;
  blob: Blob;
  registro: RegistroImagem;
}

export interface ResultadoImportacaoImagens {
  imagens: ImagemImportada[];
  quantidadeImportada: number;
  caminhosEnviados: string[];
}

function extensaoDoDataUrl(dataUrl: string): string {
  const correspondencia = dataUrl.match(
    /^data:image\/([a-zA-Z0-9.+-]+);base64,/
  );

  const formato = correspondencia?.[1]?.toLowerCase();

  if (formato === "jpeg" || formato === "jpg") {
    return "jpg";
  }

  if (formato === "png") {
    return "png";
  }

  if (formato === "webp") {
    return "webp";
  }

  return "jpg";
}

function tipoMimeDaExtensao(extensao: string): string {
  switch (extensao) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function dataUrlParaBlob(dataUrl: string): Blob {
  const partes = dataUrl.split(",");

  if (partes.length !== 2) {
    throw new Error("A imagem extraída possui um formato inválido.");
  }

  const cabecalho = partes[0];
  const base64 = partes[1];

  const correspondenciaMime = cabecalho.match(
    /^data:([^;]+);base64$/
  );

  const mime =
    correspondenciaMime?.[1] ?? "image/jpeg";

  let binario: string;

  try {
    binario = atob(base64);
  } catch {
    throw new Error(
      "Não foi possível decodificar uma das imagens extraídas."
    );
  }

  const bytes = new Uint8Array(binario.length);

  for (let indice = 0; indice < binario.length; indice += 1) {
    bytes[indice] = binario.charCodeAt(indice);
  }

  return new Blob([bytes], { type: mime });
}

function nomeSeguro(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function criarMapaQuestaoId(
  questoesImportadas: QuestaoImportada[],
  questoesOriginais: Questao[]
): Map<number, number> {
  const mapa = new Map<number, number>();

  questoesOriginais.forEach((questao, indice) => {
    const questaoImportada = questoesImportadas[indice];

    if (questaoImportada) {
      mapa.set(questao.numero, questaoImportada.id);
    }
  });

  return mapa;
}

function montarCaminhoImagem(
  provaId: number,
  imagem: RecorteImagemPDF
): string {
  const extensao = extensaoDoDataUrl(imagem.dataUrl);
  const numeroQuestao =
    imagem.questaoNumero === null
      ? "sem-questao"
      : `questao-${String(imagem.questaoNumero).padStart(
          2,
          "0"
        )}`;

  const tipo = nomeSeguro(imagem.tipo);
  const identificador = nomeSeguro(imagem.id);

  return [
    "imagens",
    `prova-${provaId}`,
    numeroQuestao,
    `${String(imagem.ordem).padStart(
      4,
      "0"
    )}-pagina-${String(imagem.pagina).padStart(
      3,
      "0"
    )}-${tipo}-${identificador}.${extensao}`,
  ].join("/");
}

function prepararArquivos(
  provaId: number,
  imagens: RecorteImagemPDF[],
  questaoIdPorNumero: Map<number, number>
): ArquivoPreparado[] {
  return imagens.map((imagem) => {
    const caminho = montarCaminhoImagem(provaId, imagem);
    const extensao = extensaoDoDataUrl(imagem.dataUrl);
    const blobOriginal = dataUrlParaBlob(imagem.dataUrl);

    const blob =
      blobOriginal.type === tipoMimeDaExtensao(extensao)
        ? blobOriginal
        : new Blob([blobOriginal], {
            type: tipoMimeDaExtensao(extensao),
          });

    const questaoId =
      imagem.questaoNumero === null
        ? null
        : questaoIdPorNumero.get(imagem.questaoNumero) ??
          null;

    const registro: RegistroImagem = {
      prova_id: provaId,
      questao_id: questaoId,
      tipo: imagem.tipo,
      pagina: imagem.pagina,
      ordem: imagem.ordem,
      caminho_storage: caminho,
      descricao: imagem.descricao || null,
      largura: imagem.largura,
      altura: imagem.altura,
      x_original: imagem.xOriginal,
      y_original: imagem.yOriginal,
      largura_original: imagem.larguraOriginal,
      altura_original: imagem.alturaOriginal,
    };

    return {
      caminho,
      blob,
      registro,
    };
  });
}

async function removerArquivos(
  caminhos: string[]
): Promise<void> {
  if (caminhos.length === 0) {
    return;
  }

  const tamanhoLote = 100;

  for (
    let inicio = 0;
    inicio < caminhos.length;
    inicio += tamanhoLote
  ) {
    const lote = caminhos.slice(
      inicio,
      inicio + tamanhoLote
    );

    const { error } = await supabase.storage
      .from(BUCKET_PROVAS)
      .remove(lote);

    if (error) {
      console.error(
        "Não foi possível remover imagens do armazenamento:",
        error.message
      );
    }
  }
}

export async function importarImagens(
  provaId: number,
  imagens: RecorteImagemPDF[],
  questoesImportadas: QuestaoImportada[],
  questoesOriginais: Questao[]
): Promise<ResultadoImportacaoImagens> {
  if (imagens.length === 0) {
    return {
      imagens: [],
      quantidadeImportada: 0,
      caminhosEnviados: [],
    };
  }

  const questaoIdPorNumero = criarMapaQuestaoId(
    questoesImportadas,
    questoesOriginais
  );

  const arquivos = prepararArquivos(
    provaId,
    imagens,
    questaoIdPorNumero
  );

  const caminhosEnviados: string[] = [];

  try {
    for (const arquivo of arquivos) {
      const { error } = await supabase.storage
        .from(BUCKET_PROVAS)
        .upload(arquivo.caminho, arquivo.blob, {
          contentType: arquivo.blob.type,
          cacheControl: "31536000",
          upsert: false,
        });

      if (error) {
        throw new Error(
          `Erro ao enviar a imagem "${arquivo.caminho}": ${error.message}`
        );
      }

      caminhosEnviados.push(arquivo.caminho);
    }

    const registros = arquivos.map(
      (arquivo) => arquivo.registro
    );

    const { data, error } = await supabase
      .from("imagens")
      .insert(registros)
      .select("*");

    if (error) {
      throw new Error(
        `Erro ao registrar as imagens: ${error.message}`
      );
    }

    const imagensImportadas =
      (data ?? []) as ImagemImportada[];

    return {
      imagens: imagensImportadas,
      quantidadeImportada: imagensImportadas.length,
      caminhosEnviados,
    };
  } catch (erro) {
    await removerArquivos(caminhosEnviados);
    throw erro;
  }
}

export async function listarImagensDaQuestao(
  questaoId: number
): Promise<ImagemImportada[]> {
  const { data, error } = await supabase
    .from("imagens")
    .select("*")
    .eq("questao_id", questaoId)
    .order("ordem", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao listar imagens da questão: ${error.message}`
    );
  }

  return (data ?? []) as ImagemImportada[];
}

export async function listarImagensDaProva(
  provaId: number
): Promise<ImagemImportada[]> {
  const { data, error } = await supabase
    .from("imagens")
    .select("*")
    .eq("prova_id", provaId)
    .order("ordem", { ascending: true });

  if (error) {
    throw new Error(
      `Erro ao listar imagens da prova: ${error.message}`
    );
  }

  return (data ?? []) as ImagemImportada[];
}

function separarCaminhoStorage(caminhoStorage: string): {
  pasta: string;
  arquivo: string;
} {
  const partes = caminhoStorage.split("/").filter(Boolean);
  const arquivo = partes.pop() ?? "";

  return {
    pasta: partes.join("/"),
    arquivo,
  };
}

function obterPrefixoEstavelNomeArquivo(
  nomeArquivo: string
): string {
  const semExtensao = nomeArquivo.replace(
    /\.(jpg|jpeg|png|webp)$/i,
    ""
  );

  const correspondencia = semExtensao.match(
    /^(\d{4}-pagina-\d{3}-(?:questao|continuidade|pagina)-)/
  );

  return correspondencia?.[1] ?? semExtensao;
}

async function localizarCaminhoReal(
  caminhoStorage: string
): Promise<string | null> {
  const { pasta, arquivo } =
    separarCaminhoStorage(caminhoStorage);

  if (!pasta || !arquivo) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_PROVAS)
    .list(pasta, {
      limit: 100,
      sortBy: {
        column: "name",
        order: "asc",
      },
    });

  if (error || !data) {
    return null;
  }

  const prefixo = obterPrefixoEstavelNomeArquivo(arquivo);

  const arquivoEncontrado = data.find(
    (item) =>
      item.name === arquivo ||
      item.name.startsWith(prefixo)
  );

  if (!arquivoEncontrado) {
    return null;
  }

  return `${pasta}/${arquivoEncontrado.name}`;
}

export async function obterUrlImagem(
  caminhoStorage: string
): Promise<string> {
  const caminhoReal = await localizarCaminhoReal(
    caminhoStorage
  );

  if (!caminhoReal) {
    throw new Error(
      `Arquivo não localizado no Storage: "${caminhoStorage}".`
    );
  }

  const { data, error } = await supabase.storage
    .from(BUCKET_PROVAS)
    .download(caminhoReal);

  if (error || !data) {
    throw new Error(
      `Erro ao baixar a imagem "${caminhoReal}": ${
        error?.message ??
        "O arquivo não foi retornado pelo armazenamento."
      }`
    );
  }

  return URL.createObjectURL(data);
}

export async function obterUrlsImagens(
  caminhosStorage: string[]
): Promise<Map<string, string>> {
  const caminhosUnicos = Array.from(
    new Set(caminhosStorage.filter(Boolean))
  );

  const mapa = new Map<string, string>();

  const resultados = await Promise.allSettled(
    caminhosUnicos.map(async (caminho) => {
      const url = await obterUrlImagem(caminho);

      return {
        caminho,
        url,
      };
    })
  );

  resultados.forEach((resultado) => {
    if (resultado.status === "fulfilled") {
      mapa.set(
        resultado.value.caminho,
        resultado.value.url
      );
      return;
    }

    console.warn(
      "Imagem ignorada porque não foi encontrada no Storage:",
      resultado.reason
    );
  });

  return mapa;
}

export async function excluirImagensDaProva(
  provaId: number
): Promise<void> {
  const imagens = await listarImagensDaProva(provaId);
  const caminhos = imagens.map(
    (imagem) => imagem.caminho_storage
  );

  const { error } = await supabase
    .from("imagens")
    .delete()
    .eq("prova_id", provaId);

  if (error) {
    throw new Error(
      `Erro ao excluir imagens da prova: ${error.message}`
    );
  }

  await removerArquivos(caminhos);
}