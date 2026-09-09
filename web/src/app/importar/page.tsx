"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v4 as uuid } from "uuid";

import { useAuth } from "@/components/AuthProvider";
import { extrairImagensDoPDF } from "@/lib/parserImagens";
import {
  aplicarGabaritoNasQuestoes,
  extrairGabarito,
} from "@/lib/parserGabarito";
import { extrairQuestoesDoPDF } from "@/lib/parserQuestoes";
import { extrairTextoPDF } from "@/lib/pdf";
import { supabase } from "@/lib/supabase";

import { importarApoios } from "@/services/apoios";
import { importarImagens } from "@/services/imagens";
import { importarQuestaoApoios } from "@/services/questaoApoios";
import {
  atualizarStatusProva,
  buscarProva,
  criarProva,
  excluirProvaCompleta,
  listarProvas,
} from "@/services/provas";
import {
  excluirQuestoesDaProva,
  importarQuestoes,
} from "@/services/questoes";

import type { ResultadoParserImagens } from "@/lib/parserImagens";
import type { ResultadoParserGabarito } from "@/lib/parserGabarito";
import type { ResultadoParserQuestoes } from "@/lib/parserQuestoes";
import type { PDFExtraido } from "@/lib/pdf";
import type { Prova } from "@/services/provas";

interface ConfiguracoesImportacao {
  mostrarAvisosImportacao?: boolean;
  confirmarAntesDeExcluir?: boolean;
}

const CHAVE_CONFIGURACOES = "cfs-pmesp-configuracoes";

function lerConfiguracoesImportacao(): Required<ConfiguracoesImportacao> {
  try {
    const valorSalvo = window.localStorage.getItem(
      CHAVE_CONFIGURACOES
    );

    if (!valorSalvo) {
      return {
        mostrarAvisosImportacao: true,
        confirmarAntesDeExcluir: true,
      };
    }

    const configuracoes = JSON.parse(
      valorSalvo
    ) as ConfiguracoesImportacao;

    return {
      mostrarAvisosImportacao:
        configuracoes.mostrarAvisosImportacao ?? true,
      confirmarAntesDeExcluir:
        configuracoes.confirmarAntesDeExcluir ?? true,
    };
  } catch (erro) {
    console.error(
      "Não foi possível carregar as configurações de importação:",
      erro
    );

    return {
      mostrarAvisosImportacao: true,
      confirmarAntesDeExcluir: true,
    };
  }
}

export default function Importar() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const ehAdministrador =
    usuario?.app_metadata?.role === "admin";

  const [nomeProva, setNomeProva] = useState(
    "CFS PMESP 2026"
  );
  const [anoProva, setAnoProva] = useState(2026);
  const [bancaProva, setBancaProva] = useState(
    "Não informada"
  );
  const [cargoProva, setCargoProva] = useState(
    "CFS PMESP"
  );
  const [disciplinaPadrao, setDisciplinaPadrao] =
    useState("Não identificada");

  const [arquivoProva, setArquivoProva] =
    useState<File | null>(null);
  const [arquivoGabarito, setArquivoGabarito] =
    useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const [pdfExtraido, setPdfExtraido] =
    useState<PDFExtraido | null>(null);

  const [resultadoParser, setResultadoParser] =
    useState<ResultadoParserQuestoes | null>(null);

  const [resultadoImagens, setResultadoImagens] =
    useState<ResultadoParserImagens | null>(null);

  const [resultadoGabarito, setResultadoGabarito] =
    useState<ResultadoParserGabarito | null>(null);

  const [provasImportadas, setProvasImportadas] = useState<Prova[]>([]);
  const [carregandoProvas, setCarregandoProvas] = useState(true);
  const [provaExcluindoId, setProvaExcluindoId] = useState<number | null>(null);
  const [mensagemProvas, setMensagemProvas] = useState("");
  const [mostrarAvisosImportacao, setMostrarAvisosImportacao] =
    useState(true);
  const [confirmarAntesDeExcluir, setConfirmarAntesDeExcluir] =
    useState(true);

  async function carregarProvasImportadas() {
    setCarregandoProvas(true);

    try {
      const provas = await listarProvas();
      setProvasImportadas(provas);
    } catch (erro) {
      console.error(erro);
      setMensagemProvas(
        erro instanceof Error
          ? erro.message
          : "Não foi possível carregar as provas importadas."
      );
    } finally {
      setCarregandoProvas(false);
    }
  }

  useEffect(() => {
    if (!carregandoAuth && !usuario) {
      router.replace("/login");
      return;
    }

    if (!carregandoAuth && usuario && !ehAdministrador) {
      router.replace("/");
    }
  }, [
    carregandoAuth,
    usuario,
    ehAdministrador,
    router,
  ]);

  useEffect(() => {
    if (
      carregandoAuth ||
      !usuario ||
      !ehAdministrador
    ) {
      return;
    }

    void carregarProvasImportadas();

    function aplicarConfiguracoes() {
      const configuracoes = lerConfiguracoesImportacao();

      setMostrarAvisosImportacao(
        configuracoes.mostrarAvisosImportacao
      );
      setConfirmarAntesDeExcluir(
        configuracoes.confirmarAntesDeExcluir
      );
    }

    aplicarConfiguracoes();

    function aoAlterarStorage(evento: StorageEvent) {
      if (
        evento.key === CHAVE_CONFIGURACOES ||
        evento.key === null
      ) {
        aplicarConfiguracoes();
      }
    }

    window.addEventListener("storage", aoAlterarStorage);
    window.addEventListener("focus", aplicarConfiguracoes);
    window.addEventListener(
      "cfs-pmesp-configuracoes-atualizadas",
      aplicarConfiguracoes
    );

    return () => {
      window.removeEventListener(
        "storage",
        aoAlterarStorage
      );
      window.removeEventListener(
        "focus",
        aplicarConfiguracoes
      );
      window.removeEventListener(
        "cfs-pmesp-configuracoes-atualizadas",
        aplicarConfiguracoes
      );
    };
  }, [
    carregandoAuth,
    usuario,
    ehAdministrador,
  ]);

  async function excluirProvaSelecionada(prova: Prova) {
    if (confirmarAntesDeExcluir) {
      const confirmou = window.confirm(
        `Excluir definitivamente a prova "${prova.nome}" (${prova.ano})?\n\nSerão removidos as questões, imagens, vínculos, apoios sem uso e o PDF armazenado.`
      );

      if (!confirmou) {
        return;
      }
    }

    setProvaExcluindoId(prova.id);
    setMensagemProvas(`Excluindo "${prova.nome}" (${prova.ano})...`);

    try {
      const resultado = await excluirProvaCompleta(prova.id);

      setMensagemProvas(
        `Prova "${resultado.nome}" (${resultado.ano}) excluída com sucesso. ` +
          `${resultado.questoesExcluidas} questão(ões), ` +
          `${resultado.imagensExcluidas} imagem(ns) e ` +
          `${resultado.apoiosExcluidos} apoio(s) removido(s). ` +
          `${
            resultado.arquivoStorageRemovido
              ? "O PDF também foi removido do armazenamento."
              : "A prova não possuía PDF registrado no armazenamento."
          }`
      );

      await carregarProvasImportadas();
    } catch (erro) {
      console.error(erro);
      setMensagemProvas(
        erro instanceof Error
          ? erro.message
          : "Não foi possível excluir a prova."
      );
    } finally {
      setProvaExcluindoId(null);
    }
  }

  const estiloCampo: React.CSSProperties = {
    width: "100%",
    padding: 10,
    boxSizing: "border-box",
    border: "1px solid var(--app-border)",
    borderRadius: 6,
    backgroundColor: "var(--app-surface)",
    color: "var(--app-text)",
    fontSize: 15,
    outline: "none",
  };

  const estiloRotulo: React.CSSProperties = {
    display: "block",
    fontWeight: 700,
    marginBottom: 6,
    color: "var(--app-text)",
  };

  async function enviarArquivo() {
    const nomeNormalizado = nomeProva.trim();
    const bancaNormalizada =
      bancaProva.trim() || "Não informada";
    const cargoNormalizado =
      cargoProva.trim() || "Não informado";
    const disciplinaNormalizada =
      disciplinaPadrao.trim() || "Não identificada";

    if (!nomeNormalizado) {
      setMensagem("Informe o nome da prova.");
      return;
    }

    if (
      !Number.isInteger(anoProva) ||
      anoProva < 1900 ||
      anoProva > 2100
    ) {
      setMensagem("Informe um ano válido para a prova.");
      return;
    }

    if (!arquivoProva) {
      setMensagem("Selecione o PDF da prova.");
      return;
    }

    const ehPDF =
      arquivoProva.type === "application/pdf" ||
      arquivoProva.name.toLowerCase().endsWith(".pdf");

    if (!ehPDF) {
      setMensagem("O arquivo da prova precisa ser um PDF.");
      return;
    }

    setEnviando(true);
    setMensagem("");
    setPdfExtraido(null);
    setResultadoParser(null);
    setResultadoImagens(null);
    setResultadoGabarito(null);

    let caminhoStorage: string | null = null;
    let provaCriadaId: number | null = null;

    try {
      setMensagem("Verificando se a prova já foi importada...");

      const provaExistente = await buscarProva(
        nomeNormalizado,
        anoProva
      );

      if (provaExistente) {
        throw new Error(
          `A prova "${nomeNormalizado}" já está cadastrada no banco com o status "${provaExistente.status}".`
        );
      }

      setMensagem("Lendo o conteúdo completo do PDF...");

      const resultadoExtracao = await extrairTextoPDF(
        arquivoProva
      );

      setPdfExtraido(resultadoExtracao);

      setMensagem("Identificando as questões da prova...");

      let resultadoQuestoes = extrairQuestoesDoPDF(
        resultadoExtracao,
        {
          prova: nomeNormalizado,
          ano: anoProva,
          disciplina: disciplinaNormalizada,
        }
      );

      if (arquivoGabarito) {
        const ehGabaritoPDF =
          arquivoGabarito.type === "application/pdf" ||
          arquivoGabarito.name
            .toLowerCase()
            .endsWith(".pdf");

        if (!ehGabaritoPDF) {
          throw new Error(
            "O arquivo do gabarito precisa ser um PDF."
          );
        }

        setMensagem("Lendo e identificando o gabarito...");

        const pdfGabarito = await extrairTextoPDF(
          arquivoGabarito
        );
        const gabaritoExtraido = extrairGabarito(
          pdfGabarito
        );

        setResultadoGabarito(gabaritoExtraido);

        resultadoQuestoes = {
          ...resultadoQuestoes,
          questoes: aplicarGabaritoNasQuestoes(
            resultadoQuestoes.questoes,
            gabaritoExtraido
          ),
          avisosGerais: [
            ...resultadoQuestoes.avisosGerais,
            ...gabaritoExtraido.avisos,
          ],
        };
      }

      setResultadoParser(resultadoQuestoes);

      if (resultadoQuestoes.totalEncontrado === 0) {
        throw new Error(
          "Nenhuma questão foi encontrada no PDF."
        );
      }

      setMensagem(
        "Preservando imagens, gráficos, tabelas e demais elementos visuais..."
      );

      const imagensExtraidas = await extrairImagensDoPDF(
        resultadoExtracao,
        resultadoQuestoes.questoes
      );

      setResultadoImagens(imagensExtraidas);

      setMensagem(
        "Enviando o PDF original para o armazenamento..."
      );

      const nomeSeguro = arquivoProva.name.replace(
        /[^a-zA-Z0-9._-]/g,
        "_"
      );

      caminhoStorage = `${uuid()}-${nomeSeguro}`;

      const { error: erroUpload } = await supabase.storage
        .from("provas")
        .upload(caminhoStorage, arquivoProva, {
          contentType: "application/pdf",
          upsert: false,
        });

      if (erroUpload) {
        throw new Error(
          `Erro ao enviar o PDF: ${erroUpload.message}`
        );
      }

      setMensagem("Registrando a prova no banco...");

      const provaCriada = await criarProva({
        nome: nomeNormalizado,
        ano: anoProva,
        banca: bancaNormalizada,
        cargo: cargoNormalizado,
        nomeArquivo: arquivoProva.name,
        caminhoStorage,
        totalQuestoes: resultadoQuestoes.totalEncontrado,
      });

      provaCriadaId = provaCriada.id;

      setMensagem(
        `Importando ${resultadoQuestoes.apoios.length} apoio(s)...`
      );

      const apoiosImportados = await importarApoios(
        provaCriada.id,
        resultadoQuestoes.apoios
      );

      setMensagem(
        `Importando ${resultadoQuestoes.totalEncontrado} questão(ões)...`
      );

      await excluirQuestoesDaProva(provaCriada.id);

      const questoesImportadas = await importarQuestoes(
        provaCriada.id,
        resultadoQuestoes.questoes,
        {
          nome: nomeNormalizado,
          ano: anoProva,
        }
      );

      const quantidadeImportada = questoesImportadas.length;

      setMensagem("Relacionando questões aos apoios...");

      const quantidadeRelacionamentos =
        await importarQuestaoApoios(
          questoesImportadas,
          apoiosImportados,
          resultadoQuestoes.questoes,
          resultadoQuestoes.apoios
        );

      setMensagem(
        `Importando ${imagensExtraidas.imagens.length} imagem(ns) preservada(s)...`
      );

      const importacaoImagens = await importarImagens(
        provaCriada.id,
        imagensExtraidas.imagens,
        questoesImportadas,
        resultadoQuestoes.questoes
      );

      const todosAvisos = [
        ...resultadoQuestoes.avisosGerais,
        ...imagensExtraidas.avisos,
      ];

      const avisos =
        todosAvisos.length > 0
          ? todosAvisos.join(" | ")
          : null;

      await atualizarStatusProva(
        provaCriada.id,
        "concluido",
        quantidadeImportada,
        avisos
      );

      setMensagem(
        `Importação concluída com sucesso. ${resultadoExtracao.totalPaginas} página(s), ${resultadoQuestoes.totalEncontrado} questão(ões) encontrada(s), ${quantidadeImportada} questão(ões) gravada(s), ${quantidadeRelacionamentos} vínculo(s) com apoios e ${importacaoImagens.quantidadeImportada} imagem(ns) preservada(s).`
      );

      await carregarProvasImportadas();
    } catch (erro) {
      console.error(erro);

      const mensagemErro =
        erro instanceof Error
          ? erro.message
          : "Ocorreu um erro inesperado ao processar o PDF.";

      if (provaCriadaId !== null) {
        try {
          await atualizarStatusProva(
            provaCriadaId,
            "erro",
            0,
            mensagemErro
          );
        } catch (erroAtualizacao) {
          console.error(
            "Não foi possível atualizar o status da prova:",
            erroAtualizacao
          );
        }
      } else if (caminhoStorage) {
        try {
          await supabase.storage
            .from("provas")
            .remove([caminhoStorage]);
        } catch (erroRemocao) {
          console.error(
            "Não foi possível remover o PDF do armazenamento:",
            erroRemocao
          );
        }
      }

      setMensagem(mensagemErro);
    } finally {
      setEnviando(false);
    }
  }

  if (carregandoAuth || !usuario) {
    return (
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: 30,
          fontFamily: "Arial, sans-serif",
          color: "var(--app-text)",
        }}
      >
        <h1>Importar PDF</h1>
        <p style={{ color: "var(--app-text-secondary)" }}>
          Verificando acesso...
        </p>
      </main>
    );
  }

  if (!ehAdministrador) {
    return (
      <main
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: 30,
          fontFamily: "Arial, sans-serif",
          color: "var(--app-text)",
        }}
      >
        <h1>Acesso restrito</h1>
        <p style={{ color: "var(--app-text-secondary)" }}>
          Esta área é exclusiva para administradores.
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 30,
        fontFamily: "Arial, sans-serif",
        color: "var(--app-text)",
      }}
    >
      <h1>Importar PDF</h1>

      <p>
        Informe os dados da prova e envie os PDFs para
        extrair textos, questões, apoios, imagens, gráficos,
        tabelas e o gabarito.
      </p>

      <section
        style={{
          padding: 20,
          border: "1px solid var(--app-border)",
          borderRadius: 8,
          backgroundColor: "var(--app-surface)",
          marginBottom: 20,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Provas importadas</h2>
            <p style={{ margin: "6px 0 0", color: "var(--app-text-secondary)" }}>
              Consulte ou exclua provas já cadastradas.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void carregarProvasImportadas()}
            disabled={carregandoProvas || provaExcluindoId !== null}
            style={{
              padding: "9px 14px",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
              backgroundColor: "var(--app-surface)",
              color: "var(--app-text)",
              cursor:
                carregandoProvas || provaExcluindoId !== null
                  ? "not-allowed"
                  : "pointer",
              fontWeight: 700,
              opacity:
                carregandoProvas || provaExcluindoId !== null ? 0.6 : 1,
            }}
          >
            {carregandoProvas ? "Atualizando..." : "Atualizar lista"}
          </button>
        </div>

        {carregandoProvas ? (
          <p style={{ marginBottom: 0 }}>Carregando provas importadas...</p>
        ) : provasImportadas.length === 0 ? (
          <p style={{ marginBottom: 0, color: "var(--app-text-secondary)" }}>
            Nenhuma prova importada.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {provasImportadas.map((prova) => {
              const excluindo = provaExcluindoId === prova.id;

              return (
                <article
                  key={prova.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                    padding: 16,
                    border: "1px solid var(--app-border)",
                    borderRadius: 8,
                    backgroundColor: "var(--app-surface-secondary)",
                  }}
                >
                  <div>
                    <h3 style={{ margin: "0 0 6px", color: "var(--app-text)" }}>
                      {prova.nome}
                    </h3>

                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "6px 14px",
                        color: "var(--app-text-secondary)",
                        fontSize: 14,
                      }}
                    >
                      <span>Ano: {prova.ano}</span>
                      <span>
                        Questões:{" "}
                        {prova.questoes_importadas ??
                          prova.total_questoes ??
                          0}
                      </span>
                      <span>Status: {prova.status}</span>
                      {prova.nome_arquivo && (
                        <span>Arquivo: {prova.nome_arquivo}</span>
                      )}
                    </div>

                    {mostrarAvisosImportacao && prova.erro && (
                      <p
                        style={{
                          margin: "8px 0 0",
                          color: "var(--app-danger-text)",
                          fontSize: 14,
                        }}
                      >
                        {prova.erro}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => void excluirProvaSelecionada(prova)}
                    disabled={enviando || provaExcluindoId !== null}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid var(--app-danger)",
                      borderRadius: 6,
                      backgroundColor: excluindo ? "#fee2e2" : "#ffffff",
                      color: "var(--app-danger-text)",
                      cursor:
                        enviando || provaExcluindoId !== null
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 700,
                      opacity:
                        enviando || provaExcluindoId !== null ? 0.6 : 1,
                    }}
                  >
                    {excluindo ? "Excluindo..." : "Excluir prova"}
                  </button>
                </article>
              );
            })}
          </div>
        )}

        {mensagemProvas && (
          <div
            style={{
              marginTop: 16,
              padding: 14,
              border: "1px solid var(--app-border)",
              borderRadius: 8,
              backgroundColor: "var(--app-surface-secondary)",
              color: "var(--app-text)",
            }}
          >
            {mensagemProvas}
          </div>
        )}
      </section>

      <div
        style={{
          padding: 20,
          border: "1px solid var(--app-border)",
          borderRadius: 8,
          backgroundColor: "var(--app-surface-secondary)",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Dados da prova
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
          }}
        >
          <label>
            <span
              style={estiloRotulo}
            >
              Nome da prova
            </span>

            <input
              type="text"
              value={nomeProva}
              disabled={enviando}
              onChange={(event) =>
                setNomeProva(event.target.value)
              }
              style={estiloCampo}
            />
          </label>

          <label>
            <span
              style={estiloRotulo}
            >
              Ano
            </span>

            <input
              type="number"
              min={1900}
              max={2100}
              value={anoProva}
              disabled={enviando}
              onChange={(event) =>
                setAnoProva(
                  Number(event.target.value)
                )
              }
              style={estiloCampo}
            />
          </label>

          <label>
            <span
              style={estiloRotulo}
            >
              Banca
            </span>

            <input
              type="text"
              value={bancaProva}
              disabled={enviando}
              onChange={(event) =>
                setBancaProva(event.target.value)
              }
              style={estiloCampo}
            />
          </label>

          <label>
            <span
              style={estiloRotulo}
            >
              Cargo ou curso
            </span>

            <input
              type="text"
              value={cargoProva}
              disabled={enviando}
              onChange={(event) =>
                setCargoProva(event.target.value)
              }
              style={estiloCampo}
            />
          </label>

          <label>
            <span
              style={estiloRotulo}
            >
              Disciplina padrão
            </span>

            <input
              type="text"
              value={disciplinaPadrao}
              disabled={enviando}
              onChange={(event) =>
                setDisciplinaPadrao(
                  event.target.value
                )
              }
              placeholder="Não identificada"
              style={estiloCampo}
            />
          </label>
        </div>

        <p
          style={{
            marginBottom: 0,
            color: "var(--app-text-secondary)",
          }}
        >
          Use “Não identificada” para permitir que o
          parser classifique automaticamente quando houver
          uma regra conhecida.
        </p>
      </div>

      <div
        style={{
          padding: 20,
          border: "1px solid var(--app-border)",
          borderRadius: 8,
          backgroundColor: "var(--app-surface-secondary)",
          color: "var(--app-text)",
        }}
      >
        <label
          style={{
            display: "block",
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--app-text)",
          }}
        >
          PDF da prova
        </label>

        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={enviando}
          style={{
            color: "var(--app-text)",
            backgroundColor: "var(--app-surface)",
            padding: 8,
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            width: "100%",
            boxSizing: "border-box",
          }}
          onChange={(event) => {
            const arquivoSelecionado =
              event.target.files?.[0] ?? null;

            setArquivoProva(arquivoSelecionado);
            setMensagem("");
            setPdfExtraido(null);
            setResultadoParser(null);
            setResultadoImagens(null);
            setResultadoGabarito(null);
          }}
        />

        {arquivoProva && (
          <p>
            Prova selecionada:{" "}
            <strong>{arquivoProva.name}</strong>
          </p>
        )}

        <hr
          style={{
            border: 0,
            borderTop: "1px solid var(--app-border)",
            margin: "20px 0",
          }}
        />

        <label
          style={{
            display: "block",
            fontWeight: 700,
            marginBottom: 8,
            color: "var(--app-text)",
          }}
        >
          PDF do gabarito
        </label>

        <input
          type="file"
          accept="application/pdf,.pdf"
          disabled={enviando}
          style={{
            color: "var(--app-text)",
            backgroundColor: "var(--app-surface)",
            padding: 8,
            border: "1px solid var(--app-border)",
            borderRadius: 6,
            width: "100%",
            boxSizing: "border-box",
          }}
          onChange={(event) => {
            setArquivoGabarito(
              event.target.files?.[0] ?? null
            );
            setMensagem("");
            setResultadoGabarito(null);
          }}
        />

        {arquivoGabarito ? (
          <p style={{ marginBottom: 0 }}>
            Gabarito selecionado:{" "}
            <strong>{arquivoGabarito.name}</strong>
          </p>
        ) : (
          <p
            style={{
              marginBottom: 0,
              color: "var(--app-text-secondary)",
            }}
          >
            Opcional. Sem esse arquivo, as respostas serão
            importadas como indisponíveis.
          </p>
        )}
      </div>

      <br />

      <button
        type="button"
        onClick={enviarArquivo}
        disabled={enviando || !arquivoProva}
        style={{
          padding: "12px 20px",
          border: "1px solid var(--app-primary)",
          borderRadius: 6,
          backgroundColor: "var(--app-primary)",
          color: "var(--app-primary-text)",
          cursor:
            enviando || !arquivoProva
              ? "not-allowed"
              : "pointer",
          fontSize: 16,
          fontWeight: 700,
          opacity:
            enviando || !arquivoProva ? 0.6 : 1,
        }}
      >
        {enviando
          ? "Processando..."
          : "Enviar e importar questões"}
      </button>

      {mensagem && (
        <div
          style={{
            marginTop: 24,
            padding: 16,
            border: "1px solid var(--app-border)",
            borderRadius: 8,
          }}
        >
          {mensagem}
        </div>
      )}

      {resultadoParser && (
        <section style={{ marginTop: 35 }}>
          <h2>Resultado da análise</h2>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 16,
              marginBottom: 24,
            }}
          >
            <div
              style={{
                minWidth: 180,
                padding: 18,
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}
            >
              <div>Total encontrado</div>

              <strong style={{ fontSize: 30 }}>
                {resultadoParser.totalEncontrado}
              </strong>
            </div>

            <div
              style={{
                minWidth: 180,
                padding: 18,
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}
            >
              <div>Sem avisos</div>

              <strong style={{ fontSize: 30 }}>
                {
                  resultadoParser.questoes.filter(
                    (questao) => !questao.precisaRevisao
                  ).length
                }
              </strong>
            </div>

            <div
              style={{
                minWidth: 180,
                padding: 18,
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}
            >
              <div>Para revisão</div>

              <strong style={{ fontSize: 30 }}>
                {
                  resultadoParser.questoes.filter(
                    (questao) => questao.precisaRevisao
                  ).length
                }
              </strong>
            </div>

            <div
              style={{
                minWidth: 180,
                padding: 18,
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}
            >
              <div>Imagens preservadas</div>

              <strong style={{ fontSize: 30 }}>
                {resultadoImagens?.imagens.length ?? 0}
              </strong>
            </div>

            <div
              style={{
                minWidth: 180,
                padding: 18,
                border: "1px solid var(--app-border)",
                borderRadius: 8,
              }}
            >
              <div>Respostas do gabarito</div>

              <strong style={{ fontSize: 30 }}>
                {resultadoGabarito?.totalEncontrado ?? 0}
              </strong>
            </div>
          </div>

          {mostrarAvisosImportacao &&
            resultadoParser.avisosGerais.length > 0 && (
            <div
              style={{
                marginBottom: 24,
                padding: 18,
                border: "1px solid var(--app-warning)",
                borderRadius: 8,
                backgroundColor: "var(--app-surface-secondary)",
              }}
            >
              <h3 style={{ marginTop: 0 }}>
                Avisos gerais
              </h3>

              <ul style={{ marginBottom: 0 }}>
                {resultadoParser.avisosGerais.map(
                  (aviso, indice) => (
                    <li key={`${aviso}-${indice}`}>
                      {aviso}
                    </li>
                  )
                )}
              </ul>
            </div>
          )}

          {mostrarAvisosImportacao &&
            resultadoImagens &&
            resultadoImagens.avisos.length > 0 && (
              <div
                style={{
                  marginBottom: 24,
                  padding: 18,
                  border: "1px solid var(--app-warning)",
                  borderRadius: 8,
                  backgroundColor: "var(--app-surface-secondary)",
                }}
              >
                <h3 style={{ marginTop: 0 }}>
                  Avisos sobre imagens
                </h3>

                <ul style={{ marginBottom: 0 }}>
                  {resultadoImagens.avisos.map(
                    (aviso, indice) => (
                      <li key={`${aviso}-${indice}`}>
                        {aviso}
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}

          {resultadoParser.apoios.length > 0 && (
            <>
              <h2>
                📚 Apoios encontrados (
                {resultadoParser.apoios.length})
              </h2>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                  marginBottom: 30,
                }}
              >
                {resultadoParser.apoios.map((apoio) => (
                  <details
                    key={apoio.id}
                    style={{
                      border: "1px solid var(--app-border)",
                      borderRadius: 8,
                      padding: 14,
                    }}
                  >
                    <summary
                      style={{
                        cursor: "pointer",
                        fontWeight: 700,
                      }}
                    >
                      {apoio.titulo ?? apoio.tipo}
                    </summary>

                    <p>
                      <strong>Tipo:</strong> {apoio.tipo}
                    </p>

                    <p>
                      <strong>Páginas:</strong>{" "}
                      {apoio.paginaInicial}
                      {apoio.paginaFinal !==
                        apoio.paginaInicial
                        ? ` até ${apoio.paginaFinal}`
                        : ""}
                    </p>

                    <p>
                      <strong>Questões:</strong>{" "}
                      {apoio.questoes
                        .map((numero) =>
                          String(numero).padStart(2, "0")
                        )
                        .join(", ")}
                    </p>

                    <pre
                      style={{
                        whiteSpace: "pre-wrap",
                        background: "var(--app-surface-secondary)",
                        padding: 12,
                        borderRadius: 6,
                      }}
                    >
                      {apoio.conteudo}
                    </pre>
                  </details>
                ))}
              </div>
            </>
          )}

          <h2>Questões encontradas</h2>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 22,
            }}
          >
            {resultadoParser.questoes.map((questao) => {
              const imagensDaQuestao =
                resultadoImagens?.imagensPorQuestao[
                  questao.numero
                ] ?? [];

              return (
                <article
                  key={`${questao.numero}-${questao.paginaInicial}`}
                  style={{
                    padding: 22,
                    border: questao.precisaRevisao
                      ? "2px solid #f59e0b"
                      : "1px solid var(--app-border)",
                    borderRadius: 10,
                    backgroundColor: questao.precisaRevisao
                      ? "#fffbeb"
                      : "#ffffff",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 10,
                      marginBottom: 16,
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      Questão{" "}
                      {String(questao.numero).padStart(
                        2,
                        "0"
                      )}
                    </h3>

                    <span>
                      Página {questao.paginaInicial}
                      {questao.paginaFinal !==
                        questao.paginaInicial &&
                        ` até ${questao.paginaFinal}`}
                    </span>
                  </div>

                  {questao.precisaRevisao && (
                    <div
                      style={{
                        marginBottom: 16,
                        padding: 12,
                        borderRadius: 6,
                        backgroundColor: "var(--app-surface-hover)",
                      }}
                    >
                      <strong>
                        Precisa de revisão:
                      </strong>

                      <ul style={{ marginBottom: 0 }}>
                        {questao.avisos.map(
                          (aviso, indice) => (
                            <li
                              key={`${questao.numero}-${aviso}-${indice}`}
                            >
                              {aviso}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  )}

                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.6,
                      fontWeight: 600,
                    }}
                  >
                    {questao.enunciado ||
                      "Enunciado não identificado."}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      lineHeight: 1.5,
                    }}
                  >
                    <div>
                      <strong>A)</strong>{" "}
                      {questao.alternativaA ||
                        "Alternativa não identificada."}
                    </div>

                    <div>
                      <strong>B)</strong>{" "}
                      {questao.alternativaB ||
                        "Alternativa não identificada."}
                    </div>

                    <div>
                      <strong>C)</strong>{" "}
                      {questao.alternativaC ||
                        "Alternativa não identificada."}
                    </div>

                    <div>
                      <strong>D)</strong>{" "}
                      {questao.alternativaD ||
                        "Alternativa não identificada."}
                    </div>

                    {questao.alternativaE && (
                      <div>
                        <strong>E)</strong>{" "}
                        {questao.alternativaE}
                      </div>
                    )}
                  </div>

                  {imagensDaQuestao.length > 0 && (
                    <details style={{ marginTop: 20 }}>
                      <summary
                        style={{
                          cursor: "pointer",
                          fontWeight: 700,
                        }}
                      >
                        Ver conteúdo visual preservado (
                        {imagensDaQuestao.length})
                      </summary>

                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 16,
                          marginTop: 16,
                        }}
                      >
                        {imagensDaQuestao.map((imagem) => (
                          <figure
                            key={imagem.id}
                            style={{ margin: 0 }}
                          >
                            <img
                              src={imagem.dataUrl}
                              alt={imagem.descricao}
                              style={{
                                display: "block",
                                width: "100%",
                                height: "auto",
                                border:
                                  "1px solid var(--app-border)",
                                borderRadius: 8,
                              }}
                            />

                            <figcaption
                              style={{
                                marginTop: 8,
                                fontSize: 14,
                                color: "var(--app-text-secondary)",
                              }}
                            >
                              {imagem.descricao}
                            </figcaption>
                          </figure>
                        ))}
                      </div>
                    </details>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {pdfExtraido && (
        <details style={{ marginTop: 40 }}>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            Ver texto bruto extraído do PDF
          </summary>

          <p>
            Total de páginas:{" "}
            <strong>{pdfExtraido.totalPaginas}</strong>
          </p>

          <textarea
            value={pdfExtraido.textoCompleto}
            readOnly
            style={{
              width: "100%",
              minHeight: 500,
              padding: 16,
              resize: "vertical",
              fontFamily: "monospace",
              whiteSpace: "pre-wrap",
              boxSizing: "border-box",
              backgroundColor: "var(--app-surface)",
              color: "var(--app-text)",
              border: "1px solid var(--app-border)",
              borderRadius: 6,
            }}
          />
        </details>
      )}
    </main>
  );
}