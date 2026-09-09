"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";

export default function RedefinirSenhaPage() {
  const router = useRouter();
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [verificando, setVerificando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sessaoValida, setSessaoValida] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    let ativo = true;

    async function verificarSessao() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!ativo) return;
        if (error) throw error;

        setSessaoValida(Boolean(session));
      } catch (erroSessao) {
        if (!ativo) return;

        setErro(
          erroSessao instanceof Error
            ? erroSessao.message
            : "Não foi possível validar o link de recuperação."
        );
      } finally {
        if (ativo) setVerificando(false);
      }
    }

    verificarSessao();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, sessao) => {
      if (!ativo) return;

      if (evento === "PASSWORD_RECOVERY" || Boolean(sessao)) {
        setSessaoValida(true);
        setVerificando(false);
      }
    });

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  async function redefinirSenha(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (salvando) return;

    setErro("");
    setSucesso("");

    if (senha !== confirmarSenha) {
      setErro("As senhas informadas não coincidem.");
      return;
    }

    setSalvando(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: senha,
      });

      if (error) throw error;

      setSucesso(
        "Senha alterada com sucesso. Você será direcionado para o login."
      );
      setSenha("");
      setConfirmarSenha("");

      await supabase.auth.signOut();

      window.setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1800);
    } catch (erroAtualizacao) {
      setErro(
        erroAtualizacao instanceof Error
          ? traduzirErro(erroAtualizacao.message)
          : "Não foi possível alterar a senha."
      );
    } finally {
      setSalvando(false);
    }
  }

  if (verificando) {
    return (
      <section style={estiloCentralizado}>
        <strong>Validando link de recuperação...</strong>
      </section>
    );
  }

  if (!sessaoValida) {
    return (
      <section style={estiloCentralizado}>
        <div style={estiloFormulario}>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px" }}>
              Link inválido ou expirado
            </h1>
            <p style={{ margin: "8px 0 0", color: "#94a3b8", lineHeight: 1.5 }}>
              Solicite um novo link para redefinir sua senha.
            </p>
          </div>

          {erro && <div role="alert" style={estiloErro}>{erro}</div>}

          <Link href="/recuperar-senha" style={estiloLinkBotao}>
            Solicitar novo link
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section style={estiloCentralizado}>
      <form onSubmit={redefinirSenha} style={estiloFormulario}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>
            Definir nova senha
          </h1>
          <p style={{ margin: "8px 0 0", color: "#94a3b8", lineHeight: 1.5 }}>
            Digite e confirme sua nova senha.
          </p>
        </div>

        <CampoSenha
          rotulo="Nova senha"
          valor={senha}
          aoAlterar={setSenha}
          autoComplete="new-password"
          desabilitado={salvando}
        />

        <CampoSenha
          rotulo="Confirmar nova senha"
          valor={confirmarSenha}
          aoAlterar={setConfirmarSenha}
          autoComplete="new-password"
          desabilitado={salvando}
        />

        {erro && <div role="alert" style={estiloErro}>{erro}</div>}
        {sucesso && <div role="status" style={estiloSucesso}>{sucesso}</div>}

        <button
          type="submit"
          disabled={salvando}
          style={{
            border: 0,
            borderRadius: "9px",
            padding: "12px 16px",
            fontWeight: 800,
            fontSize: "15px",
            cursor: salvando ? "not-allowed" : "pointer",
            background: salvando ? "#475569" : "#2563eb",
            color: "#ffffff",
          }}
        >
          {salvando ? "Salvando..." : "Salvar nova senha"}
        </button>

        <div style={{ textAlign: "center", fontSize: "14px" }}>
          <Link
            href="/login"
            style={{ color: "#93c5fd", fontWeight: 700, textDecoration: "none" }}
          >
            Voltar para o login
          </Link>
        </div>
      </form>
    </section>
  );
}

function CampoSenha({
  rotulo,
  valor,
  aoAlterar,
  autoComplete,
  desabilitado,
}: {
  rotulo: string;
  valor: string;
  aoAlterar: (valor: string) => void;
  autoComplete: string;
  desabilitado: boolean;
}) {
  return (
    <label style={{ display: "grid", gap: "7px", fontWeight: 700 }}>
      {rotulo}
      <input
        type="password"
        value={valor}
        onChange={(evento) => aoAlterar(evento.target.value)}
        autoComplete={autoComplete}
        required
        minLength={6}
        disabled={desabilitado}
        style={{
          width: "100%",
          padding: "12px 13px",
          borderRadius: "9px",
          border: "1px solid #475569",
          background: "#0f172a",
          color: "#ffffff",
          fontSize: "15px",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

const estiloCentralizado = {
  minHeight: "calc(100vh - 146px)",
  display: "grid",
  placeItems: "center",
} as const;

const estiloFormulario = {
  width: "min(100%, 440px)",
  display: "grid",
  gap: "18px",
  padding: "28px",
  borderRadius: "16px",
  border: "1px solid var(--app-border, #334155)",
  background: "var(--app-surface, #1e293b)",
  boxSizing: "border-box",
} as const;

const estiloErro = {
  padding: "12px 14px",
  borderRadius: "9px",
  border: "1px solid #ef4444",
  background: "#450a0a",
  color: "#fecaca",
  lineHeight: 1.5,
} as const;

const estiloSucesso = {
  padding: "12px 14px",
  borderRadius: "9px",
  border: "1px solid #22c55e",
  background: "#052e16",
  color: "#bbf7d0",
  lineHeight: 1.5,
} as const;

const estiloLinkBotao = {
  display: "block",
  borderRadius: "9px",
  padding: "12px 16px",
  background: "#2563eb",
  color: "#ffffff",
  fontWeight: 800,
  textDecoration: "none",
  textAlign: "center",
} as const;

function traduzirErro(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes("password should be at least")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }

  if (
    texto.includes("auth session missing") ||
    texto.includes("session")
  ) {
    return "O link expirou ou não é mais válido.";
  }

  return mensagem;
}