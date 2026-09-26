import { Directive, ElementRef, inject } from "@angular/core";

/**
 * Reusable continuous-cell navigation for a native table; owns no data or save state.
 * Use one tbody, stable columns, and an immediate overflow:auto wrapper.
 * Mark one input/button or AtlasLookup host per editable td with data-sheet-editor.
 * For lookups use arrowNavigation="grid" and clearable=false.
 * Integration guide and complete example: docs/controls/DATASHEET-INTEGRATION.md.
 */
@Directive({
  selector: "table[atlasDatasheet]",
  host: { class: "atlas-datasheet", "(keydown)": "navigate($event)" },
})
export class AtlasDatasheet {
  private readonly element = inject<ElementRef<HTMLTableElement>>(ElementRef);
  navigate(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (
      event.defaultPrevented ||
      event.isComposing ||
      event.altKey ||
      target.closest("[popover]")
    )
      return;
    const table = this.element.nativeElement;
    const cells = Array.from(
      table.querySelectorAll<HTMLElement>("[data-sheet-editor]"),
    )
      .map((el) =>
        el.matches("input,button,select,textarea")
          ? el
          : el.querySelector<HTMLElement>("[role=combobox]")!,
      )
      .filter(
        (el) => el && !el.matches(":disabled") && !el.closest("[hidden]"),
      );
    const index = cells.indexOf(target);
    if (index < 0) return;
    let next: HTMLElement | undefined;
    if (event.key === "Tab") next = cells[index + (event.shiftKey ? -1 : 1)];
    else if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey
    ) {
      const row = target.closest("tr");
      const candidate = cells[index + (event.key === "ArrowLeft" ? -1 : 1)];
      if (candidate?.closest("tr") === row) next = candidate;
      event.preventDefault(); // Keep focus at the row boundary; Tab wraps rows.
    } else if ((event.ctrlKey || event.metaKey) && event.key === "Home")
      next = cells[0];
    else if ((event.ctrlKey || event.metaKey) && event.key === "End")
      next = cells.at(-1);
    else if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      (event.key === "Enter" && target.tagName === "INPUT")
    ) {
      const row = target.closest("tr")!;
      const column = target.closest("td")!.cellIndex;
      const rows = Array.from(table.tBodies[0].rows);
      const delta =
        event.key === "ArrowUp" || (event.key === "Enter" && event.shiftKey)
          ? -1
          : 1;
      for (
        let r = rows.indexOf(row) + delta;
        r >= 0 && r < rows.length;
        r += delta
      ) {
        next = cells.find((el) => el.closest("td") === rows[r].cells[column]);
        if (next) break;
      }
      event.preventDefault(); // Prevent numeric spinners even at a row boundary.
    }
    if (next) {
      event.preventDefault();
      next.focus({ preventScroll: true });
      // Only scroll the datasheet region; never scroll the desktop canvas.
      const scroll = table.parentElement!;
      const a = next.getBoundingClientRect(),
        b = scroll.getBoundingClientRect();
      if (a.bottom > b.bottom) scroll.scrollTop += a.bottom - b.bottom;
      if (a.top < b.top + 32) scroll.scrollTop -= b.top + 32 - a.top;
      if (a.right > b.right) scroll.scrollLeft += a.right - b.right;
      if (a.left < b.left) scroll.scrollLeft -= b.left - a.left;
      if (next instanceof HTMLInputElement && next.type !== "number")
        next.select();
    }
  }
}
