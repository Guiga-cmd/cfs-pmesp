import { supabase } from "../../lib/supabase";

export default async function TesteSupabase() {
  const { data, error } = await supabase
    .from("questoes")
    .select("*")
    .limit(1);

  return (
    <div
      style={{
        padding: "40px",
        background: "#0f172a",
        color: "white",
        minHeight: "100vh",
        fontFamily: "Arial",
      }}
    >
      <h1>Teste de conexão com o Supabase</h1>

      {error ? (
        <p style={{ color: "tomato" }}>
          ❌ Erro: {error.message}
        </p>
      ) : (
        <p style={{ color: "lightgreen" }}>
          ✅ Conectado com sucesso!
        </p>
      )}

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}