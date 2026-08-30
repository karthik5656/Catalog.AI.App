import { Link, Outlet } from "react-router-dom";
import { remoteApps } from "../remoteApps.generated";
import type { RemoteAppRoute } from "../types";

console.log("remoteApps", remoteApps);

function ShellLayout() {
	return (
		<div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
			<header
				style={{
					padding: "12px 24px",
					borderBottom: "1px solid var(--border, #e5e4e7)",
					display: "flex",
					alignItems: "center",
					gap: "24px",
					background: "var(--bg, #fff)",
				}}
			>
				<Link to="/" style={{ fontWeight: 600, fontSize: "18px", color: "var(--text-h, #08060d)", textDecoration: "none" }}>
					UI Catalog
				</Link>
				<nav style={{ display: "flex", gap: "16px" }}>
					<Link to="/" style={{ color: "var(--text, #6b6375)", textDecoration: "none" }}>
						Home
					</Link>
					{(remoteApps as RemoteAppRoute[]).map(({ route, label }) => (
						<Link key={route} to={`/${route}`} style={{ color: "var(--text, #6b6375)", textDecoration: "none" }}>
							{label}
						</Link>
					))}
				</nav>
			</header>
			<main style={{ flex: 1 }}>
				<Outlet />
			</main>
		</div>
	);
}

export default ShellLayout;
