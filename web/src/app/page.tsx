import Sidebar from "../components/Sidebar";

export default function Home() {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
      }}
    >
      <Sidebar />

      <main
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          background: "#0f172a",
          color: "white",
          fontFamily: "Arial",
        }}
      >
        <h1 style={{ fontSize: "42px", marginBottom: "10px" }}>
          📚 CFS PMESP
        </h1>

        <p style={{ fontSize: "20px", marginBottom: "40px" }}>
          Banco de Questões Inteligente
        </p>

        <button style={{ width: 260, height: 50, margin: 10 }}>
          📖 Banco de Questões
        </button>

        <button style={{ width: 260, height: 50, margin: 10 }}>
          📝 Simulados
        </button>

        <button style={{ width: 260, height: 50, margin: 10 }}>
          📊 Meu Desempenho
        </button>

        <button style={{ width: 260, height: 50, margin: 10 }}>
          📂 Importar PDF
        </button>
      </main>
    </div>
  );
}