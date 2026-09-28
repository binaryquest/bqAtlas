import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  model,
  signal,
} from "@angular/core";
import { FormValueControl } from "@angular/forms/signals";
import { AtlasChoiceState } from "./choice-controls";
import { AtlasButton, AtlasInput } from "./primitives";
export interface AtlasRichBlock {
  id: string;
  kind: "paragraph" | "heading" | "bullet";
  text: string;
  bold?: boolean;
  italic?: boolean;
}
export interface AtlasRichDocument {
  blocks: AtlasRichBlock[];
}
/** Plain structured content only: no HTML, scripts, style strings, URLs or embedded objects. */
export function atlasRichText(document: AtlasRichDocument): string {
  return document.blocks.map((block) => block.text).join("\n");
}
export function atlasUpdateRichBlock(
  document: AtlasRichDocument,
  id: string,
  patch: Partial<Pick<AtlasRichBlock, "kind" | "text" | "bold" | "italic">>,
): AtlasRichDocument {
  return {
    blocks: document.blocks.map((block) =>
      block.id === id ? { ...block, ...patch } : block,
    ),
  };
}
@Component({
  selector: "atlas-rich-text",
  imports: [AtlasButton, AtlasInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { "(focusout)": "touch.emit()" },
  template: `
    <fieldset
      class="atlas-rich-editor"
      [id]="controlId()"
      [disabled]="disabled()"
      [attr.aria-invalid]="invalid() && touched()"
      [attr.aria-describedby]="describedBy()"
    >
      <legend>{{ label() }}</legend>
      <div class="atlas-rich-tools">
        <button
          atlasButton
          type="button"
          [disabled]="readonly()"
          (click)="add()"
        >
          Add paragraph</button
        ><span class="atlas-muted"
          >{{ text().length }} characters · Structured content</span
        >
      </div>
      @for (block of value().blocks; track block.id) {
        <div class="atlas-rich-block">
          <div class="atlas-rich-tools">
            <label
              >Block {{ $index + 1 }} type<select
                atlasInput
                [value]="block.kind"
                [disabled]="readonly()"
                (change)="edit(block.id, { kind: $any($event.target).value })"
              >
                <option value="paragraph">Paragraph</option>
                <option value="heading">Heading</option>
                <option value="bullet">Bullet</option>
              </select></label
            >
            <button
              atlasButton
              type="button"
              [disabled]="readonly()"
              [attr.aria-label]="'Bold block ' + ($index + 1)"
              [attr.aria-pressed]="!!block.bold"
              (click)="edit(block.id, { bold: !block.bold })"
            >
              <strong>B</strong>
            </button>
            <button
              atlasButton
              type="button"
              [disabled]="readonly()"
              [attr.aria-label]="'Italic block ' + ($index + 1)"
              [attr.aria-pressed]="!!block.italic"
              (click)="edit(block.id, { italic: !block.italic })"
            >
              <em>I</em>
            </button>
            <button
              atlasButton
              type="button"
              [disabled]="readonly() || $first"
              [attr.aria-label]="'Move block ' + ($index + 1) + ' up'"
              (click)="move(block.id, -1)"
            >
              ↑</button
            ><button
              atlasButton
              type="button"
              [disabled]="readonly() || $last"
              [attr.aria-label]="'Move block ' + ($index + 1) + ' down'"
              (click)="move(block.id, 1)"
            >
              ↓
            </button>
            <button
              atlasButton
              type="button"
              [disabled]="readonly()"
              [attr.aria-label]="'Remove block ' + ($index + 1)"
              (click)="remove(block.id)"
            >
              Remove
            </button>
          </div>
          <textarea
            atlasInput
            [attr.aria-label]="'Block ' + ($index + 1) + ' text'"
            [value]="block.text"
            [readOnly]="readonly()"
            rows="3"
            (input)="edit(block.id, { text: $any($event.target).value })"
          ></textarea>
        </div>
      } @empty {
        <p>No text blocks. Add a paragraph to begin.</p>
      }
      <section class="atlas-rich-preview" aria-label="Formatted preview">
        <h4>Formatted preview</h4>
        @for (block of value().blocks; track block.id) {
          @switch (block.kind) {
            @case ("heading") {
              <h3
                [class.atlas-rich-bold]="block.bold"
                [class.atlas-rich-italic]="block.italic"
              >
                {{ block.text }}
              </h3>
            }
            @case ("bullet") {
              <ul>
                <li
                  [class.atlas-rich-bold]="block.bold"
                  [class.atlas-rich-italic]="block.italic"
                >
                  {{ block.text }}
                </li>
              </ul>
            }
            @default {
              <p
                [class.atlas-rich-bold]="block.bold"
                [class.atlas-rich-italic]="block.italic"
              >
                {{ block.text }}
              </p>
            }
          }
        }
      </section>
      <p role="status">{{ message() }}</p>
    </fieldset>
  `,
})
export class AtlasRichText
  extends AtlasChoiceState
  implements FormValueControl<AtlasRichDocument>
{
  readonly value = model<AtlasRichDocument>({ blocks: [] });
  readonly message = signal("");
  readonly text = computed(() => atlasRichText(this.value()));
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private sequence = 0;
  override focus(options?: FocusOptions) {
    this.element.nativeElement
      .querySelector<HTMLElement>("textarea,button")
      ?.focus(options);
  }
  edit(
    id: string,
    patch: Partial<Pick<AtlasRichBlock, "kind" | "text" | "bold" | "italic">>,
  ) {
    if (this.disabled() || this.readonly()) return;
    this.value.set(atlasUpdateRichBlock(this.value(), id, patch));
    this.touch.emit();
  }
  add() {
    if (this.disabled() || this.readonly()) return;
    let id: string;
    do {
      id = `block-${++this.sequence}`;
    } while (this.value().blocks.some((block) => block.id === id));
    this.value.update((value) => ({
      blocks: [...value.blocks, { id, kind: "paragraph", text: "" }],
    }));
    this.message.set("Paragraph added.");
    this.touch.emit();
  }
  remove(id: string) {
    if (this.disabled() || this.readonly()) return;
    this.value.update((value) => ({
      blocks: value.blocks.filter((block) => block.id !== id),
    }));
    this.message.set("Block removed.");
    this.touch.emit();
  }
  move(id: string, direction: number) {
    if (this.disabled() || this.readonly()) return;
    const blocks = [...this.value().blocks],
      index = blocks.findIndex((block) => block.id === id),
      to = index + direction;
    if (index < 0 || to < 0 || to >= blocks.length) return;
    [blocks[index], blocks[to]] = [blocks[to], blocks[index]];
    this.value.set({ blocks });
    this.message.set(`Block moved to position ${to + 1}.`);
    this.touch.emit();
  }
}
