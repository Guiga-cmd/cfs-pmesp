export default function Sidebar() {
  return (
    <aside
      style={{
        width: "250px",
        background: "#111827",
        color: "white",
        padding: "20px",
        height: "100vh",
      }}
    >
      <h2 style={{ marginBottom: "30px" }}>📚 CFS PMESP</h2>

      <nav>
        <p>🏠 Início</p>
        <p>📖 Banco de Questões</p>
        <p>📝 Simulados</p>
        <p>📊 Estatísticas</p>
        <p>⭐ Favoritas</p>
        <p>📂 Importar PDF</p>
        <p>⚙️ Configurações</p>
      </nav>
    </aside>
  );
}