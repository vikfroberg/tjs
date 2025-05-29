import path from "path";
import chalk from "chalk";
import { ok, error } from "../result.mjs";
import * as E from "../error.mjs";
import util from "util";
import Env from "./env.mjs";
import * as T from "./types.mjs";

export {
  string as tString,
  number as tNumber,
  bool as tBoolean,
  funN as tFunN,
  typeVar as tVar,
  scheme as tScheme,
} from "./types.mjs";
export { default as Env } from "./env.mjs";
