"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";

interface ConfiguracoesSalvas {
  nomeUsuario: string;
  metaDiariaQuestoes: number;
  tema: "sistema" | "claro" | "escuro";
  mostrarAvisosImportacao: boolean;
  confirmarAntesDeExcluir: boolean;
}

const CHAVE_CONFIGURACOES = "cfs-pmesp-configuracoes";

const CHAVES_PROGRESSO = [
  "cfs-pmesp-resultados",
  "banco-resultados",
  "cfs-pmesp-simulados",
] as const;

const CONFIGURACOES_PADRAO: ConfiguracoesSalvas = {
  nomeUsuario: "Guilherme",
  metaDiariaQuestoes: 20,
  tema: "sistema",
  mostrarAvisosImportacao: true,
  confirmarAntesDeExcluir: true,
};

export default function Configuracoes() {
  const router = useRouter();
  const { usuario, carregando: carregandoAuth } = useAuth();

  const [configuracoes, setConfiguracoes] =
    useState<ConfiguracoesSalvas>(CONFIGURACOES_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [mensagem, setMensagem] = useState("");

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
      const configuracoesSalvas = window.localStorage.getItem(
        CHAVE_CONFIGURACOES
      );

      if (configuracoesSalvas) {
        const dados = JSON.parse(
          configuracoesSalvas
        ) as Partial<ConfiguracoesSalvas>;

        setConfiguracoes({
          ...CONFIGURACOES_PADRAO,
          ...dados,
        });
      }
    } catch (erro) {
      console.error(
        "Não foi possível carregar as configurações:",
        erro
      );

      setMensagem(
        "Não foi possível carregar as configurações salvas. Os valores padrão foram aplicados."
      );
    } finally {
      setCarregando(false);
    }
  }, [carregandoAuth, usuario]);

  function atualizarConfiguracao<
    Campo extends keyof ConfiguracoesSalvas,
  >(
    campo: Campo,
    valor: ConfiguracoesSalvas[Campo]
  ) {
    setConfiguracoes((configuracoesAtuais) => ({
      ...configuracoesAtuais,
      [campo]: valor,
    }));

    setMensagem("");
  }

  function salvarConfiguracoes() {
    try {
      const nomeNormalizado =
        configuracoes.nomeUsuario.trim() || "Guilherme";

      const metaNormalizada = Math.min(
        500,
        Math.max(
          1,
          Math.round(configuracoes.metaDiariaQuestoes)
        )
      );

      const configuracoesNormalizadas: ConfiguracoesSalvas = {
        ...configuracoes,
        nomeUsuario: nomeNormalizado,
        metaDiariaQuestoes: metaNormalizada,
      };

      window.localStorage.setItem(
        CHAVE_CONFIGURACOES,
        JSON.stringify(configuracoesNormalizadas)
      );

      setConfiguracoes(configuracoesNormalizadas);
      setMensagem("Configurações salvas com sucesso.");
    } catch (erro) {
      console.error(
        "Não foi possível salvar as configurações:",
        erro
      );

      setMensagem(
        "Não foi possível salvar as configurações neste navegador."
      );
    }
  }


  function zerarProgresso() {
    const confirmou = window.confirm(
      "Tem certeza de que deseja zerar todo o progresso? Essa ação apagará respostas, acertos, erros e histórico de simulados, mas não excluirá as provas importadas."
    );

    if (!confirmou) {
      return;
    }

    const confirmouNovamente = window.confirm(
      "Confirma novamente? O progresso apagado não poderá ser recuperado."
    );

    if (!confirmouNovamente) {
      return;
    }

    try {
      for (const chave of CHAVES_PROGRESSO) {
        window.localStorage.removeItem(chave);
      }

      window.dispatchEvent(
        new Event("cfs-pmesp-dados-atualizados")
      );

      setMensagem(
        "Progresso zerado com sucesso. As provas e questões importadas foram preservadas."
      );
    } catch (erro) {
      console.error(
        "Não foi possível zerar o progresso:",
        erro
      );

      setMensagem(
        "Não foi possível zerar o progresso neste navegador."
      );
    }
  }

  function restaurarPadroes() {
    const confirmou = window.confirm(
      "Restaurar todas as configurações para os valores padrão?"
    );

    if (!confirmou) {
      return;
    }

    try {
      window.localStorage.removeItem(CHAVE_CONFIGURACOES);
      setConfiguracoes(CONFIGURACOES_PADRAO);
      setMensagem("Configurações padrão restauradas.");
    } catch (erro) {
      console.error(
        "Não foi possível restaurar as configurações:",
        erro
      );

      setMensagem(
        "Não foi possível restaurar as configurações."
      );
    }
  }

  const estiloCampo: React.CSSProperties = {
    width: "100%",
    padding: 10,
    boxSizing: "border-box",
    border: "1px solid #64748b",
    borderRadius: 6,
    backgroundColor: "#ffffff",
    color: "#111827",
    fontSize: 15,
    outline: "none",
  };

  const estiloRotulo: React.CSSProperties = {
    display: "block",
    fontWeight: 700,
    marginBottom: 6,
    color: "#111827",
  };

  if (carregandoAuth || !usuario) {
    return (
      <main
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: 30,
          fontFamily: "Arial, sans-serif",
          color: "var(--app-text)",
        }}
      >
        <h1>Configurações</h1>
        <p style={{ color: "var(--app-text-secondary)" }}>
          Verificando acesso...
        </p>
      </main>
    );
  }

  if (carregando) {
    return (
      <main
        style={{
          maxWidth: 1000,
          margin: "0 auto",
          padding: 30,
          fontFamily: "Arial, sans-serif",
        }}
      >
        <h1>Configurações</h1>
        <p>Carregando configurações...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1000,
        margin: "0 auto",
        padding: 30,
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1>Configurações</h1>

      <p
        style={{
          color: "#475569",
          marginBottom: 24,
        }}
      >
        Personalize a plataforma de estudos conforme a sua
        rotina.
      </p>

      <section
        style={{
          padding: 20,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          backgroundColor: "#f8fafc",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Perfil</h2>

        <label>
          <span style={estiloRotulo}>
            Nome exibido na plataforma
          </span>

          <input
            type="text"
            value={configuracoes.nomeUsuario}
            maxLength={80}
            onChange={(event) =>
              atualizarConfiguracao(
                "nomeUsuario",
                event.target.value
              )
            }
            style={estiloCampo}
          />
        </label>
      </section>

      <section
        style={{
          padding: 20,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          backgroundColor: "#f8fafc",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Estudos</h2>

        <label>
          <span style={estiloRotulo}>
            Meta diária de questões
          </span>

          <input
            type="number"
            min={1}
            max={500}
            value={configuracoes.metaDiariaQuestoes}
            onChange={(event) =>
              atualizarConfiguracao(
                "metaDiariaQuestoes",
                Number(event.target.value)
              )
            }
            style={estiloCampo}
          />
        </label>

        <p
          style={{
            marginBottom: 0,
            color: "#475569",
          }}
        >
          Essa meta poderá ser usada posteriormente no painel,
          nas estatísticas e no acompanhamento diário.
        </p>
      </section>

      <section
        style={{
          padding: 20,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          backgroundColor: "#f8fafc",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Aparência</h2>

        <label>
          <span style={estiloRotulo}>Tema</span>

          <select
            value={configuracoes.tema}
            onChange={(event) =>
              atualizarConfiguracao(
                "tema",
                event.target.value as ConfiguracoesSalvas["tema"]
              )
            }
            style={estiloCampo}
          >
            <option value="sistema">
              Usar configuração do sistema
            </option>
            <option value="claro">Tema claro</option>
            <option value="escuro">Tema escuro</option>
          </select>
        </label>

        <p
          style={{
            marginBottom: 0,
            color: "#475569",
          }}
        >
          A preferência fica salva. A aplicação visual completa
          do tema será integrada ao layout geral posteriormente.
        </p>
      </section>

      <section
        style={{
          padding: 20,
          border: "1px solid #d1d5db",
          borderRadius: 8,
          backgroundColor: "#f8fafc",
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          Segurança e importação
        </h2>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 16,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={configuracoes.mostrarAvisosImportacao}
            onChange={(event) =>
              atualizarConfiguracao(
                "mostrarAvisosImportacao",
                event.target.checked
              )
            }
            style={{ marginTop: 3 }}
          />

          <span>
            <strong>Exibir avisos de importação</strong>
            <br />
            <span style={{ color: "#475569" }}>
              Mantém visíveis os avisos técnicos encontrados
              durante a leitura das provas.
            </span>
          </span>
        </label>

        <label
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={configuracoes.confirmarAntesDeExcluir}
            onChange={(event) =>
              atualizarConfiguracao(
                "confirmarAntesDeExcluir",
                event.target.checked
              )
            }
            style={{ marginTop: 3 }}
          />

          <span>
            <strong>
              Confirmar antes de excluir uma prova
            </strong>
            <br />
            <span style={{ color: "#475569" }}>
              Evita exclusões acidentais na tela de importação.
            </span>
          </span>
        </label>
      </section>

      <section
        style={{
          padding: 20,
          border: "1px solid #fecaca",
          borderRadius: 8,
          backgroundColor: "#fff7f7",
          marginBottom: 20,
        }}
      >
        <h2
          style={{
            marginTop: 0,
            color: "#991b1b",
          }}
        >
          Zerar progresso
        </h2>

        <p
          style={{
            color: "#7f1d1d",
            marginTop: 0,
          }}
        >
          Apaga respostas, acertos, erros e histórico de
          simulados do Dashboard e das Estatísticas.
        </p>

        <p
          style={{
            color: "#475569",
          }}
        >
          As provas importadas e as 120 questões permanecem
          salvas no Supabase.
        </p>

        <button
          type="button"
          onClick={zerarProgresso}
          style={{
            padding: "12px 20px",
            border: "1px solid #dc2626",
            borderRadius: 6,
            backgroundColor: "#dc2626",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Zerar todo o progresso
        </button>
      </section>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <button
          type="button"
          onClick={salvarConfiguracoes}
          style={{
            padding: "12px 20px",
            border: "1px solid #2563eb",
            borderRadius: 6,
            backgroundColor: "#2563eb",
            color: "#ffffff",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Salvar configurações
        </button>

        <button
          type="button"
          onClick={restaurarPadroes}
          style={{
            padding: "12px 20px",
            border: "1px solid #64748b",
            borderRadius: 6,
            backgroundColor: "#ffffff",
            color: "#111827",
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Restaurar padrões
        </button>
      </div>

      {mensagem && (
        <div
          style={{
            marginTop: 20,
            padding: 14,
            border: "1px solid #cbd5e1",
            borderRadius: 8,
            backgroundColor: "#ffffff",
            color: "#111827",
          }}
        >
          {mensagem}
        </div>
      )}
    </main>
  );
}