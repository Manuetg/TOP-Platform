import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import { useGlobalSearch } from "../queries/use-global-search";
import { entityPaths, groupNames, moduleOptions, type ModuleTarget } from "../navigation";
import type { SearchType } from "../types";
import "./GlobalSearch.css";

type Option = { key: string; label: string; subtitle?: string | null; status?: string; group: string; activate: () => void };
type Props = {
  onModuleNavigate: (target: ModuleTarget) => void;
  onEntityNavigate?: (path: string) => void;
  onOpen?: () => void;
  onChange?: (value: string) => void;
  menuOpen?: boolean;
  variant?: "desktop" | "mobile";
};

export function GlobalSearch({ onModuleNavigate, onEntityNavigate, onOpen, onChange, menuOpen = false, variant = "desktop" }: Props) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<{ scope: string; key: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  const visible = open && !menuOpen;
  const remote = useGlobalSearch(text, visible);
  const scope = JSON.stringify([remote.scope, text]);
  const normalized = text.trim().toLocaleLowerCase("es");

  const close = () => { setOpen(false); setText(""); setSelection(null); };
  useEffect(() => { if (menuOpen) { setOpen(false); setText(""); setSelection(null); } }, [menuOpen]);
  useEffect(() => { setOpen(false); setText(""); setSelection(null); }, [remote.scope]);
  useEffect(() => {
    if (!visible) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) { setOpen(false); setText(""); setSelection(null); }
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [visible]);

  const finish = (action: () => void) => {
    close();
    action();
    // El shell persiste: enfocar el contenido después de la navegación.
    window.requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(".top-app-shell__content h1, .top-app-shell__content");
      if (target) { target.setAttribute("tabindex", "-1"); target.focus(); }
    });
  };
  const modules: Option[] = normalized ? moduleOptions.filter((item) => item.label.toLocaleLowerCase("es").includes(normalized)).map((item) => ({
    key: `module-${item.id}`, label: item.label, group: "Módulos", activate: () => finish(() => onModuleNavigate(item.id)),
  })) : [];
  const entities: Option[] = (remote.data?.groups ?? []).flatMap((group) => {
    const items: Option[] = group.items.map((item) => ({
      key: `${item.type}-${item.id}`, label: item.title, subtitle: item.subtitle, status: item.status,
      group: groupNames[group.type], activate: () => finish(() => onEntityNavigate?.(`${entityPaths[item.type]}/${encodeURIComponent(item.id)}`)),
    }));
    if (group.hasMore) items.push({ key: `more-${group.type}`, label: `Abrir módulo: ${groupNames[group.type]}`, subtitle: "Hay más resultados. El módulo se abre sin aplicar esta búsqueda.", group: groupNames[group.type], activate: () => finish(() => onModuleNavigate(({ resource: "resources", contact: "contacts", booking: "bookings" } as const)[group.type])) });
    return items;
  });
  const options = [...modules, ...entities];
  const active = selection?.scope === scope ? options.find((option) => option.key === selection.key) : undefined;
  const optionId = (key: string) => `${id}-${key}`;
  const groups = ["Módulos", ...Object.values(groupNames)];
  const select = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key === "Enter" && visible && options.length) { event.preventDefault(); (active ?? options[0]).activate(); return; }
    if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
    event.preventDefault(); setOpen(true); onOpen?.();
    const index = active ? options.indexOf(active) : -1;
    const next = event.key === "ArrowDown" ? Math.min(index + 1, options.length - 1) : index <= 0 ? options.length - 1 : index - 1;
    if (options[next]) setSelection({ scope, key: options[next].key });
  };
  const message = !normalized ? "Busca módulos o entidades. Las reservas se buscan por UUID completo." : text.trim().length > 120 ? "Ingresa hasta 120 caracteres." : text.trim().length < 2 ? "Escribe al menos 2 caracteres para buscar entidades." : remote.loading ? "Buscando entidades…" : remote.error ? "No pudimos buscar entidades. Puedes seguir usando los módulos." : `${options.length} opciones disponibles. Las reservas se buscan por UUID completo.`;

  return (
    <div className="top-global-search" ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(); }}>
      <label className={`top-global-search__input ${variant === "mobile" ? "top-mobile-header__search" : "top-global-header__search"}`}>
        <Search size={18} aria-hidden="true" />
        <input ref={input} type="search" role="combobox" aria-label="Buscar en TOP" placeholder="Buscar en TOP..."
          aria-expanded={visible} aria-controls={visible ? `${id}-list` : undefined} aria-autocomplete="list"
          aria-activedescendant={visible && active ? optionId(active.key) : undefined} aria-describedby={visible ? `${id}-status` : undefined}
          value={text} onFocus={() => { setOpen(true); onOpen?.(); }} onKeyDown={select}
          onChange={(event) => { setText(event.target.value); setOpen(true); setSelection(null); onOpen?.(); onChange?.(event.target.value); }} />
      </label>
      {visible && <section className="top-global-search__panel" aria-label="Panel del encabezado">
        <p id={`${id}-status`} role="status" aria-live="polite">{message}</p>
        {remote.error && <button type="button" className="top-button top-button--secondary" onClick={remote.retry}>Reintentar búsqueda</button>}
        <div role="listbox" id={`${id}-list`} aria-label="Resultados de búsqueda">
          {groups.map((group) => {
            const entries = options.filter((option) => option.group === group);
            const remoteGroup = remote.data?.groups.find((value) => groupNames[value.type as SearchType] === group);
            if (!entries.length && !remoteGroup) return null;
            return <div role="group" aria-label={group} key={group}>
              <strong className="top-global-search__group">{group}</strong>
              {!entries.length && <p>Sin resultados en {group.toLowerCase()}.</p>}
              {entries.map((option) => <div role="option" id={optionId(option.key)} aria-selected={active?.key === option.key} key={option.key}
                className="top-global-search__option" onMouseDown={(event) => event.preventDefault()}
                onClick={option.activate}>
                <span>{option.label}</span>{option.subtitle && <small>{option.subtitle}</small>}{option.status && <small>{option.status}</small>}
              </div>)}
            </div>;
          })}
        </div>
        {normalized && !modules.length && <p>No encontramos un módulo con ese nombre.</p>}
      </section>}
    </div>
  );
}
