// A window counts Unicode code points in the text shown to the model. Replaying
// the same projection from the start avoids relying on origin HTTP Range support.
export const documentWindowSize = 12_000;
export interface DocumentWindow { text: string; nextOffset?: number; }

const hidden = new Set(["script", "style", "svg", "template", "noscript"]);
const blocks = new Set(["address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "footer",
  "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre",
  "section", "table", "td", "th", "title", "tr", "ul"]);
const entities: Record<string, string> = {amp:"&", lt:"<", gt:">", quot:'"', apos:"'", nbsp:" "};
function decodeEntity(token: string): string {
  const name = token.slice(1, -1);
  if (Object.hasOwn(entities, name)) return entities[name]!;
  if (/^#(?:\d+|x[\da-f]+)$/i.test(name)) {
    const point = /^#x/i.test(name) ? parseInt(name.slice(2), 16) : Number(name.slice(1));
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : "�";
  }
  return token;
}

/** Incremental static HTML text extraction. Only a bounded tag name, quote,
 * comment terminator, raw-text terminator and entity prefix cross chunk boundaries. */
class HtmlText {
  private state: "text" | "open" | "tag" | "comment" | "hidden" = "text";
  private name = "";
  private readingName = false;
  private quote = "";
  private previous = "";
  private endTag = "";
  private entity = "";
  private closing = false;
  private space = false;
  private started = false;

  private visible(char: string): string {
    if (/\s/u.test(char)) {
      this.space = this.started;
      return "";
    }
    const result = (this.space ? " " : "") + char;
    this.space = false;
    this.started = true;
    return result;
  }

  *feed(chunk: string, final = false): Generator<string> {
    for (const char of chunk) {
      if (this.state === "comment") {
        this.previous = (this.previous + char).slice(-3);
        if (this.previous === "-->") this.state = "text";
        continue;
      }
      if (this.state === "hidden") {
        // Script data may contain unbalanced quotes, '<' or apparent tags.
        if (this.previous === this.endTag && /[\s/>]/.test(char)) {
          this.state = char === ">" ? "text" : "tag";
          this.readingName = false;
          this.closing = true;
          this.quote = "";
          this.previous = "";
        } else {
          this.previous = (this.previous + char.toLowerCase()).slice(-this.endTag.length);
        }
        continue;
      }
      if (this.state === "open") {
        if (!/[a-z!/?]/i.test(char)) {
          yield this.visible("<");
          this.state = "text";
          // Process the character after the literal '<' as text.
        } else {
          this.state = "tag";
          this.closing = char === "/";
          this.name = this.closing ? "" : char.toLowerCase();
          this.readingName = true;
          this.previous = "";
          this.quote = "";
          continue;
        }
      }
      if (this.state === "tag") {
        if (this.quote) {
          if (char === this.quote) this.quote = "";
        } else if (char === ">") {
          this.state = "text";
          if (blocks.has(this.name)) this.space = this.started;
          if (!this.closing && hidden.has(this.name) && this.previous !== "/") {
            this.state = "hidden";
            this.endTag = "</" + this.name;
          }
          this.previous = "";
          continue;
        } else if (char === '"' || char === "'") {
          this.readingName = false;
          this.quote = char;
        } else if (this.readingName) {
          if (/[\s/]/.test(char)) this.readingName = false;
          else if (this.name.length < 20) this.name += char.toLowerCase();
          if (this.name === "!--") { this.state = "comment"; this.previous = ""; continue; }
        }
        this.previous = char;
        continue;
      }
      if (this.entity) {
        if (char === ";") {
          for (const point of decodeEntity(this.entity + char)) yield this.visible(point);
          this.entity = "";
          continue;
        }
        if (this.entity.length < 32 && /^[#a-z0-9]$/i.test(char)) { this.entity += char; continue; }
        yield this.visible(this.entity);
        this.entity = "";
      }
      if (char === "<") this.state = "open";
      else if (char === "&") this.entity = "&";
      else yield this.visible(char);
    }
    if (final && this.entity) yield this.visible(this.entity);
    if (final && this.state === "open") yield this.visible("<");
  }
}

export async function readDocumentWindow(body: AsyncIterable<Uint8Array>, contentType: string, offset: number): Promise<DocumentWindow> {
  const decoder = new TextDecoder("utf-8", {fatal:true});
  const html = ["text/html", "application/xhtml+xml"].includes(contentType) ? new HtmlText() : undefined;
  let position = 0, text = "";
  function consume(chunk: string, final = false): boolean {
    for (const segment of html ? html.feed(chunk, final) : [chunk]) {
      for (const point of segment) {
        if (position++ < offset) continue;
        if (position - offset > documentWindowSize) return true;
        text += point;
      }
    }
    return false;
  }
  for await (const chunk of body) {
    if (consume(decoder.decode(chunk, {stream:true}))) return {text, nextOffset:offset + documentWindowSize};
  }
  return consume(decoder.decode(), true) ? {text, nextOffset:offset + documentWindowSize} : {text};
}
