import type { Metadata } from "next";
import Script from "next/script";

import "./globals.css";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import { AuthProvider } from "../components/AuthProvider";

export const metadata: Metadata = {
  title: "CFS PMESP",
  description:
    "Plataforma inteligente de estudos para o CFS PMESP",
};

const scriptTema = `
(function () {
  const CHAVE = "cfs-pmesp-configuracoes";

  function lerTema() {
    try {
      const valor = localStorage.getItem(CHAVE);

      if (!valor) {
        return "sistema";
      }

      const configuracoes = JSON.parse(valor);
      const tema = configuracoes && configuracoes.tema;

      return tema === "claro" ||
        tema === "escuro" ||
        tema === "sistema"
        ? tema
        : "sistema";
    } catch {
      return "sistema";
    }
  }

  function temaEfetivo(tema) {
    if (tema === "claro" || tema === "escuro") {
      return tema;
    }

    return window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "escuro"
      : "claro";
  }

  function aplicarTema() {
    const tema = temaEfetivo(lerTema());
    const raiz = document.documentElement;

    raiz.dataset.tema = tema;
    raiz.style.colorScheme =
      tema === "escuro" ? "dark" : "light";

    raiz.style.setProperty(
      "--app-background",
      tema === "escuro" ? "#0f172a" : "#f8fafc"
    );

    raiz.style.setProperty(
      "--app-text",
      tema === "escuro" ? "#ffffff" : "#111827"
    );

    raiz.style.setProperty(
      "--app-surface",
      tema === "escuro" ? "#1e293b" : "#ffffff"
    );

    raiz.style.setProperty(
      "--app-border",
      tema === "escuro" ? "#334155" : "#e2e8f0"
    );
  }

  aplicarTema();

  window.addEventListener("storage", function (evento) {
    if (evento.key === CHAVE || evento.key === null) {
      aplicarTema();
    }
  });

  window.addEventListener(
    "cfs-pmesp-configuracoes-atualizadas",
    aplicarTema
  );

  window.addEventListener("focus", aplicarTema);

  const media = window.matchMedia(
    "(prefers-color-scheme: dark)"
  );

  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", aplicarTema);
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body
        style={{
          margin: 0,
          background: "var(--app-background, #0f172a)",
          color: "var(--app-text, #ffffff)",
        }}
      >
        <Script
          id="cfs-pmesp-tema-global"
          strategy="beforeInteractive"
        >
          {scriptTema}
        </Script>

        <AuthProvider>
          <div
            style={{
              display: "flex",
            minHeight: "100vh",
            background:
              "var(--app-background, #0f172a)",
            color: "var(--app-text, #ffffff)",
            fontFamily: "Arial, sans-serif",
            transition:
              "background-color 0.2s ease, color 0.2s ease",
          }}
        >
          <Sidebar />

          <div
            style={{
              flex: 1,
              minWidth: 0,
              background:
                "var(--app-background, #0f172a)",
              color: "var(--app-text, #ffffff)",
              transition:
                "background-color 0.2s ease, color 0.2s ease",
            }}
          >
            <Header />

            <main
              style={{
                padding: "32px",
                minHeight: "calc(100vh - 82px)",
                boxSizing: "border-box",
                background:
                  "var(--app-background, #0f172a)",
                color: "var(--app-text, #ffffff)",
                transition:
                  "background-color 0.2s ease, color 0.2s ease",
              }}
            >
              {children}
            </main>
            </div>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}