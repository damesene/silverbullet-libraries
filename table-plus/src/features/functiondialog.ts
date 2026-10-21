// The formulas module's Functions dialog (Excel's Insert Function): every
// function formulas can call, built-in and custom, found by its name or what
// it does and by group, each with its syntax, what it does and an example.
// The one picked goes into the formula being edited (Insert, Enter, a double
// click); the dialog is the core's (TableHost.openDialog), so the cell editor
// stays open behind it.
import type { Dialog, TableHost } from "../core/feature.ts";
import { findFunctions, FUNCTION_CATEGORIES, type FormulaFunction, type FunctionCategory } from "../formulas/index.ts";

type Group = FunctionCategory | "custom" | undefined;

export class FunctionDialog {
  private dialog: Dialog | undefined;

  constructor(private readonly host: TableHost) {}

  /** Opens the dialog; `formula`: the formula being edited (the caret marked), `insert` gets the name picked */
  open(formula: string, insert: (name: string) => void): void {
    const { doc } = this.host;
    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
      const e = doc.createElement(tag);
      e.className = className;
      if (text !== undefined) e.textContent = text;
      return e;
    };
    let group: Group;
    let found: FormulaFunction[] = [];
    let picked = 0;

    const search = el("input", "tp-functions-search");
    search.type = "search";
    search.placeholder = "Search by name or what it does";
    search.setAttribute("aria-label", "Search functions");
    const groups = el("div", "tp-functions-groups");
    groups.setAttribute("role", "group");
    const list = el("div", "tp-functions-list");
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Functions");
    const detail = el("div", "tp-functions-detail");
    const content = el("div", "tp-functions");
    const main = el("div", "tp-functions-main");
    main.append(list, detail);
    content.append(search, groups, main);

    const insertButton = el("button", "tp-dialog-primary", "Insert");
    insertButton.type = "button";
    const cancel = el("button", "tp-dialog-button", "Cancel");
    cancel.type = "button";
    const note = el("span", "tp-dialog-note");
    const footer = el("div", "tp-functions-foot");
    footer.append(note, cancel, insertButton);

    const choose = (index: number) => {
      const f = found[index];
      if (!f) return;
      this.close();
      insert(f.name);
    };

    // The groups that have functions, All first, Custom last
    const all = findFunctions("");
    const present: Group[] = [
      undefined,
      ...(Object.keys(FUNCTION_CATEGORIES) as FunctionCategory[]).filter((c) => all.some((f) => f.category === c)),
      ...(all.some((f) => f.category === undefined) ? (["custom"] as const) : []),
    ];
    const groupButtons = present.map((g) => {
      const button = el("button", "tp-functions-group", g === undefined ? "All" : g === "custom" ? "Custom" : FUNCTION_CATEGORIES[g]);
      button.type = "button";
      button.addEventListener("click", () => {
        group = g;
        picked = 0;
        update();
        search.focus();
      });
      groups.append(button);
      return { group: g, button };
    });

    const showDetail = () => {
      detail.replaceChildren();
      const f = found[picked];
      insertButton.disabled = !f;
      if (!f) return;
      detail.append(el("h3", "tp-functions-name", f.name));
      detail.append(el("code", "tp-functions-syntax", f.syntax));
      if (f.description) detail.append(el("p", "tp-functions-description", f.description));
      if (f.example) {
        const example = el("div", "tp-functions-example");
        example.append(el("span", "tp-functions-label", "Example"), el("code", "", f.example));
        detail.append(example);
      }
      detail.append(el("p", "tp-functions-group-name", f.category ? FUNCTION_CATEGORIES[f.category] : "Custom function"));
    };

    const showPicked = () => {
      Array.from(list.children).forEach((option, i) => option.setAttribute("aria-selected", String(i === picked)));
      const option = list.children[picked] as HTMLElement | undefined;
      if (option) list.scrollTop = Math.max(Math.min(list.scrollTop, option.offsetTop), option.offsetTop + option.offsetHeight - list.clientHeight);
      showDetail();
    };

    const update = () => {
      found = findFunctions(search.value, group);
      picked = Math.min(picked, Math.max(0, found.length - 1));
      for (const { group: g, button } of groupButtons) button.setAttribute("aria-pressed", String(g === group));
      list.replaceChildren(
        ...found.map((f, i) => {
          const option = el("div", "tp-functions-option");
          option.setAttribute("role", "option");
          option.append(el("code", "", f.name), el("span", "", f.description.split(/(?<=\.)\s/)[0]!));
          option.addEventListener("click", () => {
            picked = i;
            showPicked();
          });
          option.addEventListener("dblclick", () => choose(i));
          return option;
        }),
      );
      if (found.length === 0) list.append(el("p", "tp-functions-none", "No function matches"));
      note.textContent = `${found.length} ${found.length === 1 ? "function" : "functions"}`;
      showPicked();
    };

    search.addEventListener("input", () => {
      picked = 0;
      update();
    });
    // The list's keys stay in the search field: ↑ ↓ pick, Enter inserts
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        picked = Math.max(0, Math.min(found.length - 1, picked + (e.key === "ArrowDown" ? 1 : -1)));
        showPicked();
      } else if (e.key === "Enter") {
        e.preventDefault();
        choose(picked);
      }
    });
    insertButton.addEventListener("click", () => choose(picked));
    cancel.addEventListener("click", () => this.close());

    update();
    this.dialog = this.host.openDialog({
      title: "Functions",
      subtitle: formula,
      className: "tp-functions-dialog",
      content,
      footer,
      focus: search,
      closed: () => {
        this.dialog = undefined;
      },
    });
  }

  close(): void {
    this.dialog?.close();
  }
}
