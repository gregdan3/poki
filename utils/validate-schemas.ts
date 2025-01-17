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
    "original-title": z.string().nullish(),
    description: z.string().nullish(),
    authors: z.array(z.string()).nonempty().nullish(),
    translators: z.array(z.string()).nullish(),
    proofreaders: z.array(z.string()).nullish(),
    // Date is required for all except `unknown-year/unknown-month`.
    // Do this better somehow?
    // TODO: replace Unknown with null
    date: z
      .union([
        z.string().date(),
        z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Invalid yyyy-mm format"),
        z.literal("Unknown"),
      ])
      .nullish(),
    tags: z.array(z.string()).nullish(),
    // missing license -> "assume All rights reserved, but
    // its also possible we aren't yet aware of the correct license"
    license: z.string().nullish(),
    sources: z.array(z.string()).nonempty().nullish(),
    archives: z.array(z.string()).nullish(),
    // Intended to be string only. TODO cleanup.
    preprocessing: z.string().nullish().or(z.array(z.string())),
    "accessibility-notes": z.string().nullish(),
    notes: z.string().nullish(),
  })
  .strict(); // reject additional fields

const Collection = z
  .object({
    name: z.string(),
    sources: z.array(z.string()).optional(),
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
      for (let issue of (error as ZodError).issues) {
        console.log(issue);
      }
      console.log("===========================================");
    }
    throw new Error("Files above are invalid");
  }
}

validate();
