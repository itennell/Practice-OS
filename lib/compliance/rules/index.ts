import { ruleSchema, type Rule } from "../types";
import { IL_RULES } from "./il";
import { US_RULES } from "./us";

// Every rule we ship, maintainer-verified. Rules the state-research skill
// writes for other states live in the database and join these at runtime.
export const SHIPPED_RULES: Rule[] = [...US_RULES, ...IL_RULES].map((r) => ruleSchema.parse(r));
