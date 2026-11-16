// Bilgi sayfası gövdesi (K-73). HTML yorumlanmaz; metin yalnızca React düğümü olarak çizilir
// (dangerouslySetInnerHTML yok). Ayrıştırma: richTextParse.ts
import type { ReactNode } from 'react'
import { parseBody, type TextBlock } from './richTextParse'

export function BlockView({ block }: { block: TextBlock }): ReactNode {
  if (block.kind === 'heading') return <h2>{block.text}</h2>
  if (block.kind === 'list')
    return (
      <ul>
        {block.items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    )
  return <p>{block.lines.join('\n')}</p>
}

export function RichText({ body }: { body: string }) {
  const blocks = parseBody(body)
  return (
    <div className="ui-richtext">
      {blocks.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </div>
  )
}
