import { useEffect, useRef } from "react";
import type { Controller } from "./use-control-panel.js";

export function ProjectDialog({
  setAdding,
  addProject,
  busy,
  notice,
}: Controller) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="add-title"
      onCancel={() => setAdding(false)}
    >
      <button
        className="modal-close"
        aria-label="Close"
        onClick={() => setAdding(false)}
      >
        ×
      </button>
      <h2 id="add-title">Add a project</h2>
      <p>
        Choose an existing local project. Anhedral reads its configuration; it
        does not reinitialize the app.
      </p>
      {notice && <p role="alert">{notice}</p>}
      <form onSubmit={addProject}>
        <label>
          Project folder
          <input
            name="folder"
            required
            autoFocus
            placeholder="/path/to/your/project"
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "Adding…" : "Add project"}
        </button>
      </form>
    </dialog>
  );
}
