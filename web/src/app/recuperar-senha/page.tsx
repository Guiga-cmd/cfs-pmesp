"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

import { supabase } from "@/lib/supabase";

export default function RecuperarSenhaPage() {
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");

  async function enviarRecuperacao(
    evento: FormEvent<HTMLFormElement>
  ) {
    evento.preventDefault();

    if (enviando) {
      return;
    }

    setErro("");
    setSucesso("");
    setEnviando(true);

    try {
      const origem = window.location.origin;

      const { error } =
        await supabase.auth.resetPasswordForEmail(
          email.trim(),
          {
            redirectTo: `${origem}/redefinir-senha`,
          }
        );

      if (error) {
        throw error;
      }

      setSucesso(
        "Enviamos um link de recuperação para o seu e-mail."
      );
    } catch (erroRecuperacao) {
      setErro(
        erroRecuperacao instanceof Error
          ? traduzirErro(erroRecuperacao.message)
          : "Não foi possível enviar o e-mail de recuperação."
      );
    } finally {
      setEnviando(false);
    }
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
        onSubmit={enviarRecuperacao}
        style={{
          width: "min(100%, 430px)",
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
          <h1 style={{ margin: 0, fontSize: "28px" }}>
            Recuperar senha
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#94a3b8",
              lineHeight: 1.5,
            }}
          >
            Informe seu e-mail para receber o link de
            redefinição.
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
            disabled={enviando}
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

        {sucesso && (
          <div
            role="status"
            style={{
              padding: "12px 14px",
              borderRadius: "9px",
              border: "1px solid #22c55e",
              background: "#052e16",
              color: "#bbf7d0",
              lineHeight: 1.5,
            }}
          >
            {sucesso}
          </div>
        )}

        <button
          type="submit"
          disabled={enviando}
          style={{
            border: 0,
            borderRadius: "9px",
            padding: "12px 16px",
            fontWeight: 800,
            fontSize: "15px",
            cursor: enviando ? "not-allowed" : "pointer",
            background: enviando ? "#475569" : "#2563eb",
            color: "#ffffff",
          }}
        >
          {enviando ? "Enviando..." : "Enviar link"}
        </button>

        <div
          style={{
            textAlign: "center",
            fontSize: "14px",
          }}
        >
          <Link
            href="/login"
            style={{
              color: "#93c5fd",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Voltar para o login
          </Link>
        </div>
      </form>
    </section>
  );
}

function traduzirErro(mensagem: string): string {
  const texto = mensagem.toLowerCase();

  if (texto.includes("invalid email")) {
    return "Informe um endereço de e-mail válido.";
  }

  if (texto.includes("too many requests")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }

  return mensagem;
}