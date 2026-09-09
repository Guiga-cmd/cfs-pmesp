"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useAuth } from "@/components/AuthProvider";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const { usuario, carregando } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!carregando && usuario) {
      router.replace("/");
    }
  }, [carregando, usuario, router]);

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();

    if (entrando) {
      return;
    }

    setErro("");
    setEntrando(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: senha,
      });

      if (error) {
        throw error;
      }

      router.replace("/");
      router.refresh();
    } catch (erroLogin) {
      setErro(
        erroLogin instanceof Error
          ? traduzirErroLogin(erroLogin.message)
          : "Não foi possível entrar."
      );
    } finally {
      setEntrando(false);
    }
  }

  if (carregando || usuario) {
    return (
      <section
        style={{
          minHeight: "calc(100vh - 146px)",
          display: "grid",
          placeItems: "center",
        }}
      >
        <strong>Carregando...</strong>
      </section>
    );
  }

  return (
    <section
      style={{
        minHeight: "calc(100vh - 146px)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <form
        onSubmit={entrar}
        style={{
          width: "min(100%, 420px)",
          display: "grid",
          gap: "18px",
          padding: "28px",
          borderRadius: "16px",
          border: "1px solid var(--app-border, #334155)",
          background: "var(--app-surface, #1e293b)",
          boxSizing: "border-box",
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: "28px",
            }}
          >
            Entrar
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Acesse sua conta para continuar na plataforma.
          </p>
        </div>

        <label
          style={{
            display: "grid",
            gap: "7px",
            fontWeight: 700,
          }}
        >
          E-mail

          <input
            type="email"
            value={email}
            onChange={(evento) => setEmail(evento.target.value)}
            autoComplete="email"
            required
            disabled={entrando}
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

        <label
          style={{
            display: "grid",
            gap: "7px",
            fontWeight: 700,
          }}
        >
          Senha

          <input
            type="password"
            value={senha}
            onChange={(evento) => setSenha(evento.target.value)}
            autoComplete="current-password"
            required
            minLength={6}
            disabled={entrando}
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

        {erro && (
          <div
            role="alert"
            style={{
              padding: "12px 14px",
              borderRadius: "9px",
              border: "1px solid #ef4444",
              background: "#450a0a",
              color: "#fecaca",
              lineHeight: 1.5,
            }}
          >
            {erro}
          </div>
        )}

        <button
          type="submit"
          disabled={entrando}
          style={{
            border: 0,
            borderRadius: "9px",
            padding: "12px 16px",
            fontWeight: 800,
            fontSize: "15px",
            cursor: entrando ? "not-allowed" : "pointer",
            background: entrando ? "#475569" : "#2563eb",
            color: "#ffffff",
          }}
        >
          {entrando ? "Entrando..." : "Entrar"}
        </button>

        <div
          style={{
            display: "grid",
            gap: "8px",
            textAlign: "center",
            fontSize: "14px",
          }}
        >
          <Link
            href="/recuperar-senha"
            style={{
              color: "#93c5fd",
              textDecoration: "none",
            }}
          >
            Esqueci minha senha
          </Link>

          <span style={{ color: "#94a3b8" }}>
            Ainda não tem conta?{" "}
            <Link
              href="/cadastro"
              style={{
                color: "#93c5fd",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Criar conta
            </Link>
          </span>
        </div>
      </form>
    </section>
  );
}

function traduzirErroLogin(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }

  if (texto.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }

  if (texto.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }

  return mensagem;
}