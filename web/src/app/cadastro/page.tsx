"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function CadastroPage() {
  const router = useRouter();
  const { usuario, carregando } = useAuth();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [cadastrando, setCadastrando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  useEffect(() => {
    if (!carregando && usuario) {
      router.replace("/");
    }
  }, [carregando, usuario, router]);

  async function cadastrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (cadastrando) return;

    setErro("");
    setSucesso("");

    if (senha !== confirmarSenha) {
      setErro("As senhas informadas não coincidem.");
      return;
    }

    setCadastrando(true);

    try {
      const origem =
        typeof window !== "undefined"
          ? window.location.origin
          : undefined;

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: senha,
        options: {
          data: {
            nome: nome.trim(),
          },
          emailRedirectTo: origem
            ? `${origem}/login`
            : undefined,
        },
      });

      if (error) throw error;

      if (data.session) {
        router.replace("/");
        router.refresh();
        return;
      }

      setSucesso(
        "Cadastro realizado. Verifique seu e-mail para confirmar a conta."
      );
      setSenha("");
      setConfirmarSenha("");
    } catch (erroCadastro) {
      setErro(
        erroCadastro instanceof Error
          ? traduzirErroCadastro(erroCadastro.message)
          : "Não foi possível criar a conta."
      );
    } finally {
      setCadastrando(false);
    }
  }

  if (carregando || usuario) {
    return (
      <section style={estiloCentralizado}>
        <strong>Carregando...</strong>
      </section>
    );
  }

  return (
    <section style={estiloCentralizado}>
      <form onSubmit={cadastrar} style={estiloFormulario}>
        <div>
          <h1 style={{ margin: 0, fontSize: "28px" }}>
            Criar conta
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Cadastre-se para acessar a plataforma.
          </p>
        </div>

        <Campo
          rotulo="Nome"
          tipo="text"
          valor={nome}
          aoAlterar={setNome}
          autoComplete="name"
          desabilitado={cadastrando}
        />

        <Campo
          rotulo="E-mail"
          tipo="email"
          valor={email}
          aoAlterar={setEmail}
          autoComplete="email"
          desabilitado={cadastrando}
        />

        <Campo
          rotulo="Senha"
          tipo="password"
          valor={senha}
          aoAlterar={setSenha}
          autoComplete="new-password"
          desabilitado={cadastrando}
          minimo={6}
        />

        <Campo
          rotulo="Confirmar senha"
          tipo="password"
          valor={confirmarSenha}
          aoAlterar={setConfirmarSenha}
          autoComplete="new-password"
          desabilitado={cadastrando}
          minimo={6}
        />

        {erro && (
          <div role="alert" style={estiloErro}>
            {erro}
          </div>
        )}

        {sucesso && (
          <div role="status" style={estiloSucesso}>
            {sucesso}
          </div>
        )}

        <button
          type="submit"
          disabled={cadastrando}
          style={{
            border: 0,
            borderRadius: "9px",
            padding: "12px 16px",
            fontWeight: 800,
            fontSize: "15px",
            cursor: cadastrando ? "not-allowed" : "pointer",
            background: cadastrando ? "#475569" : "#2563eb",
            color: "#ffffff",
          }}
        >
          {cadastrando ? "Criando conta..." : "Criar conta"}
        </button>

        <div
          style={{
            textAlign: "center",
            color: "#94a3b8",
            fontSize: "14px",
          }}
        >
          Já tem uma conta?{" "}
          <Link
            href="/login"
            style={{
              color: "#93c5fd",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Entrar
          </Link>
        </div>
      </form>
    </section>
  );
}

function Campo({
  rotulo,
  tipo,
  valor,
  aoAlterar,
  autoComplete,
  desabilitado,
  minimo,
}: {
  rotulo: string;
  tipo: "text" | "email" | "password";
  valor: string;
  aoAlterar: (valor: string) => void;
  autoComplete: string;
  desabilitado: boolean;
  minimo?: number;
}) {
  return (
    <label
      style={{
        display: "grid",
        gap: "7px",
        fontWeight: 700,
      }}
    >
      {rotulo}

      <input
        type={tipo}
        value={valor}
        onChange={(evento) => aoAlterar(evento.target.value)}
        autoComplete={autoComplete}
        required
        minLength={minimo}
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
  width: "min(100%, 460px)",
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

function traduzirErroCadastro(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes("user already registered")) {
    return "Este e-mail já está cadastrado.";
  }

  if (texto.includes("password should be at least")) {
    return "A senha deve ter pelo menos 6 caracteres.";
  }

  if (texto.includes("invalid email")) {
    return "Informe um endereço de e-mail válido.";
  }

  if (texto.includes("signup is disabled")) {
    return "O cadastro de novos usuários está desativado.";
  }

  if (texto.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }

  return mensagem;
}