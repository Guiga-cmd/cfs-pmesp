"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

interface QuestaoResumo {
  id: number;
  disciplina: string | null;
}

interface ProvaResumo {
  id: number;
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
  concluidoEm?: string;
}

interface HistoricoItem {
  id: string;
  titulo: string;
  descricao: string;
  data: string;
}

interface ConfiguracoesSalvas {
  nomeUsuario?: string;
  metaDiariaQuestoes?: number;
}

const CHAVE_RESULTADOS = "cfs-pmesp-resultados";
const CHAVE_FAVORITAS = "cfs-pmesp-favoritas";
const CHAVE_SIMULADOS = "cfs-pmesp-simulados";
const CHAVE_CONFIGURACOES = "cfs-pmesp-configuracoes";
const CHAVE_HISTORICO = "cfs-pmesp-historico";

const cardStyle: React.CSSProperties = {
  background: "var(--app-surface)",
  color: "var(--app-text)",
  border: "1px solid var(--app-border)",
  borderRadius: "14px",
  padding: "22px",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  transition:
    "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
};

const labelStyle: React.CSSProperties = {
  color: "var(--app-text-secondary)",
  fontSize: "14px",
};

function lerJSONLocal<T>(chave: string, valorPadrao: T): T {
  if (typeof window === "undefined") {
    return valorPadrao;
  }

  try {
    const valor = window.localStorage.getItem(chave);

    if (!valor) {
      return valorPadrao;
    }

    return JSON.parse(valor) as T;
  } catch {
    return valorPadrao;
  }
}

function ehHoje(data?: string): boolean {
  if (!data) {
    return false;
  }

  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return false;
  }

  const hoje = new Date();

  return (
    valor.getFullYear() === hoje.getFullYear() &&
    valor.getMonth() === hoje.getMonth() &&
    valor.getDate() === hoje.getDate()
  );
}

function formatarData(data: string): string {
  const valor = new Date(data);

  if (Number.isNaN(valor.getTime())) {
    return data;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(valor);
}

export default function Home() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const [questoes, setQuestoes] = useState<QuestaoResumo[]>([]);
  const [provas, setProvas] = useState<ProvaResumo[]>([]);
  const [resultados, setResultados] = useState<
    Record<string, ResultadoSalvo>
  >({});
  const [favoritas, setFavoritas] = useState<number[]>([]);
  const [simulados, setSimulados] = useState<SimuladoSalvo[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [nomeUsuario, setNomeUsuario] = useState("Guilherme");
  const [metaDiaria, setMetaDiaria] = useState(20);
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

    async function carregarDashboard() {
      setCarregando(true);
      setErro("");

      try {
        const [respostaQuestoes, respostaProvas] =
          await Promise.all([
            supabase
              .from("questoes")
              .select("id, disciplina")
              .order("id", { ascending: true }),
            supabase
              .from("provas")
              .select("id")
              .order("id", { ascending: true }),
          ]);

        if (respostaQuestoes.error) {
          throw new Error(
            `Erro ao carregar questões: ${respostaQuestoes.error.message}`
          );
        }

        if (respostaProvas.error) {
          throw new Error(
            `Erro ao carregar provas: ${respostaProvas.error.message}`
          );
        }

        setQuestoes(
          (respostaQuestoes.data ?? []) as QuestaoResumo[]
        );
        setProvas((respostaProvas.data ?? []) as ProvaResumo[]);

        setResultados(
          lerJSONLocal<Record<string, ResultadoSalvo>>(
            CHAVE_RESULTADOS,
            {}
          )
        );
        setFavoritas(
          lerJSONLocal<number[]>(CHAVE_FAVORITAS, [])
        );
        setSimulados(
          lerJSONLocal<SimuladoSalvo[]>(CHAVE_SIMULADOS, [])
        );
        setHistorico(
          lerJSONLocal<HistoricoItem[]>(CHAVE_HISTORICO, [])
        );

        const configuracoes = lerJSONLocal<ConfiguracoesSalvas>(
          CHAVE_CONFIGURACOES,
          {}
        );

        const nomeSalvo = configuracoes.nomeUsuario?.trim();

        setNomeUsuario(nomeSalvo || "Guilherme");

        const metaSalva = Number(
          configuracoes.metaDiariaQuestoes ?? 20
        );

        setMetaDiaria(
          Number.isFinite(metaSalva) && metaSalva > 0
            ? Math.round(metaSalva)
            : 20
        );
      } catch (erroCarregamento) {
        setErro(
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Não foi possível carregar o Dashboard."
        );
      } finally {
        setCarregando(false);
      }
    }

    carregarDashboard();
  }, [carregandoAuth, usuario]);

  const estatisticas = useMemo(() => {
    const valores = Object.values(resultados);
    const respondidas = valores.length;
    const acertos = valores.filter(
      (resultado) => resultado.acertou
    ).length;
    const erros = respondidas - acertos;
    const taxaAcertos =
      respondidas > 0
        ? Math.round((acertos / respondidas) * 100)
        : 0;
    const respondidasHoje = valores.filter((resultado) =>
      ehHoje(resultado.respondidaEm)
    ).length;

    return {
      totalQuestoes: questoes.length,
      totalProvas: provas.length,
      respondidas,
      acertos,
      erros,
      taxaAcertos,
      simulados: simulados.length,
      favoritas: favoritas.length,
      metaDiaria,
      respondidasHoje,
    };
  }, [
    questoes.length,
    provas.length,
    resultados,
    simulados.length,
    favoritas.length,
    metaDiaria,
  ]);

  const progressoMeta = Math.min(
    100,
    estatisticas.metaDiaria > 0
      ? Math.round(
          (estatisticas.respondidasHoje /
            estatisticas.metaDiaria) *
            100
        )
      : 0
  );

  const desempenhoPorDisciplina = useMemo(() => {
    const mapa = new Map<
      string,
      { respondidas: number; acertos: number }
    >();

    for (const resultado of Object.values(resultados)) {
      const disciplina =
        resultado.disciplina?.trim() || "Não identificada";

      const atual = mapa.get(disciplina) ?? {
        respondidas: 0,
        acertos: 0,
      };

      atual.respondidas += 1;

      if (resultado.acertou) {
        atual.acertos += 1;
      }

      mapa.set(disciplina, atual);
    }

    return Array.from(mapa.entries())
      .map(([disciplina, dados]) => ({
        disciplina,
        respondidas: dados.respondidas,
        acertos: dados.acertos,
        aproveitamento:
          dados.respondidas > 0
            ? Math.round(
                (dados.acertos / dados.respondidas) * 100
              )
            : 0,
      }))
      .sort((a, b) => b.respondidas - a.respondidas)
      .slice(0, 6);
  }, [resultados]);

  const atividadesRecentes = useMemo(() => {
    const atividades = [...historico];

    for (const simulado of simulados) {
      if (!simulado.concluidoEm) {
        continue;
      }

      atividades.push({
        id: `simulado-${simulado.id}`,
        titulo: simulado.titulo || "Simulado concluído",
        descricao: `${simulado.acertos ?? 0} acerto(s) em ${
          simulado.totalQuestoes ?? 0
        } questão(ões).`,
        data: simulado.concluidoEm,
      });
    }

    return atividades
      .filter((item) => Boolean(item.data))
      .sort(
        (a, b) =>
          new Date(b.data).getTime() -
          new Date(a.data).getTime()
      )
      .slice(0, 6);
  }, [historico, simulados]);

  if (carregandoAuth || !usuario) {
    return (
      <section style={cardStyle}>
        <strong>Verificando acesso...</strong>
        <span style={labelStyle}>
          Validando sua sessão.
        </span>
      </section>
    );
  }

  if (carregando) {
    return (
      <section style={cardStyle}>
        <strong>Carregando Dashboard...</strong>
        <span style={labelStyle}>
          Buscando questões, provas e histórico de estudo.
        </span>
      </section>
    );
  }

  return (
    <>
      <section
        style={{
          marginBottom: "28px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "18px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: "28px",
              color: "var(--app-text)",
            }}
          >
            Bem-vindo, {nomeUsuario}
          </h2>

          <p style={{ color: "var(--app-text-secondary)", marginBottom: 0 }}>
            Acompanhe sua evolução e mantenha o ritmo de estudos.
          </p>
        </div>

        <Link
          href="/banco"
          style={{
            background: "var(--app-primary)",
            color: "var(--app-primary-text)",
            textDecoration: "none",
            padding: "12px 18px",
            borderRadius: "9px",
            fontWeight: 800,
          }}
        >
          Começar a estudar
        </Link>
      </section>

      {erro && (
        <section
          style={{
            ...cardStyle,
            borderColor: "var(--app-danger)",
            marginBottom: "24px",
          }}
        >
          <strong>Não foi possível carregar tudo.</strong>
          <span style={labelStyle}>{erro}</span>
        </section>
      )}

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(190px, 1fr))",
          gap: "16px",
          marginBottom: "26px",
        }}
      >
        <ResumoCard
          rotulo="Questões disponíveis"
          valor={estatisticas.totalQuestoes}
          detalhe={`${estatisticas.totalProvas} prova(s) importada(s)`}
        />
        <ResumoCard
          rotulo="Questões respondidas"
          valor={estatisticas.respondidas}
          detalhe={`${estatisticas.acertos} acerto(s) e ${estatisticas.erros} erro(s)`}
        />
        <ResumoCard
          rotulo="Taxa de acertos"
          valor={`${estatisticas.taxaAcertos}%`}
          detalhe="Desempenho geral"
          destaque="var(--app-success-text)"
        />
        <ResumoCard
          rotulo="Simulados realizados"
          valor={estatisticas.simulados}
          detalhe="Histórico salvo neste navegador"
          destaque="var(--app-primary)"
        />
        <ResumoCard
          rotulo="Questões favoritas"
          valor={estatisticas.favoritas}
          detalhe="Lista para revisão"
          destaque="var(--app-warning-text)"
        />
      </section>

      <section style={{ ...cardStyle, marginBottom: "26px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h3 style={{ margin: 0 }}>Meta diária</h3>
            <p style={{ ...labelStyle, marginBottom: 0 }}>
              {estatisticas.respondidasHoje} de{" "}
              {estatisticas.metaDiaria} questão(ões) respondida(s)
              hoje.
            </p>
          </div>

          <strong
            style={{
              fontSize: "26px",
              color:
                progressoMeta >= 100
                  ? "var(--app-success-text)"
                  : "var(--app-primary)",
            }}
          >
            {progressoMeta}%
          </strong>
        </div>

        <div
          style={{
            height: "12px",
            background: "var(--app-surface-secondary)",
            border: "1px solid var(--app-border)",
            borderRadius: "999px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${progressoMeta}%`,
              height: "100%",
              background:
                progressoMeta >= 100
                  ? "var(--app-success)"
                  : "var(--app-primary)",
              transition: "width 0.25s ease",
            }}
          />
        </div>
      </section>

      <section
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "20px",
          marginBottom: "26px",
        }}
      >
        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0 }}>Desempenho por matéria</h3>
            <p style={{ ...labelStyle, marginBottom: 0 }}>
              Matérias com respostas registradas.
            </p>
          </div>

          {desempenhoPorDisciplina.length === 0 ? (
            <EstadoVazio>
              Responda questões para liberar as estatísticas por
              matéria.
            </EstadoVazio>
          ) : (
            desempenhoPorDisciplina.map((item) => (
              <div
                key={item.disciplina}
                style={{
                  background: "var(--app-surface-secondary)",
                  border: "1px solid var(--app-border)",
                  borderRadius: "10px",
                  padding: "13px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    marginBottom: "8px",
                  }}
                >
                  <strong>{item.disciplina}</strong>
                  <span style={{ color: "var(--app-primary)" }}>
                    {item.aproveitamento}%
                  </span>
                </div>

                <div
                  style={{
                    height: "8px",
                    background: "var(--app-surface)",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${item.aproveitamento}%`,
                      height: "100%",
                      background: "var(--app-primary)",
                    }}
                  />
                </div>

                <div
                  style={{
                    ...labelStyle,
                    marginTop: "7px",
                    fontSize: "12px",
                  }}
                >
                  {item.acertos} acerto(s) em {item.respondidas}{" "}
                  resposta(s)
                </div>
              </div>
            ))
          )}
        </div>

        <div style={cardStyle}>
          <div>
            <h3 style={{ margin: 0 }}>Atividade recente</h3>
            <p style={{ ...labelStyle, marginBottom: 0 }}>
              Últimos estudos registrados.
            </p>
          </div>

          {atividadesRecentes.length === 0 ? (
            <EstadoVazio>
              Você ainda não respondeu questões nem concluiu
              simulados.
            </EstadoVazio>
          ) : (
            atividadesRecentes.map((atividade) => (
              <div
                key={atividade.id}
                style={{
                  background: "var(--app-surface-secondary)",
                  border: "1px solid var(--app-border)",
                  borderRadius: "10px",
                  padding: "13px",
                }}
              >
                <strong>{atividade.titulo}</strong>
                <div
                  style={{
                    color: "var(--app-text-secondary)",
                    marginTop: "5px",
                    fontSize: "14px",
                  }}
                >
                  {atividade.descricao}
                </div>
                <div
                  style={{
                    ...labelStyle,
                    fontSize: "12px",
                    marginTop: "7px",
                  }}
                >
                  {formatarData(atividade.data)}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section style={cardStyle}>
        <h3 style={{ margin: 0 }}>Acesso rápido</h3>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
          }}
        >
          <Atalho
            href="/banco"
            titulo="📚 Banco de Questões"
            descricao="Responder e favoritar questões."
          />
          <Atalho
            href="/simulados"
            titulo="📝 Simulados"
            descricao="Criar provas e acompanhar resultados."
          />
          <Atalho
            href="/estatisticas"
            titulo="📊 Estatísticas"
            descricao="Analisar desempenho por matéria."
          />
          <Atalho
            href="/importar"
            titulo="📄 Importar PDF"
            descricao="Adicionar novas provas ao banco."
          />
        </div>
      </section>
    </>
  );
}

function ResumoCard({
  rotulo,
  valor,
  detalhe,
  destaque = "var(--app-text)",
}: {
  rotulo: string;
  valor: number | string;
  detalhe: string;
  destaque?: string;
}) {
  return (
    <div style={cardStyle}>
      <span style={labelStyle}>{rotulo}</span>
      <strong style={{ fontSize: "32px", color: destaque }}>
        {valor}
      </strong>
      <span style={{ ...labelStyle, fontSize: "12px" }}>
        {detalhe}
      </span>
    </div>
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
        lineHeight: 1.5,
      }}
    >
      {children}
    </div>
  );
}

function Atalho({
  href,
  titulo,
  descricao,
}: {
  href: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "var(--app-surface-secondary)",
        border: "1px solid var(--app-border)",
        borderRadius: "10px",
        padding: "15px",
        color: "var(--app-text)",
        textDecoration: "none",
        transition:
          "background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease",
      }}
    >
      <strong>{titulo}</strong>
      <div
        style={{
          color: "var(--app-text-secondary)",
          fontSize: "13px",
          marginTop: "6px",
          lineHeight: 1.4,
        }}
      >
        {descricao}
      </div>
    </Link>
  );
}