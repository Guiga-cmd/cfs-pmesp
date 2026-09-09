import { supabase } from "@/lib/supabase";

const CHAVES_PROGRESSO_LOCAL = [
  "cfs-pmesp-resultados",
  "cfs-pmesp-favoritas",
  "cfs-pmesp-simulados",
  "cfs-pmesp-cache-explicacoes-ia",
  "cfs-pmesp-historico",
  "cfs-pmesp-configuracoes",
] as const;

export type ChaveProgressoLocal =
  (typeof CHAVES_PROGRESSO_LOCAL)[number];

export interface DadosProgressoUsuario {
  versao: 1;
  salvoEm: string;
  localStorage: Partial<Record<ChaveProgressoLocal, unknown>>;
}

interface LinhaProgressoUsuario {
  user_id: string;
  dados: DadosProgressoUsuario;
  atualizado_em: string;
}

function lerJSONSeguro(valor: string): unknown {
  try {
    return JSON.parse(valor);
  } catch {
    return valor;
  }
}

export function coletarProgressoLocal(): DadosProgressoUsuario {
  if (typeof window === "undefined") {
    return {
      versao: 1,
      salvoEm: new Date().toISOString(),
      localStorage: {},
    };
  }

  const dados: Partial<
    Record<ChaveProgressoLocal, unknown>
  > = {};

  for (const chave of CHAVES_PROGRESSO_LOCAL) {
    const valor = window.localStorage.getItem(chave);

    if (valor === null) {
      continue;
    }

    dados[chave] = lerJSONSeguro(valor);
  }

  return {
    versao: 1,
    salvoEm: new Date().toISOString(),
    localStorage: dados,
  };
}

export async function salvarProgressoNaNuvem(): Promise<void> {
  const {
    data: { user },
    error: erroUsuario,
  } = await supabase.auth.getUser();

  if (erroUsuario) {
    throw erroUsuario;
  }

  if (!user) {
    throw new Error(
      "É necessário estar autenticado para salvar o progresso."
    );
  }

  const dados = coletarProgressoLocal();

  const { error } = await supabase
    .from("progresso_usuario")
    .upsert(
      {
        user_id: user.id,
        dados,
        atualizado_em: new Date().toISOString(),
      },
      {
        onConflict: "user_id",
      }
    );

  if (error) {
    throw error;
  }
}

export async function carregarProgressoDaNuvem(): Promise<
  LinhaProgressoUsuario | null
> {
  const {
    data: { user },
    error: erroUsuario,
  } = await supabase.auth.getUser();

  if (erroUsuario) {
    throw erroUsuario;
  }

  if (!user) {
    return null;
  }

  const { data, error } = await supabase
    .from("progresso_usuario")
    .select("user_id, dados, atualizado_em")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as LinhaProgressoUsuario | null) ?? null;
}

export function restaurarProgressoLocal(
  progresso: DadosProgressoUsuario
): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const chave of CHAVES_PROGRESSO_LOCAL) {
    if (!(chave in progresso.localStorage)) {
      continue;
    }

    const valor = progresso.localStorage[chave];

    if (typeof valor === "string") {
      window.localStorage.setItem(chave, valor);
    } else {
      window.localStorage.setItem(
        chave,
        JSON.stringify(valor)
      );
    }
  }

  window.dispatchEvent(
    new Event("cfs-pmesp-dados-atualizados")
  );
  window.dispatchEvent(
    new Event("cfs-pmesp-configuracoes-atualizadas")
  );
}