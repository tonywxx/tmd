import { useEffect, useState } from "react";
import { api } from "../../lib/bridge";
import { useStore } from "../../lib/store";

export default function AboutDialog() {
	const setAboutOpen = useStore((s) => s.setAboutOpen);
	const [version, setVersion] = useState("…");

	useEffect(() => {
		void api
			.appVersion()
			.then(setVersion)
			.catch(() => setVersion("unknown"));
	}, []);

	return (
		<div className="modal-backdrop" onClick={() => setAboutOpen(false)}>
			<div className="modal about-modal" onClick={(e) => e.stopPropagation()}>
				<div className="modal-header">About tmd</div>
				<div className="modal-body about-body">
					<div className="about-logo">tmd</div>
					<p className="about-sub">
						TONy Markdown — a fast, native markdown editor.
					</p>
					<p>Version {version}</p>
					<div className="about-links">
						<button
							className="btn"
							onClick={() => api.openExternal("https://github.com/tonywxx/tmd")}
						>
							GitHub
						</button>
					</div>
				</div>
				<div className="modal-footer">
					<button className="btn primary" onClick={() => setAboutOpen(false)}>
						Close
					</button>
				</div>
			</div>
		</div>
	);
}
