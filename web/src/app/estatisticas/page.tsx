"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

interface QuestaoResumo {
  id: number;
  numero: number | null;
  disciplina: string | null;
  prova: string | null;
  ano: number | null;
}

interface ResultadoSalvo {
  acertou: boolean;
  disciplina?: string | null;
  respondidaEm?: string;
}

interface SimuladoSalvo {
  id: string;
  titulo?: string;
  totalQuestoes?: number;
  acertos?: number;
  erros?: number;
  aproveitamento?: number;
  disciplina?: string | null;
  prova?: string | null;
  ano?: number | null;
  concluidoEm?: string;
}

interface LinhaDesempenho {
  nome: string;
  respondidas: number;
  acertos: number;
  erros: number;
  aproveitamento: number;
}

const CHAVE_RESULTADOS = "cfs-pmesp-resultados";
const CHAVE_RESULTADOS_ANTIGA = "banco-resultados";
const CHAVE_SIMULADOS = "cfs-pmesp-simulados";

function normalizarParteChave(
  valor: string | number | null | undefined
): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function criarChaveEstavelQuestao(
  questao: Pick<QuestaoResumo, "prova" | "ano" | "numero">
): string {
  const prova = normalizarParteChave(
    questao.prova || "prova-nao-identificada"
  );
  const ano = normalizarParteChave(
    questao.ano || "ano-nao-identificado"
  );
  const numero = normalizarParteChave(
    questao.numero || "numero-nao-identificado"
  );

  return `v2|${prova}|${ano}|${numero}`;
}

const cardStyle: React.CSSProperties = {
  background: "var(--app-surface)",
  color: "var(--app-text)",
  border: "1px solid var(--app-border)",
  borderRadius: "14px",
  padding: "20px",
  transition:
    "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
};

const textoSecundario: React.CSSProperties = {
  color: "var(--app-text-secondary)",
  fontSize: "14px",
};

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

function normalizarResultados(
  valorAtual: Record<string, ResultadoSalvo>,
  valorAntigo: Record<string, boolean>,
  questoesPorId: Map<number, QuestaoResumo>
): Record<string, ResultadoSalvo> {
  const origem: Record<string, ResultadoSalvo> =
    Object.keys(valorAtual).length > 0
      ? valorAtual
      : Object.fromEntries(
          Object.entries(valorAntigo).map(
            ([chave, acertou]) => [
              chave,
              { acertou: Boolean(acertou) },
            ]
          )
        );

  const normalizados: Record<string, ResultadoSalvo> = {};

  for (const [chaveAtual, resultado] of Object.entries(
    origem
  )) {
    if (chaveAtual.startsWith("v2|")) {
      normalizados[chaveAtual] = resultado;
      continue;
    }

    const id = Number(chaveAtual);

    if (!Number.isFinite(id)) {
      continue;
    }

    const questao = questoesPorId.get(id);

    if (!questao) {
      continue;
    }

    normalizados[criarChaveEstavelQuestao(questao)] = {
      ...resultado,
      disciplina:
        resultado.disciplina ??
        questao.disciplina ??
        null,
    };
  }

  return normalizados;
}

function calcularAproveitamento(
  acertos: number,
  respondidas: number
): number {
  return respondidas > 0
    ? Math.round((acertos / respondidas) * 100)
    : 0;
}

function corDoAproveitamento(valor: number): string {
  if (valor >= 80) return "var(--app-success)";
  if (valor >= 60) return "var(--app-warning)";
  return "var(--app-danger)";
}

function formatarData(data?: string): string {
  if (!data) {
    return "Data não registrada";
  }

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return "Data não registrada";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(valor);
}

export default function Estatisticas() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const [questoes, setQuestoes] = useState<QuestaoResumo[]>([]);
  const [resultados, setResultados] = useState<
    Record<string, ResultadoSalvo>
  >({});
  const [simulados, setSimulados] = useState<SimuladoSalvo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!carregandoAuth && !usuario) {
      router.replace("/login");
    }
  }, [carregandoAuth, usuario, router]);

  useEffect(() => {
    if (carregandoAuth || !usuario) {
      return;
    }

    async function carregarDados() {
      setCarregando(true);
      setErro("");

      try {
        const { data, error } = await supabase
          .from("questoes")
          .select("id, numero, disciplina, prova, ano")
          .order("id", { ascending: true });

        if (error) {
          throw new Error(error.message);
        }

        const questoesCarregadas =
          (data ?? []) as QuestaoResumo[];

        const questoesPorId = new Map(
          questoesCarregadas.map((questao) => [
            questao.id,
            questao,
          ])
        );

        const resultadosAtuais = lerJSONLocal<
          Record<string, ResultadoSalvo>
        >(CHAVE_RESULTADOS, {});

        const resultadosAntigos = lerJSONLocal<
          Record<string, boolean>
        >(CHAVE_RESULTADOS_ANTIGA, {});

        setQuestoes(questoesCarregadas);
        setResultados(
          normalizarResultados(
            resultadosAtuais,
            resultadosAntigos,
            questoesPorId
          )
        );
        setSimulados(
          lerJSONLocal<SimuladoSalvo[]>(
            CHAVE_SIMULADOS,
            []
          )
        );
      } catch (erroCarregamento) {
        setErro(
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Não foi possível carregar as estatísticas."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarDados();

    function atualizarDadosLocais() {
      carregarDados();
    }

    window.addEventListener(
      "cfs-pmesp-dados-atualizados",
      atualizarDadosLocais
    );
    window.addEventListener("storage", atualizarDadosLocais);

    return () => {
      window.removeEventListener(
        "cfs-pmesp-dados-atualizados",
        atualizarDadosLocais
      );
      window.removeEventListener(
        "storage",
        atualizarDadosLocais
      );
    };
  }, [carregandoAuth, usuario]);

  const questoesPorId = useMemo(
    () =>
      new Map(
        questoes.map((questao) => [questao.id, questao])
      ),
    [questoes]
  );

  const questoesPorChave = useMemo(
    () =>
      new Map(
        questoes.map((questao) => [
          criarChaveEstavelQuestao(questao),
          questao,
        ])
      ),
    [questoes]
  );

  const resumo = useMemo(() => {
    const valores = Object.values(resultados);
    const respondidas = valores.length;
    const acertos = valores.filter(
      (resultado) => resultado.acertou
    ).length;
    const erros = respondidas - acertos;

    return {
      totalQuestoes: questoes.length,
      respondidas,
      acertos,
      erros,
      aproveitamento: calcularAproveitamento(
        acertos,
        respondidas
      ),
      simulados: simulados.length,
    };
  }, [questoes.length, resultados, simulados.length]);

  const desempenhoPorDisciplina = useMemo(() => {
    const mapa = new Map<
      string,
      { respondidas: number; acertos: number }
    >();

    for (const [chave, resultado] of Object.entries(
      resultados
    )) {
      const questao =
        questoesPorChave.get(chave) ??
        questoesPorId.get(Number(chave));
      const nome =
        resultado.disciplina?.trim() ||
        questao?.disciplina?.trim() ||
        "Não identificada";

      const atual = mapa.get(nome) ?? {
        respondidas: 0,
        acertos: 0,
      };

      atual.respondidas += 1;

      if (resultado.acertou) {
        atual.acertos += 1;
      }

      mapa.set(nome, atual);
    }

    return Array.from(mapa.entries())
      .map(([nome, dados]): LinhaDesempenho => {
        const erros = dados.respondidas - dados.acertos;

        return {
          nome,
          respondidas: dados.respondidas,
          acertos: dados.acertos,
          erros,
          aproveitamento: calcularAproveitamento(
            dados.acertos,
            dados.respondidas
          ),
        };
      })
      .sort(
        (a, b) =>
          a.aproveitamento - b.aproveitamento ||
          b.respondidas - a.respondidas
      );
  }, [resultados, questoesPorChave, questoesPorId]);

  const desempenhoPorProva = useMemo(() => {
    const mapa = new Map<
      string,
      { respondidas: number; acertos: number }
    >();

    for (const [chave, resultado] of Object.entries(
      resultados
    )) {
      const questao =
        questoesPorChave.get(chave) ??
        questoesPorId.get(Number(chave));
      const nome =
        questao?.prova?.trim() ||
        (questao?.ano ? `Prova ${questao.ano}` : "Prova não identificada");

      const atual = mapa.get(nome) ?? {
        respondidas: 0,
        acertos: 0,
      };

      atual.respondidas += 1;

      if (resultado.acertou) {
        atual.acertos += 1;
      }

      mapa.set(nome, atual);
    }

    return Array.from(mapa.entries())
      .map(([nome, dados]): LinhaDesempenho => ({
        nome,
        respondidas: dados.respondidas,
        acertos: dados.acertos,
        erros: dados.respondidas - dados.acertos,
        aproveitamento: calcularAproveitamento(
          dados.acertos,
          dados.respondidas
        ),
      }))
      .sort((a, b) => b.respondidas - a.respondidas);
  }, [resultados, questoesPorChave, questoesPorId]);

  const ultimosSimulados = useMemo(
    () =>
      [...simulados]
        .sort(
          (a, b) =>
            new Date(b.concluidoEm ?? 0).getTime() -
            new Date(a.concluidoEm ?? 0).getTime()
        )
        .slice(0, 5),
    [simulados]
  );

  if (carregandoAuth || !usuario) {
    return (
      <section style={cardStyle}>
        <strong>Verificando acesso...</strong>
        <span style={textoSecundario}>
          Validando sua sessão.
        </span>
      </section>
    );
  }

  if (carregando) {
    return (
      <section style={cardStyle}>
        <strong>Carregando estatísticas...</strong>
      </section>
    );
  }

  return (
    <main
      style={{
        display: "grid",
        gap: "22px",
        color: "var(--app-text)",
      }}
    >
      <header>
        <h1 style={{ margin: 0 }}>Estatísticas</h1>
        <p style={{ ...textoSecundario, marginBottom: 0 }}>
          Acompanhe seu desempenho no banco de questões e nos
          simulados.
        </p>
      </header>

      {erro && (
        <section
          style={{
            ...cardStyle,
            borderColor: "var(--app-danger)",
            color: "var(--app-danger-text)",
          }}
        >
          <strong>Erro ao carregar os dados</strong>
          <span>{erro}</span>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(170px, 1fr))",
          gap: "14px",
        }}
      >
        <ResumoCard
          titulo="Questões disponíveis"
          valor={resumo.totalQuestoes}
        />
        <ResumoCard
          titulo="Respondidas"
          valor={resumo.respondidas}
        />
        <ResumoCard
          titulo="Acertos"
          valor={resumo.acertos}
          cor="var(--app-success-text)"
        />
        <ResumoCard
          titulo="Erros"
          valor={resumo.erros}
          cor="var(--app-danger-text)"
        />
        <ResumoCard
          titulo="Aproveitamento"
          valor={`${resumo.aproveitamento}%`}
          cor={corDoAproveitamento(resumo.aproveitamento)}
        />
        <ResumoCard
          titulo="Simulados concluídos"
          valor={resumo.simulados}
          cor="var(--app-primary)"
        />
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "18px",
        }}
      >
        <PainelDesempenho
          titulo="Desempenho por disciplina"
          subtitulo="Da menor para a maior taxa de acertos."
          itens={desempenhoPorDisciplina}
        />

        <PainelDesempenho
          titulo="Desempenho por prova"
          subtitulo="Resultados agrupados por prova importada."
          itens={desempenhoPorProva}
        />
      </section>

      <section style={cardStyle}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px" }}>
            Histórico de simulados
          </h2>
          <p style={{ ...textoSecundario, marginBottom: 0 }}>
            Últimos simulados concluídos neste navegador.
          </p>
        </div>

        {ultimosSimulados.length === 0 ? (
          <EstadoVazio>
            Nenhum simulado concluído até o momento.
          </EstadoVazio>
        ) : (
          <div style={{ display: "grid", gap: "10px" }}>
            {ultimosSimulados.map((simulado) => {
              const total = simulado.totalQuestoes ?? 0;
              const acertos = simulado.acertos ?? 0;
              const erros =
                simulado.erros ?? Math.max(0, total - acertos);
              const aproveitamento =
                simulado.aproveitamento ??
                calcularAproveitamento(acertos, total);

              return (
                <article
                  key={simulado.id}
                  style={{
                    background: "var(--app-surface-secondary)",
                    border: "1px solid var(--app-border)",
                    borderRadius: "10px",
                    padding: "14px",
                    display: "grid",
                    gap: "7px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                    }}
                  >
                    <strong>
                      {simulado.titulo || "Simulado"}
                    </strong>
                    <strong
                      style={{
                        color:
                          corDoAproveitamento(aproveitamento),
                      }}
                    >
                      {aproveitamento}%
                    </strong>
                  </div>

                  <span style={textoSecundario}>
                    {acertos} acerto(s), {erros} erro(s),{" "}
                    {total} questão(ões)
                  </span>

                  <span
                    style={{
                      ...textoSecundario,
                      fontSize: "12px",
                    }}
                  >
                    {formatarData(simulado.concluidoEm)}
                  </span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function ResumoCard({
  titulo,
  valor,
  cor = "var(--app-text)",
}: {
  titulo: string;
  valor: number | string;
  cor?: string;
}) {
  return (
    <article style={cardStyle}>
      <span style={textoSecundario}>{titulo}</span>
      <strong style={{ fontSize: "30px", color: cor }}>
        {valor}
      </strong>
    </article>
  );
}

function PainelDesempenho({
  titulo,
  subtitulo,
  itens,
}: {
  titulo: string;
  subtitulo: string;
  itens: LinhaDesempenho[];
}) {
  return (
    <section style={cardStyle}>
      <div>
        <h2 style={{ margin: 0, fontSize: "20px" }}>
          {titulo}
        </h2>
        <p style={{ ...textoSecundario, marginBottom: 0 }}>
          {subtitulo}
        </p>
      </div>

      {itens.length === 0 ? (
        <EstadoVazio>
          Responda algumas questões para gerar este relatório.
        </EstadoVazio>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          {itens.map((item) => (
            <article
              key={item.nome}
              style={{
                background: "var(--app-surface-secondary)",
                border: "1px solid var(--app-border)",
                borderRadius: "10px",
                padding: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  marginBottom: "9px",
                }}
              >
                <strong>{item.nome}</strong>
                <strong
                  style={{
                    color: corDoAproveitamento(
                      item.aproveitamento
                    ),
                  }}
                >
                  {item.aproveitamento}%
                </strong>
              </div>

              <div
                style={{
                  height: "9px",
                  background: "var(--app-surface)",
                  borderRadius: "999px",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${item.aproveitamento}%`,
                    height: "100%",
                    background: corDoAproveitamento(
                      item.aproveitamento
                    ),
                  }}
                />
              </div>

              <div
                style={{
                  ...textoSecundario,
                  marginTop: "8px",
                  fontSize: "12px",
                }}
              >
                {item.acertos} acerto(s), {item.erros} erro(s),{" "}
                {item.respondidas} respondida(s)
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function EstadoVazio({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "var(--app-surface-secondary)",
        border: "1px dashed var(--app-border)",
        borderRadius: "10px",
        padding: "18px",
        color: "var(--app-text-secondary)",
      }}
    >
      {children}
    </div>
  );
}