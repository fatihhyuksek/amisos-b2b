// Bilgi sayfası gövdesi ayrıştırıcısı (K-73). Düz metin: boş satır = paragraf, "## " = alt başlık, "- " = madde.

export type TextBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'list'; items: string[] }

export function parseBody(body: string): TextBlock[] {
  const blocks: TextBlock[] = []
  let para: string[] = []
  let list: string[] = []
  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', lines: para })
    if (list.length) blocks.push({ kind: 'list', items: list })
    para = []
    list = []
  }
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd()
    if (line.trim() === '') flush()
    else if (line.startsWith('## ')) {
      flush()
      blocks.push({ kind: 'heading', text: line.slice(3).trim() })
    } else if (line.startsWith('- ')) {
      if (para.length) flush()
      list.push(line.slice(2).trim())
    } else {
      if (list.length) flush()
      para.push(line.trim())
    }
  }
  flush()
  return blocks
}

/** SSS: her "## " başlığı bir soru, sonraki bloklar cevaptır. Başlıktan önceki metin giriş olur. */
export function parseFaq(body: string): {
  intro: TextBlock[]
  items: { question: string; answer: TextBlock[] }[]
} {
  const intro: TextBlock[] = []
  const items: { question: string; answer: TextBlock[] }[] = []
  for (const b of parseBody(body)) {
    if (b.kind === 'heading') items.push({ question: b.text, answer: [] })
    else if (items.length) items[items.length - 1].answer.push(b)
    else intro.push(b)
  }
  return { intro, items }
}
