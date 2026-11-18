// react-dom ships no types here and the project does not depend on @types/react-dom; the head test only needs this one function.
declare module "react-dom/server" {
  export function renderToStaticMarkup(element: unknown): string;
}
