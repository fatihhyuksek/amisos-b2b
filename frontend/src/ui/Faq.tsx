// SSS gösterimi (K-73): her "## " başlığı bir soru (akordeon), altındaki bloklar cevap.
import { Icon } from './Icon'
import { parseFaq } from './richTextParse'
import { BlockView, RichText } from './RichText'

export function Faq({ body }: { body: string }) {
  const { intro, items } = parseFaq(body)
  return (
    <>
      {intro.map((b, i) => (
        <div key={i} className="ui-richtext">
          <BlockView block={b} />
        </div>
      ))}
      {items.length === 0 ? (
        <RichText body={body} />
      ) : (
        <div className="ui-accordions">
          {items.map((it, i) => (
            <details key={i} className="ui-acc">
              <summary>
                <h2>{it.question}</h2>
                <Icon name="chevronDown" />
              </summary>
              <div className="ui-acc__body ui-richtext">
                {it.answer.map((b, j) => (
                  <BlockView key={j} block={b} />
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  )
}
