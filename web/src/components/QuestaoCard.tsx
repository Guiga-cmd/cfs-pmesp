"use client";

import { useEffect, useMemo, useState } from "react";

export interface ApoioBanco {
  id: number;
  tipo: string;
  titulo: string | null;
  conteudo: string;
  pagina_inicial: number | null;
  pagina_final: number | null;
}

export interface ImagemBanco {
  id: number;
  tipo: string;
  pagina: number;
  ordem: number;
  caminho_storage: string;
  descricao: string | null;
  largura: number | null;
  altura: number | null;
  url_publica?: string;
}

export interface QuestaoBanco {
  id: number;
  numero?: number | null;
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
  apoios: ApoioBanco[];
  imagens?: ImagemBanco[];
}

interface QuestaoCardProps {
  questao: QuestaoBanco;
  numero: number;
  favorita: boolean;
  aoAlternarFavorita: (questaoId: number) => void;
  aoAlterarResultado?: (
    questaoId: number,
    acertou: boolean | null
  ) => void;
}

type LetraAlternativa = "A" | "B" | "C" | "D" | "E";

const CHAVE_CACHE_IA = "cfs-pmesp-cache-explicacoes-ia";

interface CacheExplicacaoIA {
  explicacao: string;
  geradaEm: string;
}

function normalizarParteChave(valor: string | number | null | undefined): string {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function criarChaveEstavelIA(
  questao: QuestaoBanco,
  numeroExibido: number
): string {
  const prova = normalizarParteChave(
    questao.prova || "prova-nao-identificada"
  );
  const ano = normalizarParteChave(
    questao.ano || "ano-nao-identificado"
  );
  const numero = normalizarParteChave(
    questao.numero || numeroExibido
  );

  return `v2|${prova}|${ano}|${numero}`;
}

interface AlternativaItem {
  letra: LetraAlternativa;
  texto: string;
}

export default function QuestaoCard({
  questao,
  numero,
  favorita,
  aoAlternarFavorita,
  aoAlterarResultado,
}: QuestaoCardProps) {
  const [selecionada, setSelecionada] =
    useState<LetraAlternativa | null>(null);
  const [corrigida, setCorrigida] = useState(false);
  const [carregandoIA, setCarregandoIA] = useState(false);
  const [explicacaoIA, setExplicacaoIA] = useState("");
  const [erroIA, setErroIA] = useState("");
  const [explicacaoVindaDoCache, setExplicacaoVindaDoCache] =
    useState(false);

  const chaveEstavelIA = useMemo(
    () => criarChaveEstavelIA(questao, numero),
    [questao, numero]
  );

  useEffect(() => {
    try {
      const cacheSalvo = window.localStorage.getItem(
        CHAVE_CACHE_IA
      );

      if (!cacheSalvo) {
        return;
      }

      const cache = JSON.parse(cacheSalvo) as Record<
        string,
        CacheExplicacaoIA
      >;

      const itemEstavel = cache[chaveEstavelIA];
      const chaveAntiga = String(questao.id);
      const itemAntigo = cache[chaveAntiga];
      const itemEncontrado = itemEstavel || itemAntigo;

      if (!itemEncontrado?.explicacao?.trim()) {
        return;
      }

      setExplicacaoIA(itemEncontrado.explicacao.trim());
      setExplicacaoVindaDoCache(true);

      if (!itemEstavel && itemAntigo) {
        cache[chaveEstavelIA] = itemAntigo;
        delete cache[chaveAntiga];

        window.localStorage.setItem(
          CHAVE_CACHE_IA,
          JSON.stringify(cache)
        );
      }
    } catch (erroCache) {
      console.error(
        "Não foi possível carregar a explicação da IA:",
        erroCache
      );
    }
  }, [chaveEstavelIA, questao.id]);

  const respostaCorreta = normalizarResposta(
    questao.resposta_correta
  );

  const alternativas = useMemo<AlternativaItem[]>(() => {
    const itens: AlternativaItem[] = [
      { letra: "A", texto: questao.alternativa_a },
      { letra: "B", texto: questao.alternativa_b },
      { letra: "C", texto: questao.alternativa_c },
      { letra: "D", texto: questao.alternativa_d },
    ];

    if (questao.alternativa_e?.trim()) {
      itens.push({
        letra: "E",
        texto: questao.alternativa_e,
      });
    }

    return itens;
  }, [questao]);

  const acertou =
    corrigida &&
    selecionada !== null &&
    respostaCorreta !== null &&
    selecionada === respostaCorreta;

  function selecionar(letra: LetraAlternativa) {
    if (corrigida) {
      return;
    }

    setSelecionada(letra);
  }

  function corrigir() {
    if (!selecionada || !respostaCorreta) {
      return;
    }

    const respostaEstaCorreta =
      selecionada === respostaCorreta;

    setCorrigida(true);
    aoAlterarResultado?.(
      questao.id,
      respostaEstaCorreta
    );
  }

  function responderNovamente() {
    setSelecionada(null);
    setCorrigida(false);
    setErroIA("");
    aoAlterarResultado?.(questao.id, null);
  }

  function montarTextoQuestaoParaIA(): string {
    const apoios = questao.apoios
      .map((apoio, indice) => {
        const titulo = apoio.titulo?.trim() || apoio.tipo;

        return [
          `Material de apoio ${indice + 1}: ${titulo}`,
          apoio.conteudo.trim(),
        ].join("\n");
      })
      .filter(Boolean)
      .join("\n\n");

    const alternativasTexto = alternativas
      .map(
        (alternativa) =>
          `${alternativa.letra}) ${alternativa.texto.trim()}`
      )
      .join("\n");

    return [
      questao.prova ? `Prova: ${questao.prova}` : "",
      questao.ano ? `Ano: ${questao.ano}` : "",
      questao.disciplina
        ? `Disciplina: ${questao.disciplina}`
        : "",
      apoios,
      `Enunciado:\n${questao.enunciado.trim()}`,
      `Alternativas:\n${alternativasTexto}`,
      respostaCorreta
        ? `Gabarito oficial: ${respostaCorreta}`
        : "Gabarito oficial: indisponível",
      selecionada
        ? `Resposta marcada pelo aluno: ${selecionada}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  async function explicarComIA() {
    if (carregandoIA) {
      return;
    }

    setCarregandoIA(true);
    setErroIA("");
    setExplicacaoIA("");

    try {
      const respostaHttp = await fetch("/api/ia/explicar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questao: montarTextoQuestaoParaIA(),
        }),
      });

      const dados = (await respostaHttp.json()) as {
        explicacao?: string;
        erro?: string;
      };

      if (!respostaHttp.ok) {
        throw new Error(
          dados.erro || "Não foi possível gerar a explicação."
        );
      }

      if (!dados.explicacao?.trim()) {
        throw new Error("A IA não retornou uma explicação.");
      }

      const explicacaoGerada = dados.explicacao.trim();

      setExplicacaoIA(explicacaoGerada);
      setExplicacaoVindaDoCache(false);

      try {
        const cacheSalvo = window.localStorage.getItem(
          CHAVE_CACHE_IA
        );

        const cache = cacheSalvo
          ? (JSON.parse(cacheSalvo) as Record<
              string,
              CacheExplicacaoIA
            >)
          : {};

        cache[chaveEstavelIA] = {
          explicacao: explicacaoGerada,
          geradaEm: new Date().toISOString(),
        };

        delete cache[String(questao.id)];

        window.localStorage.setItem(
          CHAVE_CACHE_IA,
          JSON.stringify(cache)
        );
      } catch (erroCache) {
        console.error(
          "Não foi possível salvar a explicação da IA:",
          erroCache
        );
      }
    } catch (erroExplicacao) {
      setErroIA(
        erroExplicacao instanceof Error
          ? erroExplicacao.message
          : "Ocorreu um erro inesperado ao consultar a IA."
      );
    } finally {
      setCarregandoIA(false);
    }
  }

  return (
    <article
      style={{
        background: "#1e293b",
        borderRadius: "14px",
        padding: "24px",
      }}
    >
      <Cabecalho
        questao={questao}
        numero={numero}
        favorita={favorita}
        aoAlternarFavorita={() =>
          aoAlternarFavorita(questao.id)
        }
      />

      {questao.apoios.length > 0 && (
        <section
          style={{
            display: "grid",
            gap: "14px",
            marginBottom: "22px",
          }}
        >
          {questao.apoios.map((apoio) => (
            <MaterialApoio
              key={apoio.id}
              apoio={apoio}
            />
          ))}
        </section>
      )}

      {questao.imagens && questao.imagens.length > 0 && (
        <ConteudoVisual imagens={questao.imagens} />
      )}

      <p
        style={{
          color: "#e2e8f0",
          lineHeight: 1.7,
          whiteSpace: "pre-wrap",
          fontWeight: 400,
          marginBottom: 0,
        }}
      >
        <TextoFormatado texto={questao.enunciado} />
      </p>

      <div
        style={{
          display: "grid",
          gap: "10px",
          marginTop: "20px",
        }}
      >
        {alternativas.map((alternativa) => (
          <Alternativa
            key={alternativa.letra}
            questaoId={questao.id}
            letra={alternativa.letra}
            texto={alternativa.texto}
            selecionada={selecionada === alternativa.letra}
            corrigida={corrigida}
            correta={
              respostaCorreta === alternativa.letra
            }
            aoSelecionar={() =>
              selecionar(alternativa.letra)
            }
          />
        ))}
      </div>

      {!respostaCorreta && (
        <div
          style={{
            marginTop: "18px",
            padding: "13px 14px",
            borderRadius: "9px",
            border: "1px solid #d97706",
            background: "#451a03",
            color: "#fde68a",
            lineHeight: 1.5,
          }}
        >
          O gabarito desta questão ainda não está disponível.
        </div>
      )}

      {respostaCorreta && !corrigida && selecionada && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "18px",
          }}
        >
          <button
            type="button"
            onClick={corrigir}
            style={{
              border: 0,
              borderRadius: "9px",
              padding: "11px 20px",
              fontWeight: 800,
              fontSize: "14px",
              cursor: "pointer",
              background: "#2563eb",
              color: "#ffffff",
            }}
          >
            Corrigir
          </button>
        </div>
      )}

      {corrigida && respostaCorreta && selecionada && (
        <Resultado
          acertou={acertou}
          respostaSelecionada={selecionada}
          respostaCorreta={respostaCorreta}
          explicacao={questao.explicacao}
          carregandoIA={carregandoIA}
          explicacaoIA={explicacaoIA}
          explicacaoVindaDoCache={explicacaoVindaDoCache}
          erroIA={erroIA}
          aoExplicarComIA={explicarComIA}
          aoResponderNovamente={responderNovamente}
        />
      )}
    </article>
  );
}

function Cabecalho({
  questao,
  numero,
  favorita,
  aoAlternarFavorita,
}: {
  questao: QuestaoBanco;
  numero: number;
  favorita: boolean;
  aoAlternarFavorita: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
        marginBottom: "18px",
        flexWrap: "wrap",
      }}
    >
      <div>
        <span
          style={{
            color: "#60a5fa",
            fontSize: "14px",
          }}
        >
          Questão {numero}
          {questao.prova ? ` · ${questao.prova}` : ""}
          {questao.ano ? ` · ${questao.ano}` : ""}
        </span>

        <div
          style={{
            marginTop: "6px",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          {questao.disciplina ||
            "Disciplina não identificada"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
        }}
      >
        {questao.imagens && questao.imagens.length > 0 && (
          <span
            style={{
              background: "#1d4ed8",
              color: "#dbeafe",
              borderRadius: "999px",
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {questao.imagens.length} imagem(ns)
          </span>
        )}

        {questao.apoios.length > 0 && (
          <span
            style={{
              background: "#0f766e",
              color: "#ccfbf1",
              borderRadius: "999px",
              padding: "6px 10px",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            {questao.apoios.length} apoio(s)
          </span>
        )}

        <button
          type="button"
          onClick={aoAlternarFavorita}
          aria-label={
            favorita
              ? "Remover questão dos favoritos"
              : "Adicionar questão aos favoritos"
          }
          title={
            favorita
              ? "Remover dos favoritos"
              : "Adicionar aos favoritos"
          }
          style={{
            width: "34px",
            height: "34px",
            display: "grid",
            placeItems: "center",
            borderRadius: "9px",
            border: favorita
              ? "1px solid #f59e0b"
              : "1px solid #475569",
            background: favorita
              ? "rgba(245, 158, 11, 0.14)"
              : "#0f172a",
            color: favorita ? "#fbbf24" : "#94a3b8",
            fontSize: "22px",
            lineHeight: 1,
            cursor: "pointer",
            transition:
              "background 0.2s ease, border-color 0.2s ease, color 0.2s ease, transform 0.2s ease",
          }}
        >
          {favorita ? "★" : "☆"}
        </button>
      </div>
    </div>
  );
}

function MaterialApoio({ apoio }: { apoio: ApoioBanco }) {
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #0f766e",
        borderRadius: "12px",
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "12px",
          marginBottom: "12px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: "#5eead4",
              fontWeight: 800,
              fontSize: "14px",
            }}
          >
            Material de apoio
          </div>

          <h3
            style={{
              margin: "5px 0 0",
              color: "#f8fafc",
              fontSize: "17px",
            }}
          >
            {apoio.titulo || apoio.tipo}
          </h3>
        </div>

        <span
          style={{
            color: "#94a3b8",
            fontSize: "12px",
          }}
        >
          {formatarPaginas(apoio)}
        </span>
      </div>

      <div
        style={{
          color: "#cbd5e1",
          whiteSpace: "pre-wrap",
          lineHeight: 1.7,
          fontSize: "15px",
        }}
      >
        <TextoFormatado texto={apoio.conteudo} />
      </div>
    </div>
  );
}


function ConteudoVisual({
  imagens,
}: {
  imagens: ImagemBanco[];
}) {
  const [imagemAmpliada, setImagemAmpliada] =
    useState<ImagemBanco | null>(null);

  const imagensOrdenadas = [...imagens].sort((a, b) => {
    if (a.ordem !== b.ordem) {
      return a.ordem - b.ordem;
    }

    return a.pagina - b.pagina;
  });

  useEffect(() => {
    if (!imagemAmpliada) {
      return;
    }

    function fecharComEscape(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        setImagemAmpliada(null);
      }
    }

    document.addEventListener("keydown", fecharComEscape);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener(
        "keydown",
        fecharComEscape
      );
      document.body.style.overflow = "";
    };
  }, [imagemAmpliada]);

  return (
    <>
      <section
        style={{
          display: "grid",
          gap: "16px",
          marginBottom: "22px",
        }}
      >
        {imagensOrdenadas.map((imagem) => {
          const origem =
            imagem.url_publica || imagem.caminho_storage;

          const larguraOriginal =
            imagem.largura && imagem.largura > 0
              ? imagem.largura
              : undefined;

          return (
            <figure
              key={imagem.id}
              style={{
                margin: 0,
                border: "1px solid #334155",
                borderRadius: "12px",
                background: "#ffffff",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setImagemAmpliada(imagem)}
                aria-label="Ampliar conteúdo visual"
                title="Clique para ampliar"
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  width: "100%",
                  padding: "16px",
                  border: 0,
                  background: "#ffffff",
                  cursor: "zoom-in",
                }}
              >
                <img
                  src={origem}
                  alt={
                    imagem.descricao ||
                    `Conteúdo visual da página ${imagem.pagina}`
                  }
                  loading="lazy"
                  style={{
                    display: "block",
                    width: larguraOriginal
                      ? `min(100%, ${larguraOriginal}px)`
                      : "auto",
                    maxWidth: "100%",
                    height: "auto",
                    maxHeight: "620px",
                    objectFit: "contain",
                    background: "#ffffff",
                  }}
                />
              </button>

              <figcaption
                style={{
                  padding: "10px 12px",
                  borderTop: "1px solid #334155",
                  background: "#0f172a",
                  color: "#94a3b8",
                  fontSize: "12px",
                  lineHeight: 1.5,
                }}
              >
                {imagem.descricao ||
                  `Conteúdo visual preservado da página ${imagem.pagina}.`}
                <span
                  style={{
                    display: "block",
                    marginTop: "4px",
                    color: "#60a5fa",
                  }}
                >
                  Clique na imagem para ampliar.
                </span>
              </figcaption>
            </figure>
          );
        })}
      </section>

      {imagemAmpliada && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Conteúdo visual ampliado"
          onClick={() => setImagemAmpliada(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: "24px",
            background: "rgba(2, 6, 23, 0.92)",
          }}
        >
          <div
            onClick={(evento) => evento.stopPropagation()}
            style={{
              position: "relative",
              width: "min(96vw, 1400px)",
              height: "min(94vh, 1000px)",
              display: "flex",
              flexDirection: "column",
              borderRadius: "14px",
              overflow: "hidden",
              border: "1px solid #475569",
              background: "#ffffff",
              boxShadow:
                "0 24px 80px rgba(0, 0, 0, 0.55)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                padding: "12px 14px",
                background: "#0f172a",
                color: "#e2e8f0",
              }}
            >
              <span
                style={{
                  fontSize: "13px",
                  lineHeight: 1.4,
                }}
              >
                {imagemAmpliada.descricao ||
                  `Conteúdo visual da página ${imagemAmpliada.pagina}`}
              </span>

              <button
                type="button"
                onClick={() => setImagemAmpliada(null)}
                aria-label="Fechar imagem ampliada"
                title="Fechar"
                style={{
                  width: "36px",
                  height: "36px",
                  flexShrink: 0,
                  borderRadius: "9px",
                  border: "1px solid #475569",
                  background: "#1e293b",
                  color: "#ffffff",
                  fontSize: "22px",
                  cursor: "pointer",
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "auto",
                display: "grid",
                placeItems: "center",
                padding: "18px",
                background: "#ffffff",
              }}
            >
              <img
                src={
                  imagemAmpliada.url_publica ||
                  imagemAmpliada.caminho_storage
                }
                alt={
                  imagemAmpliada.descricao ||
                  `Conteúdo visual da página ${imagemAmpliada.pagina}`
                }
                style={{
                  display: "block",
                  width: "auto",
                  height: "auto",
                  maxWidth: "none",
                  maxHeight: "none",
                  objectFit: "contain",
                  background: "#ffffff",
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

interface AlternativaProps {
  questaoId: number;
  letra: LetraAlternativa;
  texto: string;
  selecionada: boolean;
  corrigida: boolean;
  correta: boolean;
  aoSelecionar: () => void;
}

function Alternativa({
  questaoId,
  letra,
  texto,
  selecionada,
  corrigida,
  correta,
  aoSelecionar,
}: AlternativaProps) {
  const estado = obterEstadoAlternativa({
    selecionada,
    corrigida,
    correta,
  });

  return (
    <label
      style={{
        background: estado.background,
        border: `1px solid ${estado.border}`,
        borderRadius: "9px",
        padding: "13px",
        color: estado.color,
        lineHeight: 1.5,
        cursor: corrigida ? "default" : "pointer",
        transition: "background 0.2s, border 0.2s",
      }}
    >
      <input
        type="radio"
        name={`questao-${questaoId}`}
        value={letra}
        checked={selecionada}
        onChange={aoSelecionar}
        disabled={corrigida}
        style={{
          marginRight: "10px",
          cursor: corrigida ? "default" : "pointer",
        }}
      />

      <strong>{letra})</strong>{" "}
      <TextoFormatado texto={texto} />

      {corrigida && correta && (
        <strong style={{ marginLeft: "10px" }}>
          ✓ Resposta correta
        </strong>
      )}

      {corrigida && selecionada && !correta && (
        <strong style={{ marginLeft: "10px" }}>
          ✕ Sua resposta
        </strong>
      )}
    </label>
  );
}

function Resultado({
  acertou,
  respostaSelecionada,
  respostaCorreta,
  explicacao,
  carregandoIA,
  explicacaoIA,
  explicacaoVindaDoCache,
  erroIA,
  aoExplicarComIA,
  aoResponderNovamente,
}: {
  acertou: boolean;
  respostaSelecionada: LetraAlternativa;
  respostaCorreta: LetraAlternativa;
  explicacao: string | null;
  carregandoIA: boolean;
  explicacaoIA: string;
  explicacaoVindaDoCache: boolean;
  erroIA: string;
  aoExplicarComIA: () => void;
  aoResponderNovamente: () => void;
}) {
  const temExplicacao = Boolean(explicacao?.trim());

  return (
    <section
      style={{
        marginTop: "18px",
        borderRadius: "10px",
        border: acertou
          ? "1px solid #22c55e"
          : "1px solid #ef4444",
        background: acertou ? "#052e16" : "#450a0a",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "14px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              color: acertou ? "#86efac" : "#fca5a5",
              fontWeight: 900,
              fontSize: "16px",
            }}
          >
            {acertou ? "✓ Você acertou!" : "✕ Você errou."}
          </div>

          <div
            style={{
              display: "flex",
              gap: "16px",
              flexWrap: "wrap",
              marginTop: "7px",
              color: acertou ? "#bbf7d0" : "#fecaca",
              fontSize: "14px",
            }}
          >
            <span>
              Sua resposta: <strong>{respostaSelecionada}</strong>
            </span>

            <span>
              Resposta correta: <strong>{respostaCorreta}</strong>
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={aoResponderNovamente}
          style={{
            background: "transparent",
            color: "#e2e8f0",
            border: "1px solid #64748b",
            borderRadius: "8px",
            padding: "8px 12px",
            fontWeight: 700,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          Responder novamente
        </button>
      </div>

      <div
        style={{
          marginTop: "12px",
          paddingTop: "12px",
          borderTop: "1px solid rgba(255,255,255,0.14)",
          color: "#cbd5e1",
          lineHeight: 1.6,
          fontSize: "14px",
        }}
      >
        {temExplicacao ? (
          <>
            <strong style={{ color: "#f8fafc" }}>Explicação: </strong>
            <span style={{ whiteSpace: "pre-wrap" }}>
              <TextoFormatado
                texto={explicacao?.trim() ?? ""}
              />
            </span>
          </>
        ) : (
          <span>Explicação oficial indisponível para esta questão.</span>
        )}
      </div>

      <div
        style={{
          marginTop: "14px",
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <button
          type="button"
          onClick={aoExplicarComIA}
          disabled={carregandoIA}
          style={{
            border: "1px solid #60a5fa",
            borderRadius: "9px",
            padding: "10px 16px",
            fontWeight: 800,
            fontSize: "14px",
            cursor: carregandoIA ? "not-allowed" : "pointer",
            background: carregandoIA ? "#475569" : "#1d4ed8",
            color: "#ffffff",
          }}
        >
          {carregandoIA
            ? "Gerando explicação..."
            : explicacaoIA
              ? "Gerar nova explicação"
              : "Explicar com IA"}
        </button>
      </div>

      {erroIA && (
        <div
          style={{
            marginTop: "14px",
            padding: "12px 14px",
            borderRadius: "9px",
            border: "1px solid #ef4444",
            background: "#450a0a",
            color: "#fecaca",
            lineHeight: 1.5,
          }}
        >
          {erroIA}
        </div>
      )}

      {explicacaoIA && (
        <div
          style={{
            marginTop: "14px",
            padding: "16px",
            borderRadius: "10px",
            border: "1px solid #3b82f6",
            background: "#0f172a",
            color: "#e2e8f0",
            lineHeight: 1.7,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              marginBottom: "10px",
            }}
          >
            <div
              style={{
                color: "#93c5fd",
                fontWeight: 900,
              }}
            >
              Explicação da IA
            </div>

            {explicacaoVindaDoCache && (
              <span
                style={{
                  color: "#86efac",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                Reutilizada sem novo custo
              </span>
            )}
          </div>

          <div style={{ whiteSpace: "pre-wrap" }}>
            {explicacaoIA}
          </div>

          <p
            style={{
              marginBottom: 0,
              marginTop: "14px",
              color: "#94a3b8",
              fontSize: "12px",
            }}
          >
            Explicação gerada por IA. Confira o gabarito e o
            material oficial em caso de dúvida.
          </p>
        </div>
      )}
    </section>
  );
}


/**
 * Renderiza marcação controlada de negrito no formato:
 * **texto**
 *
 * Não utiliza dangerouslySetInnerHTML. Todo o conteúdo continua
 * sendo tratado como texto pelo React, o que evita execução de
 * HTML ou scripts vindos de PDFs importados.
 *
 * Sequências escapadas como \*\* permanecem visíveis como **.
 */
function TextoFormatado({
  texto,
}: {
  texto: string;
}) {
  const partes: Array<{
    texto: string;
    negrito: boolean;
  }> = [];

  let atual = "";
  let negrito = false;
  let indice = 0;

  function adicionarParte() {
    if (!atual) {
      return;
    }

    partes.push({
      texto: atual,
      negrito,
    });

    atual = "";
  }

  while (indice < texto.length) {
    const possuiEscape =
      texto[indice] === "\\" &&
      texto.slice(indice, indice + 5) === "\\*\\*";

    if (possuiEscape) {
      atual += "**";
      indice += 5;
      continue;
    }

    const marcadorNegrito =
      texto[indice] === "*" &&
      texto[indice + 1] === "*";

    if (marcadorNegrito) {
      const possuiFechamento = texto.indexOf(
        "**",
        indice + 2
      );

      if (
        !negrito &&
        possuiFechamento === -1
      ) {
        atual += "**";
        indice += 2;
        continue;
      }

      adicionarParte();
      negrito = !negrito;
      indice += 2;
      continue;
    }

    atual += texto[indice];
    indice += 1;
  }

  adicionarParte();

  return (
    <>
      {partes.map((parte, parteIndice) =>
        parte.negrito ? (
          <strong
            key={parteIndice}
            style={{
              color: "#ffffff",
              fontWeight: 900,
              background: "rgba(250, 204, 21, 0.14)",
              borderRadius: "3px",
              padding: "0 2px",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {parte.texto}
          </strong>
        ) : (
          <span key={parteIndice}>
            {parte.texto}
          </span>
        )
      )}
    </>
  );
}

function obterEstadoAlternativa({
  selecionada,
  corrigida,
  correta,
}: {
  selecionada: boolean;
  corrigida: boolean;
  correta: boolean;
}) {
  if (corrigida && correta) {
    return {
      background: "#14532d",
      border: "#22c55e",
      color: "#dcfce7",
    };
  }

  if (corrigida && selecionada && !correta) {
    return {
      background: "#7f1d1d",
      border: "#ef4444",
      color: "#fee2e2",
    };
  }

  if (selecionada) {
    return {
      background: "#1d4ed8",
      border: "#60a5fa",
      color: "#ffffff",
    };
  }

  return {
    background: "#0f172a",
    border: "#334155",
    color: "#cbd5e1",
  };
}

function normalizarResposta(
  valor: string | null
): LetraAlternativa | null {
  if (!valor) {
    return null;
  }

  const letra = valor
    .trim()
    .toUpperCase()
    .replace(/[^A-E]/g, "")
    .charAt(0);

  if (
    letra === "A" ||
    letra === "B" ||
    letra === "C" ||
    letra === "D" ||
    letra === "E"
  ) {
    return letra;
  }

  return null;
}

function formatarPaginas(apoio: ApoioBanco): string {
  const inicial = apoio.pagina_inicial;
  const final = apoio.pagina_final;

  if (inicial === null && final === null) {
    return apoio.tipo;
  }

  if (
    inicial !== null &&
    (final === null || final === inicial)
  ) {
    return `Página ${inicial}`;
  }

  if (inicial !== null && final !== null) {
    return `Páginas ${inicial} a ${final}`;
  }

  return apoio.tipo;
}