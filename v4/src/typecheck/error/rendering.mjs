let formatN = (n) =>
  n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;
let pluralize = (word, count) => (count === 1 ? word : word + "s");

import * as E from "../../error.mjs";
import { stringify } from "../types/data.mjs";

export default function renderError(error, module) {
  switch (error.type) {
    case "unsupported": {
      return E.stack({ spacing: 2 }, [
        E.header("UNSUPPORTED", module.relativeFilePath),
        E.reflow("You used a feature that is not supported"),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            "This feature is most likely not supported because it makes it harder to type check or it's encuraged not to be used.",
          ),
        ]),
        process.env.NODE_ENV === "development"
          ? E.reflow(
              E.hint(
                `If you're a compiler developer you might want to know that this happened in the ${E.type(error.context.stage)} stage on node type ${E.type(error.node.type)}.`,
              ),
            )
          : undefined,
      ]);
    }
    case "binaryExpressionMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on different types:`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
        E.hint(
          "Implicit casting is not allowed, you must explicitly cast the types.",
        ),
      ]);
    }
    case "binaryExpressionUnsupportedType": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
      ]);
    }
    case "unaryExpressionUnsupportedType": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `I cannot perform ${E.operator(error.node.operator)} on ${E.type(stringify(error.context.left))}`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
          E.reflow(
            `The ${E.operator(error.node.operator)} operator only works on ${error.context.types.map((t) => E.type(stringify(t))).join(" | ")}.`,
          ),
        ]),
      ]);
    }
    case "arityMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("ARITY MISMATCH", module.relativeFilePath),
        E.reflow(
          `${
            error.context.fnName
              ? `The \`${error.context.fnName}\` function`
              : "This function"
          } expects ${error.context.expectedArity} ${pluralize("argument", error.context.expectedArity)} but got ${error.context.actualArity} instead.`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.node.loc.start.line - 1],
            error.node.loc,
          ),
        ]),
      ]);
    }
    case "paramMismatch": {
      return E.stack({ spacing: 2 }, [
        E.header("TYPE MISMATCH", module.relativeFilePath),
        E.reflow(
          `The ${formatN(error.context.paramIndex + 1)} argument to \`${error.context.fnName || "this function"}\` is not what I expect:`,
        ),
        E.stack({}, [
          E.highlightCode(
            module.sourceLines[error.context.actualParamLoc.start.line - 1],
            error.context.actualParamLoc,
          ),
          E.reflow(
            `This argument is of type ${E.type(stringify(error.context.actualParamType))}.`,
          ),
        ]),
        E.reflow(
          `But \`${error.context.fnName}\` needs the ${formatN(error.context.paramIndex + 1)} argument to be of type ${E.type(stringify(error.context.expectedParamType))}.`,
        ),
      ]);
    }
  }
}
