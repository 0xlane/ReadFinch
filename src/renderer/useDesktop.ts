import { useEffect, useState } from "react";
import type { Snapshot } from "../shared/api";

export function useDesktop() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const off = [
      window.readfinch.on("config", setSnapshot),
      window.readfinch.on("permissions", (permissions) =>
        setSnapshot((value) => (value ? { ...value, permissions } : value)),
      ),
      window.readfinch.on("update", (updates) =>
        setSnapshot((value) => (value ? { ...value, updates } : value)),
      ),
      window.readfinch.on("nativeStatus", (state) =>
        setSnapshot((value) =>
          value
            ? {
                ...value,
                nativeState: state.state,
                nativeStatus: state.message,
              }
            : value,
        ),
      ),
      window.readfinch.on("theme", (theme) => {
        document.documentElement.dataset.theme = theme.effective;
        setSnapshot((value) =>
          value ? { ...value, effectiveTheme: theme.effective } : value,
        );
      }),
    ];
    void window.readfinch
      .call("snapshot")
      .then(setSnapshot)
      .catch((error) => setError(error.message));
    return () => off.forEach((unsubscribe) => unsubscribe());
  }, []);
  useEffect(() => {
    if (!snapshot) return;
    document.documentElement.dataset.theme = snapshot.effectiveTheme;
    document.documentElement.style.setProperty(
      "--reading-size",
      snapshot.config.appearance.fontSize + "px",
    );
  }, [snapshot?.effectiveTheme, snapshot?.config.appearance.fontSize]);
  return { snapshot, setSnapshot, error };
}
