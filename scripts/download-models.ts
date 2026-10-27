// Downloads the local name-finder for the sensitive-info guard into .cache/models
// (108 MB, once). After this the guard runs without the network.
import { loadNameFinder, modelCacheDir, NER_MODEL } from "../lib/aeon/phi-classifier";

const started = Date.now();
console.log(`Downloading ${NER_MODEL} into ${modelCacheDir()} ...`);
const ner = await loadNameFinder();
await ner("Warm-up sentence for Dana Reyes.");
console.log(`Ready in ${Math.round((Date.now() - started) / 1000)}s.`);
