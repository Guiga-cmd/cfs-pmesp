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

const CHAVE_RESULTADOS = "cfs-pmesp-resultados";
const CHAVE_RESULTADOS_ANTIGA = "banco-resultados";
const CHAVE_FAVORITAS = "cfs-pmesp-favoritas";

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
  questao: Pick<QuestaoBanco, "prova" | "ano" | "numero">
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

interface ResultadoPersistido {
  acertou: boolean;
  disciplina: string | null;
  respondidaEm: string;
}

interface QuestaoSemApoios {
  id: number;
  numero: number | null;
  prova_id: number;
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

export default function Banco() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const [questoes, setQuestoes] = useState<QuestaoBanco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [prova, setProva] = useState("");
  const [disciplina, setDisciplina] = useState("");
  const [resultados, setResultados] = useState<
    Record<string, boolean>
  >({});
  const [favoritas, setFavoritas] = useState<Set<string>>(
    () => new Set()
  );

  const [dadosLocaisCarregados, setDadosLocaisCarregados] =
    useState(false);
  const [dadosLocaisMigrados, setDadosLocaisMigrados] =
    useState(false);

  useEffect(() => {
    if (!carregandoAuth && !usuario) {
      router.replace("/login");
    }
  }, [carregandoAuth, usuario, router]);

  useEffect(() => {
    if (carregandoAuth || !usuario) {
      return;
    }

    try {
      const resultadosAtuais = window.localStorage.getItem(
        CHAVE_RESULTADOS
      );
      const resultadosAntigos = window.localStorage.getItem(
        CHAVE_RESULTADOS_ANTIGA
      );
      const favoritasSalvas = window.localStorage.getItem(
        CHAVE_FAVORITAS
      );

      const resultadosCarregados: Record<string, boolean> = {};

      if (resultadosAtuais) {
        const dados = JSON.parse(resultadosAtuais) as Record<
          string,
          ResultadoPersistido | boolean
        >;

        for (const [chave, valor] of Object.entries(dados)) {
          resultadosCarregados[chave] =
            typeof valor === "boolean"
              ? valor
              : Boolean(valor.acertou);
        }
      } else if (resultadosAntigos) {
        const dados = JSON.parse(resultadosAntigos) as Record<
          string,
          boolean
        >;

        for (const [chave, acertou] of Object.entries(dados)) {
          resultadosCarregados[chave] = Boolean(acertou);
        }
      }

      if (favoritasSalvas) {
        const chaves = JSON.parse(favoritasSalvas) as unknown;

        if (Array.isArray(chaves)) {
          setFavoritas(
            new Set(
              chaves
                .map((valor) => String(valor))
                .filter(Boolean)
            )
          );
        }
      }

      setResultados(resultadosCarregados);
    } catch (erroCarregamentoLocal) {
      console.error(
        "Não foi possível carregar o progresso local:",
        erroCarregamentoLocal
      );
    } finally {
      setDadosLocaisCarregados(true);
    }
  }, [carregandoAuth, usuario]);

  useEffect(() => {
    if (carregandoAuth || !usuario) {
      return;
    }

    async function carregarQuestoes() {
      setCarregando(true);
      setErro("");

      try {
        const { data: questoesData, error: questoesError } =
          await supabase
            .from("questoes")
            .select(
              `
                id,
                numero,
                prova_id,
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
            .order("prova_id", { ascending: true })
            .order("numero", { ascending: true })
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

        const { data: relacoesData, error: relacoesError } =
          await supabase
            .from("questao_apoios")
            .select("questao_id, apoio_id")
            .in("questao_id", idsQuestoes);

        if (relacoesError) {
          throw new Error(
            `Erro ao carregar relações entre questões e apoios: ${relacoesError.message}`
          );
        }

        const relacoes =
          (relacoesData ?? []) as RelacaoQuestaoApoio[];

        const idsApoios = Array.from(
          new Set(relacoes.map((relacao) => relacao.apoio_id))
        );

        let apoios: ApoioBanco[] = [];

        if (idsApoios.length > 0) {
          const { data: apoiosData, error: apoiosError } =
            await supabase
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
              `Erro ao carregar apoios: ${apoiosError.message}`
            );
          }

          apoios = (apoiosData ?? []) as ApoioBanco[];
        }

        const apoiosPorId = new Map(
          apoios.map((apoio) => [apoio.id, apoio])
        );

        const idsApoiosPorQuestao = new Map<number, number[]>();

        relacoes.forEach((relacao) => {
          const atuais =
            idsApoiosPorQuestao.get(relacao.questao_id) ?? [];

          atuais.push(relacao.apoio_id);
          idsApoiosPorQuestao.set(
            relacao.questao_id,
            atuais
          );
        });

        const { data: imagensData, error: imagensError } =
          await supabase
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
            .not("questao_id", "is", null)
            .order("questao_id", { ascending: true })
            .order("ordem", { ascending: true });

        if (imagensError) {
          throw new Error(
            `Erro ao carregar imagens das questões: ${imagensError.message}`
          );
        }

        const idsQuestoesAtuais = new Set(
          idsQuestoes.map((id) => Number(id))
        );

        const imagensSemUrl = (
          (imagensData ?? []) as ImagemSemUrl[]
        ).filter(
          (imagem) =>
            imagem.questao_id !== null &&
            idsQuestoesAtuais.has(Number(imagem.questao_id))
        );

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

          const questaoId = Number(imagem.questao_id);
          const imagensAtuais =
            imagensPorQuestao.get(questaoId) ?? [];

          imagensAtuais.push({
            id: Number(imagem.id),
            tipo: imagem.tipo,
            pagina: Number(imagem.pagina),
            ordem: Number(imagem.ordem),
            caminho_storage: imagem.caminho_storage,
            descricao: imagem.descricao,
            largura:
              imagem.largura === null
                ? null
                : Number(imagem.largura),
            altura:
              imagem.altura === null
                ? null
                : Number(imagem.altura),
            url_publica:
              urlsPorCaminho.get(imagem.caminho_storage) ??
              "",
          });

          imagensPorQuestao.set(
            questaoId,
            imagensAtuais
          );
        });

        const questoesComApoios: QuestaoBanco[] =
          questoesSemApoios.map((questao) => {
            const apoiosDaQuestao = (
              idsApoiosPorQuestao.get(questao.id) ?? []
            )
              .map((apoioId) => apoiosPorId.get(apoioId))
              .filter(
                (apoio): apoio is ApoioBanco =>
                  apoio !== undefined &&
                  !ehInstrucaoGeralDaProva(apoio)
              );

            return {
              ...questao,
              apoios: apoiosDaQuestao,
              imagens:
                imagensPorQuestao.get(Number(questao.id)) ??
                [],
            };
          });

        setQuestoes(questoesComApoios);
      } catch (erroCarregamento) {
        const mensagem =
          erroCarregamento instanceof Error
            ? erroCarregamento.message
            : "Ocorreu um erro inesperado ao carregar as questões.";

        setErro(mensagem);
        setQuestoes([]);
      } finally {
        setCarregando(false);
      }
    }

    carregarQuestoes();
  }, [carregandoAuth, usuario]);

  useEffect(() => {
    if (
      !dadosLocaisCarregados ||
      questoes.length === 0 ||
      dadosLocaisMigrados
    ) {
      return;
    }

    const questoesPorId = new Map(
      questoes.map((questao) => [
        String(questao.id),
        questao,
      ])
    );

    setResultados((atuais) => {
      const migrados: Record<string, boolean> = {};

      for (const [chaveAtual, acertou] of Object.entries(
        atuais
      )) {
        if (chaveAtual.startsWith("v2|")) {
          migrados[chaveAtual] = acertou;
          continue;
        }

        const questao = questoesPorId.get(chaveAtual);

        if (questao) {
          migrados[criarChaveEstavelQuestao(questao)] =
            acertou;
        }
      }

      return migrados;
    });

    setFavoritas((atuais) => {
      const migradas = new Set<string>();

      for (const chaveAtual of atuais) {
        if (chaveAtual.startsWith("v2|")) {
          migradas.add(chaveAtual);
          continue;
        }

        const questao = questoesPorId.get(chaveAtual);

        if (questao) {
          migradas.add(criarChaveEstavelQuestao(questao));
        }
      }

      return migradas;
    });

    setDadosLocaisMigrados(true);
  }, [
    dadosLocaisCarregados,
    dadosLocaisMigrados,
    questoes,
  ]);

  const provas = useMemo(() => {
    return Array.from(
      new Set(
        questoes
          .map((questao) => questao.prova)
          .filter(
            (valor): valor is string =>
              Boolean(valor && valor.trim())
          )
      )
    ).sort();
  }, [questoes]);

  const disciplinas = useMemo(() => {
    return Array.from(
      new Set(
        questoes
          .map((questao) => questao.disciplina)
          .filter(
            (valor): valor is string =>
              Boolean(valor && valor.trim())
          )
      )
    ).sort();
  }, [questoes]);

  const questoesFiltradas = useMemo(() => {
    return questoes.filter((questao) => {
      const correspondeProva =
        prova.length === 0 ||
        questao.prova === prova;

      const correspondeDisciplina =
        disciplina.length === 0 ||
        questao.disciplina === disciplina;

      return correspondeProva && correspondeDisciplina;
    });
  }, [questoes, prova, disciplina]);


  useEffect(() => {
    if (
      !dadosLocaisCarregados ||
      !dadosLocaisMigrados ||
      questoes.length === 0
    ) {
      return;
    }

    try {
      const questoesPorChave = new Map(
        questoes.map((questao) => [
          criarChaveEstavelQuestao(questao),
          questao,
        ])
      );

      const resultadosPersistidos: Record<
        string,
        ResultadoPersistido
      > = {};

      for (const [chave, acertou] of Object.entries(
        resultados
      )) {
        const questao = questoesPorChave.get(chave);

        resultadosPersistidos[chave] = {
          acertou,
          disciplina: questao?.disciplina ?? null,
          respondidaEm: new Date().toISOString(),
        };
      }

      window.localStorage.setItem(
        CHAVE_RESULTADOS,
        JSON.stringify(resultadosPersistidos)
      );

      window.localStorage.removeItem(
        CHAVE_RESULTADOS_ANTIGA
      );

      window.dispatchEvent(
        new Event("cfs-pmesp-dados-atualizados")
      );
    } catch (erroPersistencia) {
      console.error(
        "Não foi possível salvar os resultados:",
        erroPersistencia
      );
    }
  }, [
    resultados,
    questoes,
    dadosLocaisCarregados,
    dadosLocaisMigrados,
  ]);

  useEffect(() => {
    if (!dadosLocaisCarregados || !dadosLocaisMigrados) {
      return;
    }

    try {
      window.localStorage.setItem(
        CHAVE_FAVORITAS,
        JSON.stringify(Array.from(favoritas))
      );

      window.dispatchEvent(
        new Event("cfs-pmesp-dados-atualizados")
      );
    } catch (erroPersistencia) {
      console.error(
        "Não foi possível salvar as favoritas:",
        erroPersistencia
      );
    }
  }, [
    favoritas,
    dadosLocaisCarregados,
    dadosLocaisMigrados,
  ]);

  const estatisticas = useMemo(() => {
    const valores = Object.values(resultados);
    const respondidas = valores.length;
    const acertos = valores.filter(Boolean).length;
    const erros = respondidas - acertos;
    const aproveitamento =
      respondidas > 0
        ? Math.round((acertos / respondidas) * 100)
        : 0;
    const progresso =
      questoes.length > 0
        ? Math.round((respondidas / questoes.length) * 100)
        : 0;

    return {
      respondidas,
      acertos,
      erros,
      aproveitamento,
      progresso,
    };
  }, [resultados, questoes.length]);

  function obterChavePorId(
    questaoId: number
  ): string | null {
    const questao = questoes.find(
      (item) => item.id === questaoId
    );

    return questao
      ? criarChaveEstavelQuestao(questao)
      : null;
  }

  function alternarFavorita(questaoId: number) {
    const chave = obterChavePorId(questaoId);

    if (!chave) {
      return;
    }

    setFavoritas((atuais) => {
      const proximas = new Set(atuais);

      if (proximas.has(chave)) {
        proximas.delete(chave);
      } else {
        proximas.add(chave);
      }

      return proximas;
    });
  }

  function alterarResultado(
    questaoId: number,
    acertou: boolean | null
  ) {
    const chave = obterChavePorId(questaoId);

    if (!chave) {
      return;
    }

    setResultados((atuais) => {
      const proximos = { ...atuais };

      if (acertou === null) {
        delete proximos[chave];
      } else {
        proximos[chave] = acertou;
      }

      return proximos;
    });
  }

  if (carregandoAuth || !usuario) {
    return (
      <section
        style={{
          background: "#1e293b",
          borderRadius: "14px",
          padding: "24px",
        }}
      >
        <strong>Verificando acesso...</strong>
        <div
          style={{
            marginTop: "6px",
            color: "#94a3b8",
          }}
        >
          Validando sua sessão.
        </div>
      </section>
    );
  }

  return (
    <div>
      <section
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "26px" }}>
            Banco de Questões
          </h2>

          <p
            style={{
              marginTop: "8px",
              color: "#94a3b8",
            }}
          >
            Responda às questões e confira o resultado na hora.
          </p>
        </div>

        <div
          style={{
            background: "#1e293b",
            borderRadius: "8px",
            padding: "10px 14px",
            color: "#cbd5e1",
          }}
        >
          {questoesFiltradas.length} questão(ões)
        </div>
      </section>

      {!carregando && !erro && questoes.length > 0 && (
        <section
          style={{
            background: "#1e293b",
            borderRadius: "14px",
            padding: "18px 20px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns:
                "repeat(auto-fit, minmax(135px, 1fr))",
              gap: "12px",
            }}
          >
            <ResumoItem
              rotulo="Questões"
              valor={questoes.length}
            />
            <ResumoItem
              rotulo="Respondidas"
              valor={estatisticas.respondidas}
            />
            <ResumoItem
              rotulo="Acertos"
              valor={estatisticas.acertos}
              destaque="#86efac"
            />
            <ResumoItem
              rotulo="Erros"
              valor={estatisticas.erros}
              destaque="#fca5a5"
            />
            <ResumoItem
              rotulo="Aproveitamento"
              valor={`${estatisticas.aproveitamento}%`}
              destaque="#93c5fd"
            />
            <ResumoItem
              rotulo="Favoritas"
              valor={favoritas.size}
              destaque="#fbbf24"
            />
          </div>

          <div style={{ marginTop: "16px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                color: "#94a3b8",
                fontSize: "13px",
                marginBottom: "7px",
              }}
            >
              <span>Progresso da sessão</span>
              <span>
                {estatisticas.respondidas} / {questoes.length}
              </span>
            </div>

            <div
              style={{
                height: "10px",
                background: "#0f172a",
                borderRadius: "999px",
                overflow: "hidden",
                border: "1px solid #334155",
              }}
            >
              <div
                style={{
                  width: `${estatisticas.progresso}%`,
                  height: "100%",
                  background: "#2563eb",
                  borderRadius: "999px",
                  transition: "width 0.25s ease",
                }}
              />
            </div>
          </div>
        </section>
      )}

      <section
        style={{
          background: "#1e293b",
          borderRadius: "14px",
          padding: "20px",
          marginBottom: "24px",
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        <select
          value={prova}
          onChange={(event) => setProva(event.target.value)}
          style={{
            background: "#0f172a",
            color: "white",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "15px",
          }}
        >
          <option value="">Todas as provas</option>

          {provas.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>

        <select
          value={disciplina}
          onChange={(event) => setDisciplina(event.target.value)}
          style={{
            background: "#0f172a",
            color: "white",
            border: "1px solid #334155",
            borderRadius: "8px",
            padding: "12px",
            fontSize: "15px",
          }}
        >
          <option value="">Todas as disciplinas</option>

          {disciplinas.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </section>

      {carregando && (
        <section
          style={{
            background: "#1e293b",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          Carregando questões e apoios...
        </section>
      )}

      {erro && (
        <section
          style={{
            background: "#1e293b",
            border: "1px solid #ef4444",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          {erro}
        </section>
      )}

      {!carregando && !erro && questoesFiltradas.length === 0 && (
        <section
          style={{
            background: "#1e293b",
            borderRadius: "14px",
            padding: "24px",
          }}
        >
          Nenhuma questão encontrada.
        </section>
      )}

      {!carregando && !erro && questoesFiltradas.length > 0 && (
        <section
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
          }}
        >
          {questoesFiltradas.map((questao, indice) => (
            <QuestaoCard
              key={questao.id}
              questao={questao}
              numero={
                typeof questao.numero === "number" &&
                questao.numero > 0
                  ? questao.numero
                  : indice + 1
              }
              favorita={favoritas.has(
                criarChaveEstavelQuestao(questao)
              )}
              aoAlternarFavorita={alternarFavorita}
              aoAlterarResultado={alterarResultado}
            />
          ))}
        </section>
      )}
    </div>
  );
}


function ResumoItem({
  rotulo,
  valor,
  destaque = "#f8fafc",
}: {
  rotulo: string;
  valor: number | string;
  destaque?: string;
}) {
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: "10px",
        padding: "13px 14px",
      }}
    >
      <div
        style={{
          color: "#94a3b8",
          fontSize: "12px",
          marginBottom: "5px",
        }}
      >
        {rotulo}
      </div>

      <div
        style={{
          color: destaque,
          fontSize: "22px",
          fontWeight: 900,
        }}
      >
        {valor}
      </div>
    </div>
  );
}

function ehInstrucaoGeralDaProva(
  apoio: ApoioBanco
): boolean {
  const titulo = (apoio.titulo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const conteudo = apoio.conteudo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  const tituloDeInstrucao =
    titulo.includes("texto de apoio da questao 01");

  const possuiOrientacoesDeAplicacao =
    conteudo.includes("folha de respostas") &&
    conteudo.includes("duracao da prova");

  return tituloDeInstrucao && possuiOrientacoesDeAplicacao;
}