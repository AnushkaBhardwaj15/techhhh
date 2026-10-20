export function LoadingMessage({ children = 'Checking your session…', inline = false }: { children?: string; inline?: boolean }) {
  const Element = inline ? 'div' : 'main';
  return <Element aria-live="polite" className="feedback" role={inline ? 'status' : undefined}><p>{children}</p></Element>;
}

export function ErrorMessage({ children, inline = false }: { children: string; inline?: boolean }) {
  const Element = inline ? 'div' : 'main';
  return <Element className="feedback">{!inline && <h1>We could not load this page.</h1>}<p role="alert">{children}</p></Element>;
}
