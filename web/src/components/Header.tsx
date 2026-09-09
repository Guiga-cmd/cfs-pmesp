"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

const CHAVE_CONFIGURACOES = "cfs-pmesp-configuracoes";

type Tema = "sistema" | "claro" | "escuro";
type TemaEfetivo = "claro" | "escuro";

const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/banco": "Banco de Questões",
  "/simulados": "Simulados",
  "/estatisticas": "Estatísticas",
  "/importar": "Importar PDF",
  "/configuracoes": "Configurações",
};

interface ConfiguracoesSalvas {
  nomeUsuario?: string;
  tema?: Tema;
  metaDiariaQuestoes?: number;
  mostrarAvisosImportacao?: boolean;
  confirmarAntesDeExcluir?: boolean;
}

function lerConfiguracoes(): ConfiguracoesSalvas {
  try {
    const valorSalvo = window.localStorage.getItem(
      CHAVE_CONFIGURACOES
    );

    if (!valorSalvo) {
      return {};
    }

    return JSON.parse(valorSalvo) as ConfiguracoesSalvas;
  } catch (erro) {
    console.error(
      "Não foi possível carregar as configurações:",
      erro
    );

    return {};
  }
}

function obterTemaEfetivo(tema: Tema): TemaEfetivo {
  if (tema === "claro" || tema === "escuro") {
    return tema;
  }

  return window.matchMedia("(prefers-color-scheme: dark)")
    .matches
    ? "escuro"
    : "claro";
}

function salvarTema(tema: Tema): void {
  const configuracoesAtuais = lerConfiguracoes();

  window.localStorage.setItem(
    CHAVE_CONFIGURACOES,
    JSON.stringify({
      ...configuracoesAtuais,
      tema,
    })
  );

  window.dispatchEvent(
    new Event("cfs-pmesp-configuracoes-atualizadas")
  );
}

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { usuario, carregando } = useAuth();
  const title = pageTitles[pathname] ?? "CFS PMESP";

  const [nomeUsuario, setNomeUsuario] =
    useState("Guilherme");
  const [saindo, setSaindo] = useState(false);
  const [tema, setTema] = useState<Tema>("sistema");
  const [temaEfetivo, setTemaEfetivo] =
    useState<TemaEfetivo>("escuro");

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    function aplicarConfiguracoes() {
      const configuracoes = lerConfiguracoes();
      const nome =
        configuracoes.nomeUsuario?.trim() || "Guilherme";
      const temaSalvo = configuracoes.tema ?? "sistema";

      setNomeUsuario(nome);
      setTema(temaSalvo);
      setTemaEfetivo(obterTemaEfetivo(temaSalvo));
    }

    function aoAlterarStorage(evento: StorageEvent) {
      if (
        evento.key === CHAVE_CONFIGURACOES ||
        evento.key === null
      ) {
        aplicarConfiguracoes();
      }
    }

    aplicarConfiguracoes();

    window.addEventListener("storage", aoAlterarStorage);
    window.addEventListener("focus", aplicarConfiguracoes);
    window.addEventListener(
      "cfs-pmesp-configuracoes-atualizadas",
      aplicarConfiguracoes
    );

    mediaQuery.addEventListener(
      "change",
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

      mediaQuery.removeEventListener(
        "change",
        aplicarConfiguracoes
      );
    };
  }, [pathname]);

  function alternarTema() {
    const proximoTema: Tema =
      temaEfetivo === "escuro" ? "claro" : "escuro";

    salvarTema(proximoTema);
    setTema(proximoTema);
    setTemaEfetivo(proximoTema);
  }

  async function sair() {
    if (saindo) {
      return;
    }

    setSaindo(true);

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        throw error;
      }

      router.replace("/login");
      router.refresh();
    } catch (erroLogout) {
      console.error("Não foi possível sair:", erroLogout);
      window.alert(
        "Não foi possível encerrar a sessão. Tente novamente."
      );
    } finally {
      setSaindo(false);
    }
  }

  const escuro = temaEfetivo === "escuro";
  const nomeExibido =
    usuario?.user_metadata?.nome?.trim() ||
    usuario?.email?.split("@")[0] ||
    nomeUsuario;

  return (
    <header
      style={{
        minHeight: "82px",
        padding: "0 32px",
        background: escuro ? "#111827" : "#ffffff",
        color: escuro ? "#ffffff" : "#111827",
        borderBottom: escuro
          ? "1px solid #273449"
          : "1px solid #e2e8f0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "18px",
        boxSizing: "border-box",
        transition:
          "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      <div>
        <h1
          style={{
            margin: 0,
            fontSize: "26px",
          }}
        >
          {title}
        </h1>

        <p
          style={{
            margin: "5px 0 0",
            color: escuro ? "#94a3b8" : "#64748b",
            fontSize: "14px",
          }}
        >
          Plataforma de estudos CFS PMESP
        </p>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {!carregando && usuario ? (
          <>
            <div
              title={usuario.email ?? undefined}
              style={{
                background: escuro ? "#1e293b" : "#f1f5f9",
                color: escuro ? "#ffffff" : "#111827",
                padding: "11px 16px",
                borderRadius: "10px",
                border: escuro
                  ? "1px solid #334155"
                  : "1px solid #cbd5e1",
                maxWidth: "220px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              👤 {nomeExibido}
            </div>

            <button
              type="button"
              onClick={sair}
              disabled={saindo}
              style={{
                height: "44px",
                padding: "0 14px",
                borderRadius: "10px",
                border: escuro
                  ? "1px solid #475569"
                  : "1px solid #cbd5e1",
                background: escuro ? "#1e293b" : "#f8fafc",
                color: escuro ? "#f8fafc" : "#111827",
                cursor: saindo ? "not-allowed" : "pointer",
                fontWeight: 700,
                opacity: saindo ? 0.7 : 1,
              }}
            >
              {saindo ? "Saindo..." : "Sair"}
            </button>
          </>
        ) : !carregando ? (
          <button
            type="button"
            onClick={() => router.push("/login")}
            style={{
              height: "44px",
              padding: "0 14px",
              borderRadius: "10px",
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Entrar
          </button>
        ) : null}

        <button
          type="button"
          onClick={alternarTema}
          aria-label={
            escuro
              ? "Ativar tema claro"
              : "Ativar tema escuro"
          }
          title={
            escuro
              ? "Ativar tema claro"
              : "Ativar tema escuro"
          }
          style={{
            width: "44px",
            height: "44px",
            display: "grid",
            placeItems: "center",
            borderRadius: "50%",
            border: escuro
              ? "1px solid #475569"
              : "1px solid #cbd5e1",
            background: escuro ? "#1e293b" : "#f8fafc",
            color: escuro ? "#f8fafc" : "#111827",
            cursor: "pointer",
            fontSize: "20px",
            boxShadow: escuro
              ? "0 0 0 4px rgba(37, 99, 235, 0.12)"
              : "0 0 0 4px rgba(15, 23, 42, 0.06)",
            transition:
              "transform 0.15s ease, background-color 0.2s ease",
          }}
        >
          {escuro ? "🌙" : "☀️"}
        </button>
      </div>
    </header>
  );
}