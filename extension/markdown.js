// Render a small Markdown subset using DOM nodes only; never interpret model HTML.
globalThis.renderChatMarkdown = function (container, text, citations = []) {
  const sources = [];
  const safeUrl = value => {
    try { const url = new URL(value); return /^(https?:)$/.test(url.protocol) ? url.href : null; } catch { return null; }
  };
  let cursor = 0, source = "";
  for (const citation of [...citations].sort((a, b) => a.start - b.start)) {
    if (!Number.isInteger(citation.start) || !Number.isInteger(citation.end) || citation.start < cursor || citation.end <= citation.start || citation.end > text.length || !safeUrl(citation.url)) continue;
    source += text.slice(cursor, citation.start).replace(/[\uE000\uE001]/g, "");
    source += `\uE000${sources.length}\uE001`;
    sources.push(citation);
    cursor = citation.end;
  }
  source += text.slice(cursor).replace(/[\uE000\uE001]/g, "");
  function link(parent, label, url, title) {
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
    a.textContent = label;
    if (title) a.title = title;
    parent.append(a);
  }
  function inline(parent, value, depth = 0) {
    if (depth > 12) { parent.append(document.createTextNode(value)); return; }
    const tokens = /\uE000(\d+)\uE001|`([^`\n]+)`|\[([^\]\n]+)\]\(([^\s)]+)\)|\*\*([^\n]+?)\*\*|__([^\n]+?)__|\*([^*\n]+)\*|_([^_\n]+)_|~~([^\n]+?)~~/g;
    let end = 0;
    for (const match of value.matchAll(tokens)) {
      parent.append(document.createTextNode(value.slice(end, match.index)));
      if (match[1] !== undefined) {
        const citation = sources[Number(match[1])];
        if (citation) link(parent, `[${citation.title}]`, citation.url, citation.title);
      } else if (match[2] !== undefined) {
        const code = document.createElement("code"); code.textContent = match[2]; parent.append(code);
      } else if (match[3] !== undefined) {
        const url = safeUrl(match[4]);
        if (url) link(parent, match[3], url);
        else parent.append(document.createTextNode(match[0]));
      } else {
        const tag = match[5] !== undefined || match[6] !== undefined ? "strong" : match[9] !== undefined ? "del" : "em";
        const node = document.createElement(tag);
        inline(node, match[5] ?? match[6] ?? match[7] ?? match[8] ?? match[9], depth + 1);
        parent.append(node);
      }
      end = match.index + match[0].length;
    }
    parent.append(document.createTextNode(value.slice(end)));
  }
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  let paragraph = null;
  let lists = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { paragraph = null; continue; }
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      paragraph = null; lists = [];
      const code = document.createElement("code"), pre = document.createElement("pre"), body = [];
      while (++i < lines.length && !new RegExp(`^\\s*${fence[1][0]}{${fence[1].length},}\\s*$`).test(lines[i])) body.push(lines[i]);
      code.textContent = body.join("\n"); pre.append(code); container.append(pre); continue;
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s+(.+?)(?:\s+#+)?$/);
    const item = line.match(/^([ \t]*)(?:([-+*])|(\d+)[.)])[ \t]+(.+)$/);
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (heading || quote || /^\s*(?:---+|\*\*\*+|___+)\s*$/.test(line)) {
      paragraph = null; lists = [];
      const node = document.createElement(heading ? `h${heading[1].length}` : quote ? "blockquote" : "hr");
      if (heading || quote) inline(node, heading ? heading[2] : quote[1]);
      container.append(node);
    } else if (item) {
      paragraph = null;
      const indent = item[1].replace(/\t/g, "    ").length;
      const tag = item[2] ? "ul" : "ol";
      while (lists.length && lists.at(-1).indent > indent) lists.pop();
      if (lists.at(-1)?.indent === indent && lists.at(-1).node.localName !== tag) lists.pop();
      if (!lists.length || lists.at(-1).indent < indent) {
        const node = document.createElement(tag);
        if (tag === "ol") node.start = Number(item[3]);
        (lists.at(-1)?.lastItem || container).append(node);
        lists.push({ indent, node, lastItem: null });
      }
      const li = document.createElement("li"); inline(li, item[4]);
      lists.at(-1).node.append(li);
      lists.at(-1).lastItem = li;
    } else {
      const indent = line.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
      if (lists.length && indent > lists.at(-1).indent) {
        const parent = lists.at(-1).lastItem;
        parent.append(document.createElement("br"));
        inline(parent, line.trimStart());
        continue;
      }
      lists = [];
      if (!paragraph) { paragraph = document.createElement("p"); container.append(paragraph); }
      else paragraph.append(document.createElement("br"));
      inline(paragraph, line);
    }
  }
};
