"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const CHAVE_CONFIGURACOES = "cfs-pmesp-configuracoes";

type Tema = "sistema" | "claro" | "escuro";

interface ConfiguracoesSalvas {
  tema?: Tema;
}

const menuItems = [
  { href: "/", icon: "🏠", label: "Dashboard" },
  { href: "/banco", icon: "📖", label: "Banco de Questões" },
  { href: "/simulados", icon: "📝", label: "Simulados" },
  { href: "/estatisticas", icon: "📊", label: "Estatísticas" },
  { href: "/importar", icon: "📂", label: "Importar PDF" },
  { href: "/configuracoes", icon: "⚙️", label: "Configurações" },
];

function lerTemaSalvo(): Tema {
  try {
    const valorSalvo = window.localStorage.getItem(
      CHAVE_CONFIGURACOES
    );

    if (!valorSalvo) {
      return "sistema";
    }

    const configuracoes = JSON.parse(
      valorSalvo
    ) as ConfiguracoesSalvas;

    if (
      configuracoes.tema === "claro" ||
      configuracoes.tema === "escuro" ||
      configuracoes.tema === "sistema"
    ) {
      return configuracoes.tema;
    }

    return "sistema";
  } catch (erro) {
    console.error(
      "Não foi possível carregar o tema da barra lateral:",
      erro
    );

    return "sistema";
  }
}

function temaEfetivo(tema: Tema): "claro" | "escuro" {
  if (tema === "claro" || tema === "escuro") {
    return tema;
  }

  return window.matchMedia("(prefers-color-scheme: dark)")
    .matches
    ? "escuro"
    : "claro";
}

export default function Sidebar() {
  const pathname = usePathname();
  const [tema, setTema] = useState<"claro" | "escuro">(
    "escuro"
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      "(prefers-color-scheme: dark)"
    );

    function aplicarTema() {
      setTema(temaEfetivo(lerTemaSalvo()));
    }

    function aoAlterarStorage(evento: StorageEvent) {
      if (
        evento.key === CHAVE_CONFIGURACOES ||
        evento.key === null
      ) {
        aplicarTema();
      }
    }

    aplicarTema();

    window.addEventListener("storage", aoAlterarStorage);
    window.addEventListener("focus", aplicarTema);
    window.addEventListener(
      "cfs-pmesp-configuracoes-atualizadas",
      aplicarTema
    );

    mediaQuery.addEventListener("change", aplicarTema);

    return () => {
      window.removeEventListener(
        "storage",
        aoAlterarStorage
      );
      window.removeEventListener("focus", aplicarTema);
      window.removeEventListener(
        "cfs-pmesp-configuracoes-atualizadas",
        aplicarTema
      );

      mediaQuery.removeEventListener(
        "change",
        aplicarTema
      );
    };
  }, [pathname]);

  const temaEscuro = tema === "escuro";

  return (
    <aside
      style={{
        width: "260px",
        minHeight: "100vh",
        background: temaEscuro ? "#111827" : "#ffffff",
        color: temaEscuro ? "#ffffff" : "#111827",
        borderRight: temaEscuro
          ? "1px solid #273449"
          : "1px solid #e2e8f0",
        padding: "24px 18px",
        boxSizing: "border-box",
        flexShrink: 0,
        transition:
          "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      <h2
        style={{
          margin: "0 0 32px",
          padding: "0 12px",
          fontSize: "22px",
        }}
      >
        📚 CFS PMESP
      </h2>

      <nav>
        {menuItems.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: "block",
                color: active
                  ? "#ffffff"
                  : temaEscuro
                    ? "#ffffff"
                    : "#111827",
                textDecoration: "none",
                padding: "12px 14px",
                marginBottom: "8px",
                borderRadius: "9px",
                fontSize: "16px",
                background: active
                  ? "#2563eb"
                  : "transparent",
                transition:
                  "background-color 0.15s ease, color 0.15s ease",
              }}
            >
              <span style={{ marginRight: "10px" }}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}