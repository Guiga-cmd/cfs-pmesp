"use client";

import { FormEvent, useState } from "react";

interface RespostaIA {
  explicacao?: string;
  erro?: string;
}

export default function PaginaIA() {
  const [pergunta, setPergunta] = useState("");
  const [resposta, setResposta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState("");

  async function explicarQuestao(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const texto = pergunta.trim();

    if (!texto) {
      setErro("Digite ou cole uma questão antes de enviar.");
      return;
    }

    setCarregando(true);
    setErro("");
    setResposta("");

    try {
      const respostaHttp = await fetch("/api/ia/explicar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          questao: texto,
        }),
      });

      const dados = (await respostaHttp.json()) as RespostaIA;

      if (!respostaHttp.ok) {
        throw new Error(
          dados.erro || "Não foi possível gerar a explicação."
        );
      }

      if (!dados.explicacao) {
        throw new Error("A IA não retornou uma explicação.");
      }

      setResposta(dados.explicacao);
    } catch (erroEnvio) {
      setErro(
        erroEnvio instanceof Error
          ? erroEnvio.message
          : "Ocorreu um erro inesperado."
      );
    } finally {
      setCarregando(false);
    }
  }

  function limpar() {
    setPergunta("");
    setResposta("");
    setErro("");
  }

  return (
    <main
      style={{
        display: "grid",
        gap: "22px",
      }}
    >
      <header>
        <h1 style={{ margin: 0 }}>IA de Estudos</h1>

        <p
          style={{
            marginTop: "8px",
            marginBottom: 0,
            color: "#94a3b8",
          }}
        >
          Cole uma questão para receber uma explicação didática.
        </p>
      </header>

      <section
        style={{
          background: "#1e293b",
          border: "1px solid #334155",
          borderRadius: "14px",
          padding: "20px",
        }}
      >
        <form
          onSubmit={explicarQuestao}
          style={{
            display: "grid",
            gap: "14px",
          }}
        >
          <label
            htmlFor="questao-ia"
            style={{
              fontWeight: 700,
              color: "#f8fafc",
            }}
          >
            Questão
          </label>

          <textarea
            id="questao-ia"
            value={pergunta}
            onChange={(event) => setPergunta(event.target.value)}
            placeholder="Cole aqui o enunciado, as alternativas e, se possível, o gabarito..."
            maxLength={12000}
            rows={14}
            disabled={carregando}
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              background: "#0f172a",
              color: "#f8fafc",
              border: "1px solid #475569",
              borderRadius: "10px",
              padding: "14px",
              fontSize: "15px",
              lineHeight: 1.6,
              outline: "none",
            }}
          />

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <button
              type="submit"
              disabled={carregando || !pergunta.trim()}
              style={{
                padding: "12px 20px",
                border: "1px solid #2563eb",
                borderRadius: "8px",
                background:
                  carregando || !pergunta.trim()
                    ? "#475569"
                    : "#2563eb",
                color: "#ffffff",
                cursor:
                  carregando || !pergunta.trim()
                    ? "not-allowed"
                    : "pointer",
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              {carregando
                ? "Gerando explicação..."
                : "Explicar com IA"}
            </button>

            <button
              type="button"
              onClick={limpar}
              disabled={carregando}
              style={{
                padding: "12px 20px",
                border: "1px solid #64748b",
                borderRadius: "8px",
                background: "#ffffff",
                color: "#111827",
                cursor: carregando ? "not-allowed" : "pointer",
                fontSize: "15px",
                fontWeight: 700,
              }}
            >
              Limpar
            </button>
          </div>
        </form>
      </section>

      {erro && (
        <section
          style={{
            background: "#3f1d24",
            border: "1px solid #ef4444",
            borderRadius: "14px",
            padding: "18px",
            color: "#fecaca",
          }}
        >
          {erro}
        </section>
      )}

      {resposta && (
        <section
          style={{
            background: "#1e293b",
            border: "1px solid #334155",
            borderRadius: "14px",
            padding: "20px",
          }}
        >
          <h2
            style={{
              marginTop: 0,
              fontSize: "20px",
            }}
          >
            Explicação
          </h2>

          <div
            style={{
              whiteSpace: "pre-wrap",
              color: "#e2e8f0",
              lineHeight: 1.7,
            }}
          >
            {resposta}
          </div>

          <p
            style={{
              marginBottom: 0,
              marginTop: "18px",
              color: "#94a3b8",
              fontSize: "13px",
            }}
          >
            Explicação gerada por IA. Em caso de dúvida, confira
            o gabarito e o material oficial.
          </p>
        </section>
      )}
    </main>
  );
}