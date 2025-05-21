import { parseModule } from "meriyah";

export let fromString = (source) => {
  return parseModule(source, { loc: true, next: true })
}
