import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "lib", "client.js");
const require = createRequire(import.meta.url);

/** The only modules a bundle may resolve, mirroring the platform seed table. */
const seed = {
  react: require("react"),
  "react-dom": require("react-dom"),
  "react/jsx-runtime": require("react/jsx-runtime"),
};

test(
  "client bundle registers its factory and exposes the plugin face",
  { skip: existsSync(bundle) ? false : "run pnpm build first" },
  () => {
    const source = readFileSync(bundle, "utf8");
    let registration;
    // The bundle is a classic script, not a module, so it must run in a plain
    // script context. A fresh vm context also keeps `window` out of the test
    // process's own global.
    runInNewContext(source, {
      window: {
        __ModuleLoader__: {
          load: (value) => {
            registration = value;
          },
        },
      },
    });

    assert.ok(registration !== undefined, "the bundle must call window.__ModuleLoader__.load");
    // A mismatch makes the loader reject the bundle with
    // `loaded without registering "<id>" via __ModuleLoader__.load`.
    // The id is the bundle identity in cordis.patch.yml, deliberately decoupled
    // from the npm package name (`@nakus0426/dsh-font`) so persisted settings
    // (keyed by this id) survive a package rename.
    assert.equal(
      registration.id,
      "dsh-font",
      "the registration id must equal the bundle id in cordis.patch.yml",
    );

    const exports = registration.factory((specifier) => {
      if (specifier in seed) return seed[specifier];
      // The loader resolves only seed words, the boot graph, and own chunks; an
      // undeclared specifier throws at materialization instead of at build time.
      throw new Error(`bundle required a module outside the platform seed table: ${specifier}`);
    });

    assert.equal(typeof exports.apply, "function", "the client half must export apply");
    // `exports.inject` is built inside the vm realm, whose Array prototype differs,
    // so copy it into this realm before comparing.
    assert.deepEqual(Array.from(exports.inject ?? []), ["slots", "locale", "configForms"]);
  },
);
