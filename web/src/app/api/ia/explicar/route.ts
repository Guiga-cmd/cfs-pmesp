import OpenAI from "openai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const TAMANHO_MAXIMO_QUESTAO = 12000;

interface CorpoRequisicao {
  questao?: unknown;
}

function obterMensagemErro(erro: unknown): string {
  if (erro instanceof OpenAI.APIError) {
    if (erro.status === 401) {
      return "A chave da API é inválida ou não foi configurada corretamente.";
    }

    if (erro.status === 429) {
      return "O limite da API foi atingido. Aguarde um momento e tente novamente.";
    }

    if (erro.status && erro.status >= 500) {
      return "O serviço de IA está temporariamente indisponível.";
    }

    return erro.message || "A API recusou a solicitação.";
  }

  if (erro instanceof Error) {
    return erro.message;
  }

  return "Ocorreu um erro inesperado ao consultar a IA.";
}

export async function POST(request: Request) {
  try {
    const chaveApi = process.env.OPENAI_API_KEY;

    if (!chaveApi) {
      return NextResponse.json(
        {
          erro:
            "A variável OPENAI_API_KEY não foi configurada no servidor.",
        },
        { status: 500 }
      );
    }

    let corpo: CorpoRequisicao;

    try {
      corpo = (await request.json()) as CorpoRequisicao;
    } catch {
      return NextResponse.json(
        { erro: "O corpo da solicitação não é um JSON válido." },
        { status: 400 }
      );
    }

    if (typeof corpo.questao !== "string") {
      return NextResponse.json(
        { erro: "O campo questao é obrigatório." },
        { status: 400 }
      );
    }

    const questao = corpo.questao.trim();

    if (!questao) {
      return NextResponse.json(
        { erro: "A questão não pode estar vazia." },
        { status: 400 }
      );
    }

    if (questao.length > TAMANHO_MAXIMO_QUESTAO) {
      return NextResponse.json(
        {
          erro: `A questão ultrapassa o limite de ${TAMANHO_MAXIMO_QUESTAO} caracteres.`,
        },
        { status: 400 }
      );
    }

    const cliente = new OpenAI({
      apiKey: chaveApi,
    });

    const resposta = await cliente.responses.create({
      model: "gpt-5-mini",
      store: false,
      max_output_tokens: 1800,
      instructions: [
        "Você é um professor especializado em concursos públicos brasileiros.",
        "Explique a questão de forma clara, objetiva e didática, em português do Brasil.",
        "Use apenas as informações fornecidas pelo usuário e conhecimento consolidado.",
        "Quando houver gabarito informado, trate-o como resposta oficial e explique por que ele está correto.",
        "Quando não houver gabarito, deixe explícito que a alternativa indicada é uma análise da IA.",
        "Estruture a resposta com: resposta correta, justificativa, análise das alternativas e resumo do conteúdo cobrado.",
        "Não invente lei, artigo, dado, trecho ou referência que não esteja seguro.",
        "Quando faltar contexto, informe exatamente o que está faltando.",
      ].join(" "),
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Explique a questão abaixo:\n\n${questao}`,
            },
          ],
        },
      ],
    });

    const explicacao = resposta.output_text.trim();

    if (!explicacao) {
      return NextResponse.json(
        { erro: "A IA não retornou uma explicação." },
        { status: 502 }
      );
    }

    return NextResponse.json({ explicacao });
  } catch (erro) {
    console.error("Erro na rota /api/ia/explicar:", erro);

    return NextResponse.json(
      { erro: obterMensagemErro(erro) },
      { status: 500 }
    );
  }
}