import { glob } from "glob";
import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { z, ZodError } from "zod";
import { parseMarkdown } from "./parse-md";

const noPath = (val: string) =>
  `Collection includes path ${val}; such a file does not exist`;

const Article = z
  .object({
    title: z.string(),
    // NOTE: original-title may not exist, e.g. meli en mije li tawa
    "original-title": z.string().optional(),
    description: z.string().optional(),
    authors: z.array(z.string()).nonempty().optional(),
    translators: z.array(z.string()).nonempty().optional(),
    proofreaders: z.array(z.string()).nonempty().optional(),
    // Date is required for all except `unknown-year/unknown-month`.
    // Those still have to specify null explicitly
    date: z.union([
      z.string().date(),
      z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid yyyy-mm format"),
      z.null(),
    ]),
    tags: z.array(z.string()).nonempty().optional(),
    // missing license -> "assume All rights reserved, but
    // its also possible we aren't yet aware of the correct license"
    license: z.string().nullable(), // TODO: SPDX compliance
    sources: z.array(z.string()).nonempty().optional(),
    archives: z.array(z.string()).nonempty().optional(),
    preprocessing: z.string().optional(),
    "accessibility-notes": z.string().optional(),
    notes: z.string().optional(),
  })
  .strict() // reject additional fields
  // TODO: it just says "Invalid input" when this refine fails to be met
  .refine((data) => data.authors || data.translators);

const Collection = z
  .object({
    name: z.string(),
    sources: z.array(z.string()).nonempty().optional(),
    // not optional; can be empty for upcoming collections
    items: z
      .array(
        z.string().refine(
          (val) => existsSync(`../${val}`),
          (val) => ({ message: noPath(val) }),
        ),
      )
      .nullable(),
  })
  .strict();

async function validateMarkdown(filepath: string) {
  try {
    let article = readFileSync(filepath, "utf8");
    let [meta, content] = await parseMarkdown(article);
    Article.parse(meta);
  } catch (e) {
    errors.push([filepath, e as Error]);
  }
}

var errors: [string, Error][] = [];

function validateCollection(filepath: string) {
  try {
    let collection = parseYaml(readFileSync(filepath, "utf8"));
    Collection.parse(collection);
  } catch (e) {
    errors.push([filepath, e as Error]);
  }
}

async function validate() {
  for (let filepath of await glob("../collections/**/*.yaml")) {
    validateCollection(filepath);
  }
  for (let filepath of await glob("../plaintext/**/*.md")) {
    // this can be parallelised, but meh
    await validateMarkdown(filepath);
  }
  if (errors.length) {
    for (let [filepath, error] of errors) {
      console.log(filepath, ":");
      // console.log(error);
      for (let issue of (error as ZodError).issues) {
        console.log(issue);
      }
      console.log("===========================================");
    }
    throw new Error("Files above are invalid");
  }
}

validate();
