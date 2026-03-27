function renderInline(text, keyPrefix) {
  const content = String(text || "");
  const tokens = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)]+(?:\([^\s)]+\))?)/g;
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(content)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${keyPrefix}-${tokens.length}`;

    if (token.startsWith("**") && token.endsWith("**")) {
      tokens.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      tokens.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      tokens.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        tokens.push(
          <a key={key} href={linkMatch[2]} target="_blank" rel="noreferrer">
            {linkMatch[1]}
          </a>
        );
      } else {
        tokens.push(token);
      }
    } else if (/^https?:\/\//i.test(token)) {
      tokens.push(
        <a key={key} href={token} target="_blank" rel="noreferrer">
          {token}
        </a>
      );
    } else {
      tokens.push(token);
    }

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < content.length) {
    tokens.push(content.slice(lastIndex));
  }

  return tokens;
}

function isTableDivider(line) {
  return /^\s*\|?[\s:-]+(?:\|[\s:-]+)+\|?\s*$/.test(line);
}

function isTableRow(line) {
  return String(line || "").includes("|");
}

function parseTable(lines, startIndex) {
  const headerLine = lines[startIndex];
  const dividerLine = lines[startIndex + 1];
  if (!isTableRow(headerLine) || !isTableDivider(dividerLine)) {
    return null;
  }

  const rows = [];
  let index = startIndex;
  while (index < lines.length && isTableRow(lines[index]) && lines[index].trim()) {
    rows.push(
      lines[index]
        .split("|")
        .map((cell) => cell.trim())
        .filter(Boolean)
    );
    index += 1;
  }

  if (rows.length < 2) {
    return null;
  }

  const [headers, , ...body] = rows;
  return {
    nextIndex: index,
    element: (
      <div className="cc-md-table-wrap" key={`table-${startIndex}`}>
        <table className="cc-md-table">
          <thead>
            <tr>
              {headers.map((header, columnIndex) => (
                <th key={`h-${columnIndex}`}>{renderInline(header, `th-${startIndex}-${columnIndex}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, rowIndex) => (
              <tr key={`r-${rowIndex}`}>
                {headers.map((_, columnIndex) => (
                  <td key={`c-${rowIndex}-${columnIndex}`}>
                    {renderInline(row[columnIndex] || "", `td-${startIndex}-${rowIndex}-${columnIndex}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ),
  };
}

export default function ChatMarkdown({ content }) {
  const lines = String(content || "").replace(/\r/g, "").split("\n");
  const blocks = [];

  for (let index = 0; index < lines.length; ) {
    const rawLine = lines[index];
    const line = rawLine.trim();

    if (!line) {
      index += 1;
      continue;
    }

    const table = parseTable(lines, index);
    if (table) {
      blocks.push(table.element);
      index = table.nextIndex;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 4);
      const Tag = `h${level}`;
      blocks.push(
        <Tag className={`cc-md-heading cc-md-h${level}`} key={`heading-${index}`}>
          {renderInline(headingMatch[2], `heading-${index}`)}
        </Tag>
      );
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul className="cc-md-list" key={`list-${index}`}>
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInline(item, `list-${index}-${itemIndex}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index].trim();
      if (!nextLine || /^#{1,6}\s+/.test(nextLine) || /^[-*]\s+/.test(nextLine)) {
        break;
      }
      if (parseTable(lines, index)) {
        break;
      }
      paragraphLines.push(nextLine);
      index += 1;
    }

    blocks.push(
      <p className="cc-md-paragraph" key={`p-${index}`}>
        {renderInline(paragraphLines.join(" "), `p-${index}`)}
      </p>
    );
  }

  return <div className="cc-markdown">{blocks}</div>;
}
