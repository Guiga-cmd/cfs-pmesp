"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import QuestaoCard, {
  type ApoioBanco,
  type ImagemBanco,
  type QuestaoBanco,
} from "@/components/QuestaoCard";
import { supabase } from "@/lib/supabase";
import { obterUrlsImagens } from "@/services/imagens";

const CHAVE_RESULTADOS = "cfs-pmesp-resultados";
const CHAVE_FAVORITAS = "cfs-pmesp-favoritas";
const CHAVE_SIMULADOS = "cfs-pmesp-simulados";

interface RelacaoQuestaoApoio {
  questao_id: number;
  apoio_id: number;
}

interface ImagemSemUrl {
  id: number;
  questao_id: number | null;
  tipo: string;
  pagina: number;
  ordem: number;
  caminho_storage: string;
  descricao: string | null;
  largura: number | null;
  altura: number | null;
}

interface QuestaoSemApoios {
  id: number;
  enunciado: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  alternativa_e: string | null;
  resposta_correta: string | null;
  disciplina: string | null;
  prova: string | null;
  ano: number | null;
  explicacao: string | null;
}

interface ResultadoGlobalSalvo {
  acertou: boolean;
  disciplina?: string | null;
  respondidaEm?: string;
}

interface SimuladoSalvo {
  id: string;
  titulo: string;
  totalQuestoes: number;
  respondidas: number;
  acertos: number;
  erros: number;
  aproveitamento: number;
  disciplina: string | null;
  prova: string | null;
  ano: number | null;
  concluidoEm: string;
}

function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens];

  for (
    let indice = copia.length - 1;
    indice > 0;
    indice -= 1
  ) {
    const sorteado = Math.floor(
      Math.random() * (indice + 1)
    );

    [copia[indice], copia[sorteado]] = [
      copia[sorteado],
      copia[indice],
    ];
  }

  return copia;
}

function lerJSONLocal<T>(chave: string, padrao: T): T {
  if (typeof window === "undefined") {
    return padrao;
  }

  try {
    const valor = window.localStorage.getItem(chave);

    return valor ? (JSON.parse(valor) as T) : padrao;
  } catch {
    return padrao;
  }
}

function salvarJSONLocal<T>(chave: string, valor: T): void {
  window.localStorage.setItem(chave, JSON.stringify(valor));
}

function ehInstrucaoGeralDaProva(
  apoio: ApoioBanco
): boolean {
  const texto = `${apoio.tipo} ${apoio.titulo ?? ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    texto.includes("instrucao geral") ||
    texto.includes("instrucoes gerais") ||
    texto.includes("capa") ||
    texto.includes("orientacao geral")
  );
}

function criarIdSimulado(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}`;
}

export default function Simulados() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const [questoes, setQuestoes] = useState<
    QuestaoBanco[]
  >([]);
  const [questoesSimulado, setQuestoesSimulado] =
    useState<QuestaoBanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const [quantidade, setQuantidade] = useState(10);
  const [disciplina, setDisciplina] = useState("");
  const [prova, setProva] = useState("");
  const [ano, setAno] = useState("");

  const [simuladoIniciado, setSimuladoIniciado] =
    useState(false);
  const [simuladoFinalizado, setSimuladoFinalizado] =
    useState(false);
  const [mostrarSomenteErros, setMostrarSomenteErros] =
    useState(false);

  const [resultados, setResultados] = useState<
    Record<number, boolean>
  >({});
  const [favoritas, setFavoritas] = useState<Set<number>>(
    () => new Set()
  );

  useEffect(() => {
    if (!carregandoAuth && !usuario) {
      router.replace("/login");
    }
  }, [carregandoAuth, usuario, router]);

  useEffect(() => {
    if (carregandoAuth || !usuario) {
      return;
    }

    const favoritasSalvas = lerJSONLocal<number[]>(
      CHAVE_FAVORITAS,
      []
    );

    setFavoritas(new Set(favoritasSalvas));
  }, [carregandoAuth, usuario]);

  useEffect(() => {
    if (carregandoAuth || !usuario) {
      return;
    }

    async function carregarQuestoes() {
      setCarregando(true);
      setErro("");

      try {
        const {
          data: questoesData,
          error: questoesError,
        } = await supabase
          .from("questoes")
          .select(
            `
              id,
              enunciado,
              alternativa_a,
              alternativa_b,
              alternativa_c,
              alternativa_d,
              alternativa_e,
              resposta_correta,
              disciplina,
              prova,
              ano,
              explicacao
            `
          )
          .order("id", { ascending: true });

        if (questoesError) {
          throw new Error(
            `Erro ao carregar questões: ${questoesError.message}`
          );
        }

        const questoesSemApoios =
          (questoesData ?? []) as QuestaoSemApoios[];

        if (questoesSemApoios.length === 0) {
          setQuestoes([]);
          return;
        }

        const idsQuestoes = questoesSemApoios.map(
          (questao) => questao.id
        );

        const {
          data: relacoesData,
          error: relacoesError,
        } = await supabase
          .from("questao_apoios")
          .select("questao_id, apoio_id")
          .in("questao_id", idsQuestoes);

        if (relacoesError) {
          throw new Error(
            `Erro ao carregar apoios: ${relacoesError.message}`
          );
        }

        const relacoes =
          (relacoesData ?? []) as RelacaoQuestaoApoio[];

        const idsApoios = Array.from(
          new Set(
            relacoes.map((relacao) => relacao.apoio_id)
          )
        );

        let apoios: ApoioBanco[] = [];

        if (idsApoios.length > 0) {
          const {
            data: apoiosData,
            error: apoiosError,
          } = await supabase
            .from("apoios")
            .select(
              `
                id,
                tipo,
                titulo,
                conteudo,
                pagina_inicial,
                pagina_final
              `
            )
            .in("id", idsApoios)
            .order("id", { ascending: true });

          if (apoiosError) {
            throw new Error(
              `Erro ao carregar textos de apoio: ${apoiosError.message}`
            );
          }

          apoios = (apoiosData ?? []) as ApoioBanco[];
        }

        const apoiosPorId = new Map(
          apoios.map((apoio) => [apoio.id, apoio])
        );

        const idsApoiosPorQuestao = new Map<
          number,
          number[]
        >();

        relacoes.forEach((relacao) => {
          const atuais =
            idsApoiosPorQuestao.get(
              relacao.questao_id
            ) ?? [];

          atuais.push(relacao.apoio_id);

          idsApoiosPorQuestao.set(
            relacao.questao_id,
            atuais
          );
        });

        const {
          data: imagensData,
          error: imagensError,
        } = await supabase
          .from("imagens")
          .select(
            `
              id,
              questao_id,
              tipo,
              pagina,
              ordem,
              caminho_storage,
              descricao,
              largura,
              altura
            `
          )
          .in("questao_id", idsQuestoes)
          .order("ordem", { ascending: true });

        if (imagensError) {
          throw new Error(
            `Erro ao carregar imagens: ${imagensError.message}`
          );
        }

        const imagensSemUrl =
          (imagensData ?? []) as ImagemSemUrl[];

        const urlsPorCaminho = await obterUrlsImagens(
          imagensSemUrl.map(
            (imagem) => imagem.caminho_storage
          )
        );

        const imagensPorQuestao = new Map<
          number,
          ImagemBanco[]
        >();

        imagensSemUrl.forEach((imagem) => {
          if (imagem.questao_id === null) {
            return;
          }

          const atuais =
            imagensPorQuestao.get(
              imagem.questao_id
            ) ?? [];

          atuais.push({
            id: imagem.id,
            tipo: imagem.tipo,
            pagina: imagem.pagina,
            ordem: imagem.ordem,
            caminho_storage: imagem.caminho_storage,
            descricao: imagem.descricao,
            largura: imagem.largura,
            altura: imagem.altura,
            url_publica:
              urlsPorCaminho.get(
                imagem.caminho_storage
              ) ?? "",
          });

          imagensPorQuestao.set(
            imagem.questao_id,
            atuais
          );
        });

        const questoesComConteudo: QuestaoBanco[] =
          questoesSemApoios.map((questao) => {
            const apoiosDaQuestao = (
              idsApoiosPorQuestao.get(questao.id) ?? []
            )
              .map((apoioId) =>
                apoiosPorId.get(apoioId)
              )
              .filter(
                (apoio): apoio is ApoioBanco =>
                  apoio !== undefined &&
                  !ehInstrucaoGeralDaProva(apoio)
              );

            return {
              ...questao,
              apoios: apoiosDaQuestao,
              imagens:
                imagensPorQuestao.get(questao.id) ??
                [],
            };
          });

        setQuestoes(questoesComConteudo);
      } catch (erroCarregamento) {
        setErro(
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Ocorreu um erro inesperado ao carregar as questões."
        );
        setQuestoes([]);
      } finally {
        setCarregando(false);
      }
    }

    carregarQuestoes();
  }, [carregandoAuth, usuario]);

  const disciplinas = useMemo(
    () =>
      Array.from(
        new Set(
          questoes
            .map((questao) => questao.disciplina)
            .filter(
              (valor): valor is string =>
                Boolean(valor?.trim())
            )
        )
      ).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [questoes]
  );

  const provas = useMemo(
    () =>
      Array.from(
        new Set(
          questoes
            .map((questao) => questao.prova)
            .filter(
              (valor): valor is string =>
                Boolean(valor?.trim())
            )
        )
      ).sort((a, b) =>
        a.localeCompare(b, "pt-BR")
      ),
    [questoes]
  );

  const anos = useMemo(
    () =>
      Array.from(
        new Set(
          questoes
            .map((questao) => questao.ano)
            .filter(
              (valor): valor is number =>
                typeof valor === "number"
            )
        )
      ).sort((a, b) => b - a),
    [questoes]
  );

  const questoesDisponiveis = useMemo(() => {
    return questoes.filter((questao) => {
      if (
        disciplina &&
        questao.disciplina !== disciplina
      ) {
        return false;
      }

      if (prova && questao.prova !== prova) {
        return false;
      }

      if (
        ano &&
        String(questao.ano ?? "") !== ano
      ) {
        return false;
      }

      return true;
    });
  }, [questoes, disciplina, prova, ano]);

  const estatisticas = useMemo(() => {
    const valores = Object.values(resultados);
    const respondidas = valores.length;
    const acertos = valores.filter(Boolean).length;
    const erros = respondidas - acertos;
    const aproveitamento =
      respondidas === 0
        ? 0
        : Math.round((acertos / respondidas) * 100);

    return {
      respondidas,
      acertos,
      erros,
      aproveitamento,
    };
  }, [resultados]);

  const questoesExibidas = useMemo(() => {
    if (!simuladoFinalizado || !mostrarSomenteErros) {
      return questoesSimulado;
    }

    return questoesSimulado.filter(
      (questao) => resultados[questao.id] === false
    );
  }, [
    questoesSimulado,
    resultados,
    simuladoFinalizado,
    mostrarSomenteErros,
  ]);

  const todasRespondidas =
    questoesSimulado.length > 0 &&
    estatisticas.respondidas ===
      questoesSimulado.length;

  function iniciarSimulado() {
    if (questoesDisponiveis.length === 0) {
      return;
    }

    const quantidadeValida = Math.min(
      Math.max(1, Math.round(quantidade || 1)),
      questoesDisponiveis.length
    );

    setQuantidade(quantidadeValida);
    setQuestoesSimulado(
      embaralhar(questoesDisponiveis).slice(
        0,
        quantidadeValida
      )
    );
    setResultados({});
    setSimuladoFinalizado(false);
    setMostrarSomenteErros(false);
    setSimuladoIniciado(true);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function reiniciarSimulado() {
    iniciarSimulado();
  }

  function encerrarSimulado() {
    setQuestoesSimulado([]);
    setResultados({});
    setSimuladoIniciado(false);
    setSimuladoFinalizado(false);
    setMostrarSomenteErros(false);
  }

  function alternarFavorita(questaoId: number) {
    setFavoritas((favoritasAtuais) => {
      const novasFavoritas = new Set(
        favoritasAtuais
      );

      if (novasFavoritas.has(questaoId)) {
        novasFavoritas.delete(questaoId);
      } else {
        novasFavoritas.add(questaoId);
      }

      salvarJSONLocal(
        CHAVE_FAVORITAS,
        Array.from(novasFavoritas)
      );

      window.dispatchEvent(
        new Event("cfs-pmesp-dados-atualizados")
      );

      return novasFavoritas;
    });
  }

  function alterarResultado(
    questaoId: number,
    acertou: boolean | null
  ) {
    if (simuladoFinalizado) {
      return;
    }

    setResultados((resultadosAtuais) => {
      const novosResultados = {
        ...resultadosAtuais,
      };

      if (acertou === null) {
        delete novosResultados[questaoId];
      } else {
        novosResultados[questaoId] = acertou;
      }

      return novosResultados;
    });
  }

  function concluirSimulado() {
    if (!todasRespondidas || simuladoFinalizado) {
      return;
    }

    const concluidoEm = new Date().toISOString();

    const resultadosGlobais =
      lerJSONLocal<
        Record<string, ResultadoGlobalSalvo>
      >(CHAVE_RESULTADOS, {});

    for (const questao of questoesSimulado) {
      resultadosGlobais[String(questao.id)] = {
        acertou: Boolean(resultados[questao.id]),
        disciplina: questao.disciplina,
        respondidaEm: concluidoEm,
      };
    }

    salvarJSONLocal(
      CHAVE_RESULTADOS,
      resultadosGlobais
    );

    const simuladosSalvos =
      lerJSONLocal<SimuladoSalvo[]>(
        CHAVE_SIMULADOS,
        []
      );

    const tituloPartes = [
      prova || "Simulado personalizado",
      disciplina || null,
      ano || null,
    ].filter(Boolean);

    const novoSimulado: SimuladoSalvo = {
      id: criarIdSimulado(),
      titulo: tituloPartes.join(" · "),
      totalQuestoes: questoesSimulado.length,
      respondidas: estatisticas.respondidas,
      acertos: estatisticas.acertos,
      erros: estatisticas.erros,
      aproveitamento:
        estatisticas.aproveitamento,
      disciplina: disciplina || null,
      prova: prova || null,
      ano: ano ? Number(ano) : null,
      concluidoEm,
    };

    salvarJSONLocal(CHAVE_SIMULADOS, [
      novoSimulado,
      ...simuladosSalvos,
    ]);

    setSimuladoFinalizado(true);

    window.dispatchEvent(
      new Event("cfs-pmesp-dados-atualizados")
    );

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  if (carregandoAuth || !usuario) {
    return (
      <section
        style={{
          padding: "24px",
          borderRadius: "14px",
          background:
            "var(--app-surface, #1e293b)",
          border:
            "1px solid var(--app-border, #334155)",
        }}
      >
        <strong>Verificando acesso...</strong>
        <div
          style={{
            marginTop: "6px",
            color: "var(--app-text-secondary, #94a3b8)",
          }}
        >
          Validando sua sessão.
        </div>
      </section>
    );
  }

  if (carregando) {
    return (
      <section
        style={{
          padding: "24px",
          borderRadius: "14px",
          background:
            "var(--app-surface, #1e293b)",
          border:
            "1px solid var(--app-border, #334155)",
        }}
      >
        <strong>Carregando questões...</strong>
      </section>
    );
  }

  if (erro) {
    return (
      <section
        style={{
          padding: "16px",
          border: "1px solid #ef4444",
          borderRadius: "10px",
          background: "#450a0a",
          color: "#fecaca",
        }}
      >
        {erro}
      </section>
    );
  }

  return (
    <div
      style={{
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "28px" }}>
        <h2
          style={{
            margin: "0 0 8px",
            fontSize: "28px",
          }}
        >
          Simulados
        </h2>

        <p
          style={{
            margin: 0,
            color: "#94a3b8",
            lineHeight: 1.5,
          }}
        >
          Monte um simulado por disciplina, prova ou ano e
          salve o resultado no seu histórico.
        </p>
      </div>

      {!simuladoIniciado && (
        <section
          style={{
            padding: "24px",
            borderRadius: "14px",
            background:
              "var(--app-surface, #1e293b)",
            border:
              "1px solid var(--app-border, #334155)",
            display: "grid",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "16px",
            }}
          >
            <CampoSelecao
              id="prova"
              rotulo="Prova"
              valor={prova}
              aoAlterar={setProva}
              opcaoPadrao="Todas as provas"
              opcoes={provas.map((item) => ({
                valor: item,
                texto: item,
              }))}
            />

            <CampoSelecao
              id="ano"
              rotulo="Ano"
              valor={ano}
              aoAlterar={setAno}
              opcaoPadrao="Todos os anos"
              opcoes={anos.map((item) => ({
                valor: String(item),
                texto: String(item),
              }))}
            />

            <CampoSelecao
              id="disciplina"
              rotulo="Disciplina"
              valor={disciplina}
              aoAlterar={setDisciplina}
              opcaoPadrao="Todas as disciplinas"
              opcoes={disciplinas.map((item) => ({
                valor: item,
                texto: item,
              }))}
            />
          </div>

          <div>
            <label
              htmlFor="quantidade"
              style={{
                display: "block",
                marginBottom: "8px",
                fontWeight: 700,
              }}
            >
              Quantidade de questões
            </label>

            <input
              id="quantidade"
              type="number"
              min={1}
              max={Math.max(
                1,
                questoesDisponiveis.length
              )}
              value={quantidade}
              onChange={(event) =>
                setQuantidade(
                  Number(event.target.value)
                )
              }
              style={campoStyle}
            />
          </div>

          <div
            style={{
              padding: "14px",
              borderRadius: "9px",
              background:
                "var(--app-background, #0f172a)",
              border:
                "1px solid var(--app-border, #334155)",
              color: "#94a3b8",
            }}
          >
            <strong
              style={{
                color:
                  "var(--app-text, #ffffff)",
              }}
            >
              {questoesDisponiveis.length}
            </strong>{" "}
            questão(ões) disponível(is) para os filtros
            selecionados.
          </div>

          <button
            type="button"
            onClick={iniciarSimulado}
            disabled={
              questoesDisponiveis.length === 0
            }
            style={{
              ...botaoPrimarioStyle,
              opacity:
                questoesDisponiveis.length === 0
                  ? 0.5
                  : 1,
              cursor:
                questoesDisponiveis.length === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            Iniciar simulado
          </button>
        </section>
      )}

      {simuladoIniciado && (
        <>
          {simuladoFinalizado && (
            <section
              style={{
                marginBottom: "20px",
                padding: "20px",
                borderRadius: "14px",
                background:
                  estatisticas.aproveitamento >= 70
                    ? "#052e16"
                    : "#422006",
                border:
                  estatisticas.aproveitamento >= 70
                    ? "1px solid #22c55e"
                    : "1px solid #f59e0b",
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: "20px",
                  marginBottom: "6px",
                }}
              >
                Simulado concluído
              </strong>

              <span>
                Você acertou {estatisticas.acertos} de{" "}
                {questoesSimulado.length} questões (
                {estatisticas.aproveitamento}%).
              </span>
            </section>
          )}

          <section
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(150px, 1fr))",
              gap: "12px",
              marginBottom: "24px",
            }}
          >
            <Resumo
              titulo="Questões"
              valor={questoesSimulado.length}
            />
            <Resumo
              titulo="Respondidas"
              valor={estatisticas.respondidas}
            />
            <Resumo
              titulo="Acertos"
              valor={estatisticas.acertos}
            />
            <Resumo
              titulo="Erros"
              valor={estatisticas.erros}
            />
            <Resumo
              titulo="Aproveitamento"
              valor={`${estatisticas.aproveitamento}%`}
            />
          </section>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "10px",
              marginBottom: "24px",
            }}
          >
            {!simuladoFinalizado && (
              <button
                type="button"
                onClick={concluirSimulado}
                disabled={!todasRespondidas}
                style={{
                  ...botaoPrimarioStyle,
                  background: "#16a34a",
                  opacity: todasRespondidas ? 1 : 0.5,
                  cursor: todasRespondidas
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                {todasRespondidas
                  ? "Concluir e salvar resultado"
                  : `Responda as ${
                      questoesSimulado.length -
                      estatisticas.respondidas
                    } questão(ões) restante(s)`}
              </button>
            )}

            {simuladoFinalizado &&
              estatisticas.erros > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setMostrarSomenteErros(
                      (valorAtual) => !valorAtual
                    )
                  }
                  style={botaoSecundarioStyle}
                >
                  {mostrarSomenteErros
                    ? "Mostrar todas"
                    : "Revisar somente os erros"}
                </button>
              )}

            <button
              type="button"
              onClick={reiniciarSimulado}
              style={botaoPrimarioStyle}
            >
              Gerar novo simulado
            </button>

            <button
              type="button"
              onClick={encerrarSimulado}
              style={botaoSecundarioStyle}
            >
              Alterar configuração
            </button>
          </div>

          {mostrarSomenteErros &&
            questoesExibidas.length === 0 && (
              <section
                style={{
                  padding: "18px",
                  borderRadius: "12px",
                  background:
                    "var(--app-surface, #1e293b)",
                  border:
                    "1px solid var(--app-border, #334155)",
                  marginBottom: "20px",
                }}
              >
                Nenhuma questão errada para revisar.
              </section>
            )}

          <div
            style={{
              display: "grid",
              gap: "22px",
            }}
          >
            {questoesExibidas.map(
              (questao, indice) => (
                <QuestaoCard
                  key={questao.id}
                  questao={questao}
                  numero={indice + 1}
                  favorita={favoritas.has(
                    questao.id
                  )}
                  aoAlternarFavorita={
                    alternarFavorita
                  }
                  aoAlterarResultado={
                    alterarResultado
                  }
                />
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}

const campoStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  borderRadius: "9px",
  border: "1px solid var(--app-border, #475569)",
  background: "var(--app-background, #0f172a)",
  color: "var(--app-text, #e2e8f0)",
  boxSizing: "border-box",
};

const botaoPrimarioStyle: React.CSSProperties = {
  border: 0,
  borderRadius: "9px",
  padding: "12px 18px",
  fontWeight: 800,
  fontSize: "14px",
  cursor: "pointer",
  background: "#2563eb",
  color: "#ffffff",
};

const botaoSecundarioStyle: React.CSSProperties = {
  border: "1px solid var(--app-border, #475569)",
  borderRadius: "9px",
  padding: "11px 18px",
  fontWeight: 800,
  cursor: "pointer",
  background: "var(--app-background, #0f172a)",
  color: "var(--app-text, #e2e8f0)",
};

function CampoSelecao({
  id,
  rotulo,
  valor,
  aoAlterar,
  opcaoPadrao,
  opcoes,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  opcaoPadrao: string;
  opcoes: Array<{
    valor: string;
    texto: string;
  }>;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        style={{
          display: "block",
          marginBottom: "8px",
          fontWeight: 700,
        }}
      >
        {rotulo}
      </label>

      <select
        id={id}
        value={valor}
        onChange={(event) =>
          aoAlterar(event.target.value)
        }
        style={campoStyle}
      >
        <option value="">{opcaoPadrao}</option>

        {opcoes.map((opcao) => (
          <option
            key={opcao.valor}
            value={opcao.valor}
          >
            {opcao.texto}
          </option>
        ))}
      </select>
    </div>
  );
}

function Resumo({
  titulo,
  valor,
}: {
  titulo: string;
  valor: number | string;
}) {
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: "12px",
        background:
          "var(--app-surface, #1e293b)",
        border:
          "1px solid var(--app-border, #334155)",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: "13px",
          marginBottom: "6px",
        }}
      >
        {titulo}
      </div>

      <strong style={{ fontSize: "25px" }}>
        {valor}
      </strong>
    </div>
  );
}