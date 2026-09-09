"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";
import {
  carregarProgressoDaNuvem,
  coletarProgressoLocal,
  restaurarProgressoLocal,
  salvarProgressoNaNuvem,
  type DadosProgressoUsuario,
} from "@/services/progressoUsuario";

interface AuthContextValue {
  sessao: Session | null;
  usuario: User | null;
  carregando: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(
  null
);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;

    async function carregarSessaoInicial() {
      try {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();

        if (!ativo) {
          return;
        }

        if (error) {
          console.error(
            "Não foi possível carregar a sessão:",
            error
          );
        }

        setSessao(session);
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }

    carregarSessaoInicial();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_evento, novaSessao) => {
        if (!ativo) {
          return;
        }

        setSessao(novaSessao);
        setCarregando(false);
      }
    );

    return () => {
      ativo = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sessao?.user?.id) {
      return;
    }

    let ativo = true;

    async function sincronizarProgressoEmSegundoPlano() {
      try {
        const progressoLocal = coletarProgressoLocal();
        const progressoRemoto =
          await carregarProgressoDaNuvem();

        const temLocal =
          temProgressoRelevante(progressoLocal);
        const temRemoto =
          progressoRemoto !== null &&
          temProgressoRelevante(progressoRemoto.dados);

        if (!progressoRemoto || !temRemoto) {
          if (temLocal) {
            await salvarProgressoNaNuvem();

            if (ativo) {
              console.info(
                "Progresso local salvo com segurança no Supabase."
              );
            }
          }

          return;
        }

        if (!temLocal) {
          restaurarProgressoLocal(progressoRemoto.dados);

          if (ativo) {
            console.info(
              "Progresso da conta restaurado neste navegador."
            );
          }

          return;
        }

        if (ativo) {
          console.info(
            "Há progresso local e na nuvem. Nenhum deles foi sobrescrito automaticamente."
          );
        }
      } catch (erroSincronizacao) {
        if (!ativo) {
          return;
        }

        console.error(
          "Não foi possível sincronizar o progresso:",
          erroSincronizacao
        );
      }
    }

    sincronizarProgressoEmSegundoPlano();

    return () => {
      ativo = false;
    };
  }, [sessao?.user?.id]);

  const valor = useMemo<AuthContextValue>(
    () => ({
      sessao,
      usuario: sessao?.user ?? null,
      carregando,
    }),
    [sessao, carregando]
  );

  return (
    <AuthContext.Provider value={valor}>
      {children}
    </AuthContext.Provider>
  );
}

function temProgressoRelevante(
  progresso: DadosProgressoUsuario
): boolean {
  const dados = progresso.localStorage;

  const chavesRelevantes = [
    "cfs-pmesp-resultados",
    "cfs-pmesp-favoritas",
    "cfs-pmesp-simulados",
    "cfs-pmesp-cache-explicacoes-ia",
    "cfs-pmesp-historico",
  ] as const;

  return chavesRelevantes.some((chave) => {
    const valor = dados[chave];

    if (Array.isArray(valor)) {
      return valor.length > 0;
    }

    if (
      valor !== null &&
      typeof valor === "object"
    ) {
      return Object.keys(
        valor as Record<string, unknown>
      ).length > 0;
    }

    if (typeof valor === "string") {
      return valor.trim().length > 0;
    }

    return Boolean(valor);
  });
}

export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext);

  if (!contexto) {
    throw new Error(
      "useAuth deve ser utilizado dentro de AuthProvider."
    );
  }

  return contexto;
}